import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET /api/reports/attendance  reports.view
// Aggregate attendance by group and by date.
// Filters: dateFrom, dateTo, groupCode.
// Group scoping based on scopeAllReports.
// ═══════════════════════════════════════════════════════════════

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "reports.view");
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { searchParams } = new URL(request.url);
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    const groupCode = searchParams.get("groupCode") || undefined;

    // Default range = last 30 days
    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(defaultFrom.getDate() - 29);

    const from = dateFromParam ? new Date(dateFromParam) : defaultFrom;
    const to = dateToParam ? new Date(dateToParam) : today;
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }
    if (to < from) {
      return NextResponse.json(
        { error: "dateTo cannot be before dateFrom" },
        { status: 400 }
      );
    }

    // Group scoping
    const canViewAll =
      user.isSystem ||
      user.scopeAllReports ||
      user.permissions.includes("reports.view");

    let effectiveGroupCode = groupCode;
    let scopeGroupId: string | undefined;
    if (!canViewAll && user.groupId) {
      const userGroup = await db.group.findUnique({
        where: { id: user.groupId },
        select: { code: true },
      });
      if (userGroup) {
        if (effectiveGroupCode && effectiveGroupCode !== userGroup.code) {
          return NextResponse.json(
            { error: "Forbidden - you can only view your own group" },
            { status: 403 }
          );
        }
        effectiveGroupCode = userGroup.code;
        scopeGroupId = user.groupId;
      }
    }

    // Resolve groupCode → groupId filter
    let groupFilter: string | undefined = scopeGroupId;
    let groupMeta: { id: string; code: string; name: string } | null = null;
    if (effectiveGroupCode) {
      const grp = await db.group.findUnique({
        where: { code: effectiveGroupCode },
        select: { id: true, code: true, name: true },
      });
      if (grp) {
        groupFilter = grp.id;
        groupMeta = grp;
      }
    }

    // Fetch all active employees in scope (for headcount baseline)
    const empWhere: Record<string, unknown> = { active: true };
    if (groupFilter) empWhere.groupId = groupFilter;
    const employees = await db.employee.findMany({
      where: empWhere,
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        groupId: true,
        group: { select: { id: true, name: true, code: true } },
      },
    });
    const employeeIds = new Set(employees.map((e) => e.id));

    // Fetch attendance records in range
    const records = await db.attendance.findMany({
      where: {
        date: { gte: startOfDay(from), lte: endOfDay(to) },
        ...(groupFilter ? { employee: { groupId: groupFilter } } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            groupId: true,
            group: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { date: "asc" },
    });

    // Build aggregations
    // byGroup:   { groupId, groupName, groupCode, total, clockedIn, ... }
    // byDate:    { date, total, clockedIn, ... }
    // byEmployee (when groupFilter): { employeeId, name, total, clockedIn, ... }

    type Agg = {
      total: number;
      clockedIn: number;
      clockedOut: number;
      noClockIn: number;
      manuallyEdited: number;
    };

    const byGroupMap = new Map<string, Agg & {
      groupId: string;
      groupName: string;
      groupCode: string;
    }>();
    const byDateMap = new Map<string, Agg & { date: string }>();
    const byEmployeeMap = new Map<string, Agg & {
      employeeId: string;
      name: string;
    }>();

    // Initialize byGroup for all in-scope groups
    const groupsInScope = new Map<string, { id: string; name: string; code: string }>();
    for (const e of employees) {
      if (!e.group) continue;
      if (!groupsInScope.has(e.group.id)) {
        groupsInScope.set(e.group.id, e.group);
      }
    }
    for (const g of groupsInScope.values()) {
      byGroupMap.set(g.id, {
        groupId: g.id,
        groupName: g.name,
        groupCode: g.code,
        total: 0,
        clockedIn: 0,
        clockedOut: 0,
        noClockIn: 0,
        manuallyEdited: 0,
      });
    }

    // Iterate records
    for (const r of records) {
      if (!employeeIds.has(r.employeeId)) continue;

      const dateKey = startOfDay(r.date).toISOString().slice(0, 10);
      const gid = r.employee.groupId || "unassigned";

      // Update byDate
      if (!byDateMap.has(dateKey)) {
        byDateMap.set(dateKey, {
          date: dateKey,
          total: 0,
          clockedIn: 0,
          clockedOut: 0,
          noClockIn: 0,
          manuallyEdited: 0,
        });
      }
      const dAgg = byDateMap.get(dateKey)!;
      dAgg.total += 1;
      if (r.clockInAt) dAgg.clockedIn += 1;
      if (r.clockOutAt) dAgg.clockedOut += 1;
      if (!r.clockInAt) dAgg.noClockIn += 1;
      if (r.manuallyEdited) dAgg.manuallyEdited += 1;

      // Update byGroup
      const gAgg = byGroupMap.get(gid);
      if (gAgg) {
        gAgg.total += 1;
        if (r.clockInAt) gAgg.clockedIn += 1;
        if (r.clockOutAt) gAgg.clockedOut += 1;
        if (!r.clockInAt) gAgg.noClockIn += 1;
        if (r.manuallyEdited) gAgg.manuallyEdited += 1;
      }

      // Update byEmployee (only when drilling into a specific group)
      if (groupFilter) {
        const empId = r.employeeId;
        if (!byEmployeeMap.has(empId)) {
          const emp = employees.find((e) => e.id === empId);
          byEmployeeMap.set(empId, {
            employeeId: emp?.employeeId ?? empId,
            name: emp ? `${emp.firstName} ${emp.lastName}` : empId,
            total: 0,
            clockedIn: 0,
            clockedOut: 0,
            noClockIn: 0,
            manuallyEdited: 0,
          });
        }
        const eAgg = byEmployeeMap.get(empId)!;
        eAgg.total += 1;
        if (r.clockInAt) eAgg.clockedIn += 1;
        if (r.clockOutAt) eAgg.clockedOut += 1;
        if (!r.clockInAt) eAgg.noClockIn += 1;
        if (r.manuallyEdited) eAgg.manuallyEdited += 1;
      }
    }

    // Sort byDate ascending
    const byDate = Array.from(byDateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // byGroup sorted by name
    const byGroup = Array.from(byGroupMap.values()).sort((a, b) =>
      a.groupName.localeCompare(b.groupName)
    );

    // byEmployee sorted by name (only when drilling into a group)
    const byEmployee = groupFilter
      ? Array.from(byEmployeeMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      : undefined;

    // Summary totals
    const summary = {
      totalEmployees: employees.length,
      totalRecords: records.length,
      avgPresentRate:
        employees.length > 0
          ? (records.filter((r) => r.clockInAt).length / Math.max(1, records.length)) * 100
          : 0,
      totalManualEdits: records.filter((r) => r.manuallyEdited).length,
    };

    return NextResponse.json({
      range: {
        from: startOfDay(from).toISOString(),
        to: endOfDay(to).toISOString(),
      },
      group: groupMeta,
      summary,
      byGroup,
      byDate,
      ...(byEmployee ? { byEmployee } : {}),
    });
  } catch (error) {
    console.error("[API /reports/attendance] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
