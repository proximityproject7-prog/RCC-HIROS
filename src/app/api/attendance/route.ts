import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireAuth,
  requirePermission,
} from "@/lib/auth-token";
import { evaluateGeofence } from "@/lib/geolocation";

// ═══════════════════════════════════════════════════════════════
// GET  /api/attendance  attendance.view
//   Filters: date, dateFrom, dateTo, groupId, roleId, status,
//            employeeId, scope=mine|all
//   status "no_clock_in" → diff active employees against records.
//   Group scoping based on scopeAllAttendance.
//
// POST /api/attendance  attendance.clock_in
//   { action: clock_in|clock_out, lat?, lng? }
//   Evaluate geofence. Upsert today's record. Prevent double in/out.
// ═══════════════════════════════════════════════════════════════

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "attendance.view");
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    const groupId = searchParams.get("groupId") || undefined;
    const roleId = searchParams.get("roleId") || undefined;
    const status = searchParams.get("status") || undefined;
    const employeeId = searchParams.get("employeeId") || undefined;
    const scope = searchParams.get("scope") || "mine";

    // Determine effective scope: "all" requires attendance.view_all or scopeAllAttendance
    let effectiveScope: "mine" | "all" = "mine";
    if (scope === "all") {
      if (
        user.isSystem ||
        user.permissions.includes("attendance.view_all") ||
        user.scopeAllAttendance
      ) {
        effectiveScope = "all";
      } else if (user.groupId) {
        // Limited to own group — keep "all" semantics but force groupId
        effectiveScope = "all";
      } else {
        effectiveScope = "mine";
      }
    }

    // Build the "where" for attendance records
    const where: Record<string, unknown> = {};

    if (effectiveScope === "mine") {
      where.employeeId = user.id;
    } else {
      // Group scoping for "all"
      if (!user.scopeAllAttendance && !user.isSystem && !user.permissions.includes("attendance.view_all")) {
        if (user.groupId) {
          where.employee = { groupId: user.groupId };
        } else {
          where.employeeId = user.id;
        }
      }
    }

    // Date filters
    if (dateParam) {
      const d = new Date(dateParam);
      if (!isNaN(d.getTime())) {
        where.date = {
          gte: startOfDay(d),
          lte: endOfDay(d),
        };
      }
    } else {
      const range: Record<string, Date> = {};
      if (dateFromParam) {
        const d = new Date(dateFromParam);
        if (!isNaN(d.getTime())) range.gte = startOfDay(d);
      }
      if (dateToParam) {
        const d = new Date(dateToParam);
        if (!isNaN(d.getTime())) range.lte = endOfDay(d);
      }
      if (Object.keys(range).length > 0) where.date = range;
    }

    if (groupId) where.employee = { ...(where.employee as object || {}), groupId };
    if (roleId)
      where.employee = { ...(where.employee as object || {}), roleId };
    if (employeeId) {
      // Verify the requested employee belongs to the user's group when not system/scopeAll
      if (!user.isSystem && !user.scopeAllAttendance && user.groupId) {
        const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { groupId: true } });
        if (!emp || emp.groupId !== user.groupId) {
          return NextResponse.json({ attendance: [] });
        }
      }
      where.employeeId = employeeId;
    }

    // Status filter on attendance records
    if (status && status !== "no_clock_in") {
      if (status === "clocked_in") {
        where.clockInAt = { not: null };
        where.clockOutAt = null;
      } else if (status === "clocked_out") {
        where.clockOutAt = { not: null };
      }
    }

    // Hide system admin from attendance records for non-system-admin users
    if (!user.isSystem) {
      const empFilter = (where.employee as Record<string, unknown>) || {};
      where.employee = { ...empFilter, role: { isSystem: false } };
    }

    let records = await db.attendance.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            groupId: true,
            group: { select: { id: true, name: true, code: true } },
            role: { select: { id: true, name: true } },
          },
        },
        editedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { date: "desc" },
    });

    // Edge case: status=no_clock_in — fetch active employees and diff
    if (status === "no_clock_in") {
      // Determine the target date — default today if no date filter set
      let targetDate: Date;
      if (dateParam) {
        targetDate = new Date(dateParam);
      } else if (dateFromParam && !dateToParam) {
        targetDate = new Date(dateFromParam);
      } else {
        targetDate = new Date();
      }
      const dayStart = startOfDay(targetDate);
      const dayEnd = endOfDay(targetDate);

      // All active employees in scope
      const empWhere: Record<string, unknown> = { active: true };
      if (effectiveScope === "mine") {
        empWhere.id = user.id;
      } else if (!user.scopeAllAttendance && !user.isSystem && !user.permissions.includes("attendance.view_all")) {
        if (user.groupId) empWhere.groupId = user.groupId;
        else empWhere.id = user.id;
      }
      if (groupId) empWhere.groupId = groupId;
      if (roleId) empWhere.roleId = roleId;
      if (employeeId) empWhere.id = employeeId;

      // Hide system admin from no_clock_in list for non-system-admin users
      if (!user.isSystem) {
        empWhere.role = { isSystem: false };
      }

      const employees = await db.employee.findMany({
        where: empWhere,
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          groupId: true,
          group: { select: { id: true, name: true, code: true } },
          role: { select: { id: true, name: true } },
        },
      });

      // Find existing records for that day
      const existingForDay = await db.attendance.findMany({
        where: { date: { gte: dayStart, lte: dayEnd } },
        select: { employeeId: true },
      });
      const hasRecord = new Set(existingForDay.map((r) => r.employeeId));

      // Build synthetic "no_clock_in" records
      records = employees
        .filter((e) => !hasRecord.has(e.id))
        .map((e) => ({
          id: `synthetic-${e.id}-${dayStart.toISOString()}`,
          employeeId: e.id,
          date: dayStart,
          clockInAt: null,
          clockOutAt: null,
          clockInLat: null,
          clockInLng: null,
          clockInOnPremise: null,
          clockInDistance: null,
          clockOutLat: null,
          clockOutLng: null,
          clockOutOnPremise: null,
          clockOutDistance: null,
          biometricVerified: false,
          manuallyEdited: false,
          editRemarks: null,
          editedById: null,
          editedBy: null,
          employee: e,
          createdAt: dayStart,
          updatedAt: dayStart,
        })) as unknown as typeof records;
    }

    return NextResponse.json({
      attendance: records.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employee: r.employee
          ? {
              id: r.employee.id,
              employeeId: r.employee.employeeId,
              firstName: r.employee.firstName,
              lastName: r.employee.lastName,
              groupId: r.employee.groupId,
              group: r.employee.group,
              role: r.employee.role,
            }
          : null,
        date: r.date.toISOString(),
        clockInAt: r.clockInAt?.toISOString() ?? null,
        clockOutAt: r.clockOutAt?.toISOString() ?? null,
        clockInLat: r.clockInLat,
        clockInLng: r.clockInLng,
        clockInOnPremise: r.clockInOnPremise,
        clockInDistance: r.clockInDistance,
        clockOutLat: r.clockOutLat,
        clockOutLng: r.clockOutLng,
        clockOutOnPremise: r.clockOutOnPremise,
        clockOutDistance: r.clockOutDistance,
        biometricVerified: r.biometricVerified,
        manuallyEdited: r.manuallyEdited,
        editRemarks: r.editRemarks,
        editedById: r.editedById,
        editedBy: r.editedBy
          ? {
              id: r.editedBy.id,
              name: `${r.editedBy.firstName} ${r.editedBy.lastName}`.trim(),
            }
          : null,
        status:
          r.clockOutAt !== null
            ? "clocked_out"
            : r.clockInAt !== null
              ? "clocked_in"
              : "no_clock_in",
      })),
    });
  } catch (error) {
    console.error("[API /attendance GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "attendance.clock_in");
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const body = await request.json();
    const { action, lat, lng, clientDate } = body as {
      action?: string;
      lat?: number;
      lng?: number;
      clientDate?: string; // YYYY-MM-DD from client's local timezone
    };

    if (action !== "clock_in" && action !== "clock_out") {
      return NextResponse.json(
        { error: "Action must be 'clock_in' or 'clock_out'" },
        { status: 400 }
      );
    }

    const now = new Date();
    // Use client-provided date if available (fixes timezone issues)
    // Otherwise fall back to server's local date
    const todayDate = clientDate ? new Date(clientDate + "T00:00:00") : now;
    const dayStart = startOfDay(todayDate);
    const dayEnd = endOfDay(todayDate);

    // Find today's record
    const existing = await db.attendance.findFirst({
      where: {
        employeeId: user.id,
        date: { gte: dayStart, lte: dayEnd },
      },
    });

    if (action === "clock_in") {
      if (existing && existing.clockInAt) {
        return NextResponse.json(
          { error: "You have already clocked in today" },
          { status: 400 }
        );
      }

      // Evaluate geofence (if coordinates provided)
      let onPremise: boolean | null = null;
      let distance: number | null = null;
      if (typeof lat === "number" && typeof lng === "number") {
        const geo = await evaluateGeofence(lat, lng);
        onPremise = geo.onPremise;
        distance = geo.distance;
      }

      // Use the @@unique([employeeId, date]) compound key for upsert
      const record = await db.attendance.upsert({
        where: {
          employeeId_date: { employeeId: user.id, date: dayStart },
        },
        update: {
          clockInAt: now,
          clockInLat: typeof lat === "number" ? lat : null,
          clockInLng: typeof lng === "number" ? lng : null,
          clockInOnPremise: onPremise,
          clockInDistance: distance,
        },
        create: {
          employeeId: user.id,
          date: dayStart,
          clockInAt: now,
          clockInLat: typeof lat === "number" ? lat : null,
          clockInLng: typeof lng === "number" ? lng : null,
          clockInOnPremise: onPremise,
          clockInDistance: distance,
        },
      });

      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "Clock In",
          entity: "Attendance",
          entityId: record.id,
          metadata: JSON.stringify({
            onPremise,
            distance,
            lat,
            lng,
          }),
        },
      });

      return NextResponse.json({ attendance: record }, { status: 201 });
    }

    // action === clock_out
    if (!existing || !existing.clockInAt) {
      return NextResponse.json(
        { error: "You have not clocked in yet today" },
        { status: 400 }
      );
    }
    if (existing.clockOutAt) {
      return NextResponse.json(
        { error: "You have already clocked out today" },
        { status: 400 }
      );
    }

    let onPremise: boolean | null = null;
    let distance: number | null = null;
    if (typeof lat === "number" && typeof lng === "number") {
      const geo = await evaluateGeofence(lat, lng);
      onPremise = geo.onPremise;
      distance = geo.distance;
    }

    const record = await db.attendance.update({
      where: { id: existing.id },
      data: {
        clockOutAt: now,
        clockOutLat: typeof lat === "number" ? lat : null,
        clockOutLng: typeof lng === "number" ? lng : null,
        clockOutOnPremise: onPremise,
        clockOutDistance: distance,
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "Clock Out",
        entity: "Attendance",
        entityId: record.id,
        metadata: JSON.stringify({ onPremise, distance, lat, lng }),
      },
    });

    return NextResponse.json({ attendance: record });
  } catch (error) {
    console.error("[API /attendance POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
