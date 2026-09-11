import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════
// POST /api/kiosk/clock  — UNAUTHENTICATED
// Accepts { employeeId } from fingerprint match.
// Auto-detects clock_in vs clock_out based on today's record.
// Kiosk is on premises by definition — no geolocation check.
// ═══════════════════════════════════════════════════════════════

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId } = body as { employeeId?: string };

    if (!employeeId) {
      return NextResponse.json(
        { error: "Missing employeeId" },
        { status: 400 }
      );
    }

    // Verify employee exists and is active
    const employee = await db.employee.findFirst({
      where: { id: employeeId, active: true },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        photo: true,
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found or inactive" },
        { status: 404 }
      );
    }

    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);

    // Find today's record
    const existing = await db.attendance.findFirst({
      where: {
        employeeId: employee.id,
        date: { gte: dayStart, lte: dayEnd },
      },
    });

    // Auto-detect action
    if (!existing || !existing.clockInAt) {
      // No record or no clock-in → clock in
      const record = await db.attendance.upsert({
        where: {
          employeeId_date: { employeeId: employee.id, date: dayStart },
        },
        update: {
          clockInAt: now,
          clockInOnPremise: true,
          clockInDistance: 0,
        },
        create: {
          employeeId: employee.id,
          date: dayStart,
          clockInAt: now,
          clockInOnPremise: true,
          clockInDistance: 0,
        },
      });

      await db.auditLog.create({
        data: {
          userId: employee.id,
          action: "Clock In (Kiosk)",
          entity: "Attendance",
          entityId: record.id,
          metadata: JSON.stringify({ source: "fingerprint-kiosk" }),
        },
      });

      return NextResponse.json({
        action: "clock_in",
        employee,
        attendance: {
          id: record.id,
          clockInAt: record.clockInAt?.toISOString(),
          clockOutAt: record.clockOutAt?.toISOString(),
        },
        message: `Clocked in at ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`,
      });
    }

    if (existing.clockOutAt) {
      // Already clocked out
      return NextResponse.json({
        action: "already_clocked_out",
        employee,
        attendance: {
          id: existing.id,
          clockInAt: existing.clockInAt?.toISOString(),
          clockOutAt: existing.clockOutAt?.toISOString(),
        },
        message: "Already clocked out today",
      });
    }

    // Has clock-in but no clock-out → clock out
    const record = await db.attendance.update({
      where: { id: existing.id },
      data: {
        clockOutAt: now,
        clockOutOnPremise: true,
        clockOutDistance: 0,
      },
    });

    await db.auditLog.create({
      data: {
        userId: employee.id,
        action: "Clock Out (Kiosk)",
        entity: "Attendance",
        entityId: record.id,
        metadata: JSON.stringify({ source: "fingerprint-kiosk" }),
      },
    });

    return NextResponse.json({
      action: "clock_out",
      employee,
      attendance: {
        id: record.id,
        clockInAt: record.clockInAt?.toISOString(),
        clockOutAt: record.clockOutAt?.toISOString(),
      },
      message: `Clocked out at ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`,
    });
  } catch (error) {
    console.error("[API /kiosk/clock] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
