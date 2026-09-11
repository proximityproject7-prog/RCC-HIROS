import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireAnyPermission,
} from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// POST /api/attendance/[id]/edit
// Body: {
//   clockInAt?, clockOutAt?,
//   clockInOnPremise?, clockOutOnPremise?,
//   editRemarks
// }
// Two separate permissions:
//   attendance.edit            — for clockInAt / clockOutAt changes
//   attendance.edit_on_premise — for on-premise flag changes
// Sets manuallyEdited=true + editedById on the record.
// ═══════════════════════════════════════════════════════════════

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const body = await request.json();
    const {
      clockInAt,
      clockOutAt,
      clockInOnPremise,
      clockOutOnPremise,
      editRemarks,
    } = body as {
      clockInAt?: string | null;
      clockOutAt?: string | null;
      clockInOnPremise?: boolean;
      clockOutOnPremise?: boolean;
      editRemarks?: string;
    };

    const record = await db.attendance.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json(
        { error: "Attendance record not found" },
        { status: 404 }
      );
    }

    // Determine which permission tier is needed
    const wantsTimeEdit =
      clockInAt !== undefined || clockOutAt !== undefined;
    const wantsOnPremiseEdit =
      clockInOnPremise !== undefined || clockOutOnPremise !== undefined;

    if (!wantsTimeEdit && !wantsOnPremiseEdit) {
      return NextResponse.json(
        { error: "No editable fields provided" },
        { status: 400 }
      );
    }

    // Permission matrix:
    // - time edits require attendance.edit
    // - on-premise edits require attendance.edit_on_premise
    const requiredPerms: string[] = [];
    if (wantsTimeEdit) requiredPerms.push("attendance.edit");
    if (wantsOnPremiseEdit) requiredPerms.push("attendance.edit_on_premise");

    const auth = await requireAnyPermission(request, requiredPerms);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    // Re-check: each field requires its specific permission
    if (wantsTimeEdit && !user.isSystem && !user.permissions.includes("attendance.edit")) {
      // If they only have edit_on_premise, they cannot edit times
      // We already filtered above; this is a safety net.
      return NextResponse.json(
        { error: "Forbidden - attendance.edit permission required for time edits" },
        { status: 403 }
      );
    }
    if (
      wantsOnPremiseEdit &&
      !user.isSystem &&
      !user.permissions.includes("attendance.edit_on_premise")
    ) {
      return NextResponse.json(
        { error: "Forbidden - attendance.edit_on_premise permission required for on-premise edits" },
        { status: 403 }
      );
    }

    const data: Record<string, unknown> = {
      manuallyEdited: true,
      editedById: user.id,
    };
    if (editRemarks !== undefined) {
      data.editRemarks = editRemarks?.trim() || null;
    }
    if (clockInAt !== undefined) {
      data.clockInAt = clockInAt ? new Date(clockInAt) : null;
    }
    if (clockOutAt !== undefined) {
      data.clockOutAt = clockOutAt ? new Date(clockOutAt) : null;
    }
    if (clockInOnPremise !== undefined) {
      data.clockInOnPremise = !!clockInOnPremise;
    }
    if (clockOutOnPremise !== undefined) {
      data.clockOutOnPremise = !!clockOutOnPremise;
    }

    const updated = await db.attendance.update({
      where: { id },
      data,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
        editedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "Edit Attendance",
        entity: "Attendance",
        entityId: id,
        metadata: JSON.stringify({
          fields: Object.keys(data).filter((k) => k !== "manuallyEdited" && k !== "editedById"),
          remarks: editRemarks,
        }),
      },
    });

    return NextResponse.json({
      attendance: {
        id: updated.id,
        employeeId: updated.employeeId,
        employee: updated.employee,
        date: updated.date.toISOString(),
        clockInAt: updated.clockInAt?.toISOString() ?? null,
        clockOutAt: updated.clockOutAt?.toISOString() ?? null,
        clockInOnPremise: updated.clockInOnPremise,
        clockOutOnPremise: updated.clockOutOnPremise,
        manuallyEdited: updated.manuallyEdited,
        editRemarks: updated.editRemarks,
        editedById: updated.editedById,
        editedBy: updated.editedBy
          ? {
              id: updated.editedBy.id,
              name: `${updated.editedBy.firstName} ${updated.editedBy.lastName}`.trim(),
            }
          : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[API /attendance/[id]/edit] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
