import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireAuth,
  requirePermission,
} from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET   /api/evaluation-periods  auth                    — list periods
// POST  /api/evaluation-periods  evaluation.manage_forms — create period
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

function serializePeriod(p: Record<string, unknown> & {
  form?: { id: string; name: string; active: boolean } | null;
  _count?: { evaluations: number };
  groupIds: string | null;
  targetRoleIds: string | null;
  openedAt: Date | null;
  closedAt: Date | null;
  createdBy: string | null;
}) {
  return {
    id: p.id,
    formId: p.formId,
    form: p.form,
    name: p.name,
    startDate: (p.startDate as Date).toISOString(),
    endDate: (p.endDate as Date).toISOString(),
    status: p.status,
    createdAt: (p.createdAt as Date).toISOString(),
    evaluationsCount: p._count?.evaluations ?? 0,
    groupIds: parseJsonArray(p.groupIds),
    targetRoleIds: parseJsonArray(p.targetRoleIds),
    openedAt: p.openedAt ? (p.openedAt as Date).toISOString() : null,
    closedAt: p.closedAt ? (p.closedAt as Date).toISOString() : null,
    createdBy: p.createdBy,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") || "all";
    const { user } = auth;

    const where: Record<string, unknown> = {};

    // For non-scopeAll users, filter periods by their group
    if (scope === "accessible" && !user.isSystem && !user.scopeAllEvaluation && user.groupId) {
      // Return periods where groupIds includes user's group OR groupIds is null (institution-wide)
      where.OR = [
        { groupIds: null },
        { groupIds: { contains: user.groupId } },
      ];
    }

    const periods = await db.evaluationPeriod.findMany({
      where,
      include: {
        form: { select: { id: true, name: true, active: true } },
        _count: { select: { evaluations: true } },
      },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json({
      periods: periods.map((p) => serializePeriod(p as never)),
    });
  } catch (error) {
    console.error("[API /evaluation-periods GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "evaluation.manage_forms");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { formId, name, startDate, endDate, status = "closed", groupIds, targetRoleIds } = body as {
      formId?: string;
      name?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
      groupIds?: string[];
      targetRoleIds?: string[];
    };

    if (!formId || !name || !startDate || !endDate) {
      return NextResponse.json(
        { error: "formId, name, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    const form = await db.evaluationForm.findUnique({ where: { id: formId } });
    if (!form) {
      return NextResponse.json(
        { error: "Evaluation form not found" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }
    if (end < start) {
      return NextResponse.json(
        { error: "End date cannot be before start date" },
        { status: 400 }
      );
    }

    if (!["open", "closed"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status value" },
        { status: 400 }
      );
    }

    // Validate group IDs exist
    if (Array.isArray(groupIds) && groupIds.length > 0) {
      const validGroups = await db.group.findMany({ where: { id: { in: groupIds }, active: true } });
      if (validGroups.length !== groupIds.length) {
        return NextResponse.json({ error: "One or more invalid group IDs" }, { status: 400 });
      }
    }

    // Validate role IDs exist
    if (Array.isArray(targetRoleIds) && targetRoleIds.length > 0) {
      const validRoles = await db.role.findMany({ where: { id: { in: targetRoleIds }, active: true } });
      if (validRoles.length !== targetRoleIds.length) {
        return NextResponse.json({ error: "One or more invalid role IDs" }, { status: 400 });
      }
    }

    const groupIdsJson = Array.isArray(groupIds) && groupIds.length > 0 ? JSON.stringify(groupIds) : null;
    const targetRoleIdsJson = Array.isArray(targetRoleIds) && targetRoleIds.length > 0 ? JSON.stringify(targetRoleIds) : null;

    // If opening, close any currently open period
    if (status === "open") {
      await db.evaluationPeriod.updateMany({
        where: { status: "open" },
        data: { status: "closed", closedAt: new Date() },
      });
    }

    const period = await db.evaluationPeriod.create({
      data: {
        formId,
        name: name.trim(),
        startDate: start,
        endDate: end,
        status,
        groupIds: groupIdsJson,
        targetRoleIds: targetRoleIdsJson,
        openedAt: status === "open" ? new Date() : null,
        createdBy: auth.user.id,
      },
      include: {
        form: { select: { id: true, name: true, active: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Create Evaluation Period",
        entity: "EvaluationPeriod",
        entityId: period.id,
        metadata: JSON.stringify({ name: period.name, formId, groupIds, targetRoleIds }),
      },
    });

    return NextResponse.json({ period: serializePeriod(period as never) }, { status: 201 });
  } catch (error) {
    console.error("[API /evaluation-periods POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
