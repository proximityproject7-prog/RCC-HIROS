import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission, requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET /api/fpas — list submissions
//   ?employeeId=X — filter by employee
//   ?schoolYear=X — filter by school year
// View scope: institution viewers (system + fpas.view_institution)
// see all; fpas.view_all sees own group (+ self); everyone else sees
// only their own submissions. fpas.manage grants no viewing.
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAnyPermission(request, [
      "fpas.fill",
      "fpas.manage",
      "fpas.view_all",
      "fpas.view_institution",
    ]);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") || undefined;
    const schoolYear = searchParams.get("schoolYear") || undefined;

    const canViewAll =
      user.isSystem || user.permissions.includes("fpas.view_institution");
    const canViewGroup =
      canViewAll || user.permissions.includes("fpas.view_all");

    const where: Record<string, unknown> = {};

    if (employeeId) {
      // Explicit filter must still respect scope: institution viewers may
      // query anyone; others only themselves or (with view_all) own group.
      if (!canViewAll && employeeId !== user.id) {
        const target = await db.employee.findUnique({
          where: { id: employeeId },
          select: { groupId: true },
        });
        const sameGroup =
          !!target?.groupId && !!user.groupId && target.groupId === user.groupId;
        if (!(canViewGroup && sameGroup)) {
          return NextResponse.json(
            { error: "Forbidden - outside your department scope" },
            { status: 403 }
          );
        }
      }
      where.employeeId = employeeId;
    } else if (!canViewAll) {
      if (canViewGroup && user.groupId) {
        // Group-scoped viewers see their own department's submissions.
        where.employee = { groupId: user.groupId };
      } else {
        // Everyone else can only see their own submissions
        where.employeeId = user.id;
      }
    }

    if (schoolYear) {
      where.schoolYear = schoolYear;
    }

    const submissions = await db.fpasSubmission.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            middleName: true,
            group: { select: { id: true, name: true, code: true } },
            role: { select: { id: true, name: true, isSystem: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Filter out system admin submissions for non-system-admin users
    const filteredSubmissions = user.isSystem ? submissions : submissions.filter(s => !s.employee?.role?.isSystem);

    return NextResponse.json({ submissions: filteredSubmissions });
  } catch (error) {
    console.error("[API /fpas] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/fpas — create or update a submission (upsert)
// Requires fpas.fill; filling for another employee requires
// fpas.manage. Self-fills are additionally blocked when the
// target's group is not in the enabled list (managers bypass;
// empty list = all groups enabled).
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "fpas.fill");
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const body = await request.json();
    const { employeeId, schoolYear, formData, totalPoints } = body as {
      employeeId?: string;
      schoolYear?: string;
      formData?: string;
      totalPoints?: number;
    };

    if (!schoolYear || !formData) {
      return NextResponse.json(
        { error: "schoolYear and formData are required" },
        { status: 400 }
      );
    }

    // Determine which employee this submission is for
    const targetEmployeeId = employeeId || user.id;

    // Nobody files for anyone else: the target must be yourself,
    // managers included.
    if (targetEmployeeId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden - you may only file your own submission" },
        { status: 403 }
      );
    }

    // Managers bypass the group gate below for their own fills.
    const canManage = user.isSystem || user.permissions.includes("fpas.manage");

    // Verify the target employee exists
    const targetEmployee = await db.employee.findUnique({
      where: { id: targetEmployeeId },
      select: { id: true, active: true, groupId: true },
    });
    if (!targetEmployee || !targetEmployee.active) {
      return NextResponse.json(
        { error: "Employee not found or inactive" },
        { status: 404 }
      );
    }

    // Hard gate: FPAS must be enabled for the target's department.
    // Managers bypass; an empty enabled list means all groups are enabled.
    if (!canManage) {
      const setting = await db.systemSetting.findUnique({
        where: { key: "fpas_enabled_groups" },
      });
      let enabledGroupIds: string[] = [];
      if (setting?.value) {
        try { enabledGroupIds = JSON.parse(setting.value); } catch { enabledGroupIds = []; }
      }
      if (
        enabledGroupIds.length > 0 &&
        (!targetEmployee.groupId || !enabledGroupIds.includes(targetEmployee.groupId))
      ) {
        return NextResponse.json(
          { error: "Forbidden - FPAS is not enabled for this department" },
          { status: 403 }
        );
      }
    }

    // Upsert: one submission per employee per school year
    const existing = await db.fpasSubmission.findUnique({
      where: { employeeId_schoolYear: { employeeId: targetEmployeeId, schoolYear } },
    });

    let submission;
    if (existing) {
      submission = await db.fpasSubmission.update({
        where: { id: existing.id },
        data: {
          formData,
          totalPoints: totalPoints ?? 0,
        },
      });
    } else {
      submission = await db.fpasSubmission.create({
        data: {
          employeeId: targetEmployeeId,
          schoolYear,
          formData,
          totalPoints: totalPoints ?? 0,
        },
      });
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("[API /fpas] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
