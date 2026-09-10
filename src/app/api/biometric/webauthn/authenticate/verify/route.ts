import { NextRequest, NextResponse } from "next/server";
import { verifyAuthentication } from "@/lib/webauthn";
import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════
// POST /api/biometric/webauthn/authenticate/verify
// UNAUTHENTICATED - used by kiosk
// Verifies WebAuthn authentication and records attendance
// ═══════════════════════════════════════════════════════════════

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { response } = body as { response?: any };

    if (!response) {
      return NextResponse.json(
        { error: "Missing response" },
        { status: 400 }
      );
    }

    const result = await verifyAuthentication(response);

    if (!result.verified || !result.employee) {
      return NextResponse.json(
        { error: result.error || "Authentication failed" },
        { status: 401 }
      );
    }

    // Auto clock in/out
    const now = new Date();
    const dayStart = startOfDay(now);

    const existing = await db.attendance.findFirst({
      where: {
        employeeId: result.employee.id,
        date: { gte: dayStart, lte: new Date(dayStart.getTime() + 86400000 - 1) },
      },
    });

    let action: string;
    let message: string;
    let record;

    if (!existing || !existing.clockInAt) {
      // Clock in
      record = await db.attendance.upsert({
        where: {
          employeeId_date: { employeeId: result.employee.id, date: dayStart },
        },
        update: {
          clockInAt: now,
          clockInOnPremise: true,
          clockInDistance: 0,
          biometricVerified: true,
        },
        create: {
          employeeId: result.employee.id,
          date: dayStart,
          clockInAt: now,
          clockInOnPremise: true,
          clockInDistance: 0,
          biometricVerified: true,
        },
      });

      action = "clock_in";
      message = `Clocked in at ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;

      await db.auditLog.create({
        data: {
          userId: result.employee.id,
          action: "Clock In (Kiosk - Fingerprint)",
          entity: "Attendance",
          entityId: record.id,
          metadata: JSON.stringify({ source: "webauthn-kiosk" }),
        },
      });
    } else if (existing.clockOutAt) {
      // Already clocked out
      return NextResponse.json({
        action: "already_clocked_out",
        employee: result.employee,
        attendance: {
          id: existing.id,
          clockInAt: existing.clockInAt?.toISOString(),
          clockOutAt: existing.clockOutAt?.toISOString(),
        },
        message: "Already clocked out today",
      });
    } else {
      // Clock out
      record = await db.attendance.update({
        where: { id: existing.id },
        data: {
          clockOutAt: now,
          clockOutOnPremise: true,
          clockOutDistance: 0,
        },
      });

      action = "clock_out";
      message = `Clocked out at ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;

      await db.auditLog.create({
        data: {
          userId: result.employee.id,
          action: "Clock Out (Kiosk - Fingerprint)",
          entity: "Attendance",
          entityId: record.id,
          metadata: JSON.stringify({ source: "webauthn-kiosk" }),
        },
      });
    }

    return NextResponse.json({
      action,
      employee: result.employee,
      attendance: {
        id: record.id,
        clockInAt: record.clockInAt?.toISOString(),
        clockOutAt: record.clockOutAt?.toISOString(),
      },
      message,
    });
  } catch (error) {
    console.error("[API /biometric/webauthn/authenticate/verify] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
