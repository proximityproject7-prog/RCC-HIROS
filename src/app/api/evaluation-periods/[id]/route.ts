import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// /api/evaluation-periods/[id]
// PATCH   evaluation.manage_forms — update (status, name, dates, groups, roles)
// DELETE  evaluation.manage_forms — delete
// ═══════════════════════════════════════════════════════════════

function parseJsonArray(val: string | null): string[] | null {
  if (!val) return null;
  try {
    const arr = JSON.parse(val);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, "evaluation.manage_forms");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const period = await db.evaluationPeriod.findUnique({ where: { id } });
    if (!period) {
      return NextResponse.json(
        { error: "Evaluation period not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, startDate, endDate, status, groupIds, targetRoleIds } = body as {
      name?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
      groupIds?: string[] | null;
      targetRoleIds?: string[] | null;
    };

    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (startDate) {
      const d = new Date(startDate);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
      }
      data.startDate = d;
    }
    if (endDate) {
      const d = new Date(endDate);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
      }
      data.endDate = d;
    }

    // Handle group/role updates
    if (groupIds !== undefined) {
      if (Array.isArray(groupIds) && groupIds.length > 0) {
        const validGroups = await db.group.findMany({ where: { id: { in: groupIds }, active: true } });
        if (validGroups.length !== groupIds.length) {
          return NextResponse.json({ error: "One or more invalid group IDs" }, { status: 400 });
        }
        data.groupIds = JSON.stringify(groupIds);
      } else {
        data.groupIds = null; // null = all groups
      }
    }
    if (targetRoleIds !== undefined) {
      if (Array.isArray(targetRoleIds) && targetRoleIds.length > 0) {
        const validRoles = await db.role.findMany({ where: { id: { in: targetRoleIds }, active: true } });
        if (validRoles.length !== targetRoleIds.length) {
          return NextResponse.json({ error: "One or more invalid role IDs" }, { status: 400 });
        }
        data.targetRoleIds = JSON.stringify(targetRoleIds);
      } else {
        data.targetRoleIds = null; // null = all roles
      }
    }

    // Handle status toggle
    if (status !== undefined) {
      if (!["open", "closed"].includes(status)) {
        return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
      }
      data.status = status;

      if (status === "open") {
        // Close all other open periods, set openedAt
        await db.evaluationPeriod.updateMany({
          where: { id: { not: id }, status: "open" },
          data: { status: "closed", closedAt: new Date() },
        });
        data.openedAt = new Date();
        data.closedAt = null;
      } else {
        // Closing: set closedAt
        data.closedAt = new Date();
        data.openedAt = null;
      }
    }

    // Validate date range
    const finalStart = data.startDate ? new Date(data.startDate as string) : period.startDate;
    const finalEnd = data.endDate ? new Date(data.endDate as string) : period.endDate;
    if (finalStart > finalEnd) {
      return NextResponse.json({ error: "End date cannot be before start date" }, { status: 400 });
    }

    const updated = await db.evaluationPeriod.update({
      where: { id },
      data,
      include: { form: { select: { id: true, name: true, active: true } } },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: `Update Evaluation Period (${Object.keys(data).join(", ")})`,
        entity: "EvaluationPeriod",
        entityId: id,
        metadata: JSON.stringify({ fields: Object.keys(data) }),
      },
    });

    // Return with parsed JSON
    const serialized = {
      id: updated.id,
      formId: updated.formId,
      form: updated.form,
      name: updated.name,
      startDate: updated.startDate.toISOString(),
      endDate: updated.endDate.toISOString(),
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      groupIds: parseJsonArray(updated.groupIds),
      targetRoleIds: parseJsonArray(updated.targetRoleIds),
      openedAt: updated.openedAt?.toISOString() ?? null,
      closedAt: updated.closedAt?.toISOString() ?? null,
      createdBy: updated.createdBy,
    };

    return NextResponse.json({ period: serialized });
  } catch (error) {
    console.error("[API /evaluation-periods/[id] PATCH] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, "evaluation.manage_forms");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const period = await db.evaluationPeriod.findUnique({ where: { id } });
    if (!period) {
      return NextResponse.json(
        { error: "Evaluation period not found" },
        { status: 404 }
      );
    }

    if (period.status === "open") {
      return NextResponse.json(
        { error: "Cannot delete an open period. Close it first." },
        { status: 400 }
      );
    }

    await db.evaluationPeriod.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Delete Evaluation Period",
        entity: "EvaluationPeriod",
        entityId: id,
        metadata: JSON.stringify({ name: period.name, previousStatus: period.status }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /evaluation-periods/[id] DELETE] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
