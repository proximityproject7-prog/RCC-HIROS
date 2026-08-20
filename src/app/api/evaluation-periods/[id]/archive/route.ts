import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET /api/evaluation-periods/[id]/archive
//   evaluation.manage_forms — view archived evaluations for a period
//   Returns all submitted evaluations with responses, grouped by employee
// ═══════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, "evaluation.manage_forms");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const period = await db.evaluationPeriod.findUnique({
      where: { id },
      include: { form: { select: { id: true, name: true } } },
    });
    if (!period) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }

    const evaluations = await db.evaluation.findMany({
      where: { periodId: id, status: "submitted" },
      include: {
        evaluator: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        employee: {
          select: {
            id: true, firstName: true, lastName: true, employeeId: true, groupId: true,
            group: { select: { name: true } },
            role: { select: { name: true } },
          },
        },
        responses: {
          include: {
            criterion: { select: { id: true, category: true, description: true, maxScore: true, weight: true, sortOrder: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      period: {
        id: period.id,
        name: period.name,
        status: period.status,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
        closedAt: period.closedAt?.toISOString() ?? null,
        form: period.form,
      },
      evaluations: evaluations.map((ev) => ({
        id: ev.id,
        evaluatorId: ev.evaluatorId,
        evaluator: ev.evaluator
          ? { id: ev.evaluator.id, name: `${ev.evaluator.firstName} ${ev.evaluator.lastName}`.trim(), employeeId: ev.evaluator.employeeId }
          : null,
        employeeId: ev.employeeId,
        employee: ev.employee
          ? {
              id: ev.employee.id,
              name: `${ev.employee.firstName} ${ev.employee.lastName}`.trim(),
              employeeId: ev.employee.employeeId,
              groupName: ev.employee.group?.name ?? null,
              roleName: ev.employee.role?.name ?? null,
            }
          : null,
        status: ev.status,
        totalScore: ev.totalScore,
        remarks: ev.remarks,
        submittedAt: ev.submittedAt?.toISOString() ?? null,
        responses: ev.responses.map((r) => ({
          criterionId: r.criterionId,
          category: r.criterion.category,
          description: r.criterion.description,
          score: r.score,
          maxScore: r.criterion.maxScore,
          weight: r.criterion.weight,
          comments: r.comments,
        })),
      })),
    });
  } catch (error) {
    console.error("[API /evaluation-periods/[id]/archive] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
