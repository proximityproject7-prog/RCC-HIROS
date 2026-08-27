import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

const SETTING_KEY = "fpass_enabled_groups";

// ═══════════════════════════════════════════════════════════════
// GET /api/fpass/status — all employees with FPASS submission status
// Only returns employees in FPASS-enabled groups.
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "fpass.fill");
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const canManage = user.isSystem || user.permissions.includes("fpass.manage");

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

    // Only show employees in FPASS-enabled groups (if any are configured)
    if (enabledGroupIds.length > 0) {
      employeeWhere.groupId = { in: enabledGroupIds };
    }

    // Non-managers can only see their own
    if (!canManage) {
      employeeWhere.id = user.id;
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
        fpassSubmissions: {
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
      submission: emp.fpassSubmissions[0] ?? null,
      hasSubmission: emp.fpassSubmissions.length > 0,
    }));

    return NextResponse.json({ employees: result, schoolYear });
  } catch (error) {
    console.error("[API /fpass/status] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
