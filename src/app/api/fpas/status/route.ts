import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission } from "@/lib/auth-token";

const SETTING_KEY = "fpas_enabled_groups";

// ═══════════════════════════════════════════════════════════════
// GET /api/fpas/status — all employees with FPAS submission status
// Entry: fpas.fill, fpas.manage, or fpas.view_all.
// Scope: fpas.manage sees all groups; fpas.view_all sees own group
// (+ self); everyone else sees only their own row. Only returns
// employees in FPAS-enabled groups (when any are configured).
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAnyPermission(request, [
      "fpas.fill",
      "fpas.manage",
      "fpas.view_all",
    ]);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const canViewAll =
      user.isSystem || user.permissions.includes("fpas.view_institution");
    const canViewGroup =
      canViewAll || user.permissions.includes("fpas.view_all");

    // Get enabled group IDs from settings
    const setting = await db.systemSetting.findUnique({
      where: { key: SETTING_KEY },
    });

    let enabledGroupIds: string[] = [];
    if (setting?.value) {
      try { enabledGroupIds = JSON.parse(setting.value); } catch { enabledGroupIds = []; }
    }

    const { searchParams } = new URL(request.url);
    const schoolYear = searchParams.get("schoolYear") || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    // Build employee filter
    const employeeWhere: Record<string, unknown> = {
      active: true,
      role: { isSystem: false },
    };

    // Only show employees in FPAS-enabled groups (if any are configured)
    if (enabledGroupIds.length > 0) {
      employeeWhere.groupId = { in: enabledGroupIds };
    }

    // Institution viewers see all groups; group viewers see their own
    // group (+ self even if groupless); everyone else sees only self.
    // fpas.manage grants no viewing.
    if (!canViewAll) {
      if (canViewGroup && user.groupId) {
        employeeWhere.OR = [{ groupId: user.groupId }, { id: user.id }];
      } else {
        employeeWhere.id = user.id;
      }
    }

    // Fetch all eligible employees with their submissions for this school year
    const employees = await db.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        middleName: true,
        lastName: true,
        group: { select: { id: true, name: true, code: true } },
        role: { select: { id: true, name: true } },
        fpasSubmissions: {
          where: { schoolYear },
          select: {
            id: true,
            totalPoints: true,
            updatedAt: true,
            schoolYear: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
      orderBy: [
        { group: { name: "asc" as const } },
        { lastName: "asc" as const },
      ],
    });

    const result = employees.map((emp) => ({
      employeeId: emp.employeeId,
      name: `${emp.firstName} ${emp.middleName ? emp.middleName + " " : ""}${emp.lastName}`,
      group: emp.group,
      roleName: emp.role?.name ?? null,
      submission: emp.fpasSubmissions[0] ?? null,
      hasSubmission: emp.fpasSubmissions.length > 0,
    }));

    return NextResponse.json({ employees: result, schoolYear });
  } catch (error) {
    console.error("[API /fpas/status] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
