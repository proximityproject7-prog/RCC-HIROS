import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET /api/auth/me
// Returns the current authenticated user's full profile.
// ═══════════════════════════════════════════════════════════════

function buildFullName(
  firstName: string,
  middleName: string | null,
  lastName: string
): string {
  return [firstName, middleName, lastName].filter(Boolean).join(" ");
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    // Re-fetch from DB to include relations explicitly
    const employee = await db.employee.findUnique({
      where: { id: user.id },
      include: {
        role: { include: { permissions: true } },
        group: true,
      },
    });

    if (!employee || !employee.role) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const permissions = employee.role.permissions
      .filter((p) => p.granted)
      .map((p) => p.identifier);

    return NextResponse.json({
      user: {
        id: employee.id,
        email: employee.email,
        name: buildFullName(employee.firstName, employee.middleName, employee.lastName),
        employeeId: employee.employeeId,
        roleId: employee.role.id,
        roleName: employee.role.name,
        scopeAllProfiling: employee.role.scopeAllProfiling,
        scopeAllEvaluation: employee.role.scopeAllEvaluation,
        scopeAllLeave: employee.role.scopeAllLeave,
        scopeAllReports: employee.role.scopeAllReports,
        scopeAllAttendance: employee.role.scopeAllAttendance,
        scopeGroupAttendance: employee.role.scopeGroupAttendance,
        canSelfApproveLeave: employee.role.canSelfApproveLeave,
        canEditProfile: employee.role.canEditProfile,
        canChangePassword: employee.role.canChangePassword,
        isSystem: employee.role.isSystem,
        groupId: employee.groupId,
        group: employee.group?.name ?? null,
        active: employee.active,
        mustChangePassword: employee.mustChangePwd,
        permissions,
      },
    });
  } catch (error) {
    console.error("[API /auth/me] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
