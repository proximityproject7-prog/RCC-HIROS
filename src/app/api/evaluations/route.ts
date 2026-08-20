import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// /api/evaluations
// GET   auth  — list with scope=submitted_by_me|for_me|all
//              Group scoping for "all" based on scopeAllEvaluation
// POST  evaluation.submit — create/update evaluation
//   @@unique([periodId, evaluatorId, employeeId]) prevents duplicates
// ═══════════════════════════════════════════════════════════════

const EVALUATION_INCLUDE = {
  evaluator: { select: { id: true, firstName: true, lastName: true } },
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeId: true,
      groupId: true,
      group: { select: { name: true } },
      role: { select: { name: true } },
    },
  },
  form: { select: { id: true, name: true } },
  period: { select: { id: true, name: true, status: true } },
  responses: { include: { criterion: { select: { id: true, category: true, description: true, maxScore: true, weight: true, sortOrder: true } } }, orderBy: { criterion: { sortOrder: "asc" } } },
} satisfies Record<string, unknown>;

 
function serializeEvaluation(ev: any) {
  if (!ev) return null;
  return {
    id: ev.id,
    periodId: ev.periodId,
    formId: ev.formId,
    evaluatorId: ev.evaluatorId,
    evaluator: ev.evaluator
      ? {
          id: ev.evaluator.id,
          name: `${ev.evaluator.firstName} ${ev.evaluator.lastName}`.trim(),
        }
      : null,
    employeeId: ev.employeeId,
    employee: ev.employee
      ? {
          id: ev.employee.id,
          name: `${ev.employee.firstName} ${ev.employee.lastName}`.trim(),
          employeeId: ev.employee.employeeId,
          groupId: ev.employee.groupId,
          group: ev.employee.group ? { name: ev.employee.group.name } : null,
          role: ev.employee.role ? { name: ev.employee.role.name } : null,
        }
      : null,
    status: ev.status,
    totalScore: ev.totalScore,
    remarks: ev.remarks,
    submittedAt: ev.submittedAt?.toISOString() ?? null,
    createdAt: ev.createdAt.toISOString(),
    updatedAt: ev.updatedAt.toISOString(),
    form: ev.form ? { id: ev.form.id, name: ev.form.name } : null,
    period: ev.period
      ? { id: ev.period.id, name: ev.period.name, status: ev.period.status }
      : null,
    responses: (ev.responses || []).map(
      (r: {
        id: string;
        criterionId: string;
        score: number;
        comments: string | null;
        criterion?: { id: string; category: string; description: string; maxScore: number; weight: number; sortOrder: number };
      }) => ({
        id: r.id,
        criterionId: r.criterionId,
        score: r.score,
        comments: r.comments,
        criterion: r.criterion ? {
          id: r.criterion.id,
          category: r.criterion.category,
          description: r.criterion.description,
          maxScore: r.criterion.maxScore,
          weight: r.criterion.weight,
          sortOrder: r.criterion.sortOrder,
        } : undefined,
      })
    ),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") || "submitted_by_me";
    const periodId = searchParams.get("periodId") || undefined;

    const where: Record<string, unknown> = {};
    if (periodId) where.periodId = periodId;

    if (scope === "submitted_by_me") {
      where.evaluatorId = user.id;
    } else if (scope === "for_me") {
      where.employeeId = user.id;
    } else if (scope === "all") {
      const canViewAll =
        user.isSystem ||
        user.permissions.includes("evaluation.view_results") ||
        user.permissions.includes("evaluation.view") ||
        user.scopeAllEvaluation;

      if (!canViewAll) {
        if (user.groupId) {
          where.employee = { groupId: user.groupId };
        } else {
          where.OR = [{ evaluatorId: user.id }, { employeeId: user.id }];
        }
      }
    } else {
      return NextResponse.json(
        { error: `Invalid scope: ${scope}` },
        { status: 400 }
      );
    }

    // Hide system admin evaluations from non-system-admin users
    if (!user.isSystem) {
      // Exclude evaluations where employee is system admin
      where.employee = { ...(where.employee as object || {}), role: { isSystem: false } };
    }

    const evaluations = await db.evaluation.findMany({
      where,
       
      include: EVALUATION_INCLUDE as any,
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      evaluations: evaluations.map((e) => serializeEvaluation(e)),
    });
  } catch (error) {
    console.error("[API /evaluations GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "evaluation.submit");
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const body = await request.json();
    const {
      periodId,
      formId,
      employeeId,
      responses = [],
      remarks,
      status: requestedStatus = "draft",
    } = body as {
      periodId?: string;
      formId?: string;
      employeeId?: string;
      responses?: { criterionId: string; score: number; comments?: string }[];
      remarks?: string;
      status?: string;
    };

    if (!periodId || !formId || !employeeId) {
      return NextResponse.json(
        { error: "periodId, formId, and employeeId are required" },
        { status: 400 }
      );
    }

    const period = await db.evaluationPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period) {
      return NextResponse.json(
        { error: "Evaluation period not found" },
        { status: 400 }
      );
    }
    if (period.status !== "open") {
      return NextResponse.json(
        { error: `Period is not open (status: ${period.status})` },
        { status: 400 }
      );
    }
    if (period.formId !== formId) {
      return NextResponse.json(
        { error: "Form does not match the period's configured form" },
        { status: 400 }
      );
    }

    const form = await db.evaluationForm.findUnique({
      where: { id: formId },
      include: { criteria: true },
    });
    if (!form || !form.active) {
      return NextResponse.json(
        { error: "Evaluation form not found or inactive" },
        { status: 400 }
      );
    }

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, groupId: true },
    });
    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 400 }
      );
    }

    if (employeeId === user.id) {
      return NextResponse.json(
        { error: "You cannot evaluate yourself" },
        { status: 400 }
      );
    }

    if (
      !user.isSystem &&
      !user.scopeAllEvaluation &&
      user.groupId &&
      employee.groupId !== user.groupId
    ) {
      return NextResponse.json(
        { error: "You can only evaluate employees in your own group" },
        { status: 403 }
      );
    }

    // Period group/role scope validation
    if (!user.isSystem && !user.scopeAllEvaluation) {
      // Check group scope
      if (period.groupIds) {
        try {
          const allowedGroups: string[] = JSON.parse(period.groupIds);
          if (allowedGroups.length > 0 && employee.groupId && !allowedGroups.includes(employee.groupId)) {
            return NextResponse.json(
              { error: "This period is not available for the employee's group" },
              { status: 403 }
            );
          }
        } catch { /* invalid JSON — treat as no restriction */ }
      }
      // Check role scope
      if (period.targetRoleIds) {
        try {
          const allowedRoles: string[] = JSON.parse(period.targetRoleIds);
          if (allowedRoles.length > 0) {
            const evaluator = await db.employee.findUnique({ where: { id: user.id }, select: { roleId: true } });
            if (evaluator?.roleId && !allowedRoles.includes(evaluator.roleId)) {
              return NextResponse.json(
                { error: "You do not have the required role to evaluate for this period" },
                { status: 403 }
              );
            }
          }
        } catch { /* invalid JSON — treat as no restriction */ }
      }
    }

    const criterionIds = new Set(form.criteria.map((c) => c.id));
    const invalidResponses = responses.filter(
      (r) => !criterionIds.has(r.criterionId)
    );
    if (invalidResponses.length > 0) {
      return NextResponse.json(
        { error: "Some responses reference unknown criteria" },
        { status: 400 }
      );
    }

    const finalStatus: string = ["draft", "submitted", "acknowledged"].includes(
      requestedStatus
    )
      ? requestedStatus
      : "draft";

    let totalScore: number | null = null;
    if (finalStatus === "submitted") {
      let weighted = 0;
      let weightSum = 0;
      for (const c of form.criteria) {
        const r = responses.find((x) => x.criterionId === c.id);
        if (r) {
          const score = Math.max(0, Math.min(r.score, c.maxScore));
          weighted += score * c.weight;
          weightSum += c.weight;
        }
      }
      totalScore = weightSum > 0 ? weighted / weightSum : 0;
    }

    const existing = await db.evaluation.findUnique({
      where: {
        periodId_evaluatorId_employeeId: {
          periodId,
          evaluatorId: user.id,
          employeeId,
        },
      },
      include: { responses: true },
    });

    let evaluation;
    if (existing) {
      evaluation = await db.$transaction(async (tx) => {
        await tx.evaluationResponse.deleteMany({
          where: { evaluationId: existing.id },
        });
        const updated = await tx.evaluation.update({
          where: { id: existing.id },
          data: {
            status: finalStatus,
            totalScore,
            remarks: remarks?.trim() || null,
            submittedAt:
              finalStatus === "submitted" && !existing.submittedAt
                ? new Date()
                : existing.submittedAt,
            responses: {
              create: responses.map((r) => ({
                criterionId: r.criterionId,
                score: r.score,
                comments: r.comments?.trim() || null,
              })),
            },
          },
           
          include: EVALUATION_INCLUDE as any,
        });
        return updated;
      });
    } else {
      evaluation = await db.evaluation.create({
        data: {
          periodId,
          formId,
          evaluatorId: user.id,
          employeeId,
          status: finalStatus,
          totalScore,
          remarks: remarks?.trim() || null,
          submittedAt: finalStatus === "submitted" ? new Date() : null,
          responses: {
            create: responses.map((r) => ({
              criterionId: r.criterionId,
              score: r.score,
              comments: r.comments?.trim() || null,
            })),
          },
        },
         
        include: EVALUATION_INCLUDE as any,
      });
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: `${existing ? "Update" : "Create"} Evaluation`,
        entity: "Evaluation",
        entityId: evaluation.id,
        metadata: JSON.stringify({
          employeeId,
          periodId,
          formId,
          status: finalStatus,
          totalScore,
        }),
      },
    });

    return NextResponse.json(
      { evaluation: serializeEvaluation(evaluation) },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    console.error("[API /evaluations POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
