import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission, requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET /api/fpas/[id] — get a single submission
// Access: owner, fpas.manage (all), or fpas.view_all when the
// owner is in the viewer's own group.
// ═══════════════════════════════════════════════════════════════
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAnyPermission(request, [
      "fpas.fill",
      "fpas.manage",
      "fpas.view_all",
    ]);
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const { id } = await params;

    const submission = await db.fpasSubmission.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            middleName: true,
            email: true,
            gender: true,
            contractType: true,
            hireDate: true,
            group: { select: { id: true, name: true, code: true } },
            role: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    // Check access: owner, institution viewers (system +
    // fpas.view_institution), or fpas.view_all when the owner is in the
    // viewer's own group. fpas.manage grants no viewing.
    const canViewAll =
      user.isSystem || user.permissions.includes("fpas.view_institution");
    if (submission.employeeId !== user.id && !canViewAll) {
      const canViewGroup = user.permissions.includes("fpas.view_all");
      const ownerGroupId = submission.employee?.group?.id ?? null;
      const sameGroup =
        !!ownerGroupId && !!user.groupId && ownerGroupId === user.groupId;
      if (!(canViewGroup && sameGroup)) {
        return NextResponse.json(
          { error: "Forbidden - outside your department scope" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("[API /fpas/[id]] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH /api/fpas/[id] — update a submission
// Requires fpas.fill; owner or fpas.manage. Self-updates are
// additionally blocked when the owner's group is not in the
// enabled list (managers bypass; empty list = all enabled).
// ═══════════════════════════════════════════════════════════════
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, "fpas.fill");
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const { id } = await params;

    const existing = await db.fpasSubmission.findUnique({
      where: { id },
      include: { employee: { select: { id: true, groupId: true } } },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    // Nobody files for anyone else: owner only (managers included).
    if (existing.employeeId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden - you may only update your own submission" },
        { status: 403 }
      );
    }

    // Managers bypass the group gate below for their own fills.
    const canManage = user.isSystem || user.permissions.includes("fpas.manage");

    // Hard gate: FPAS must be enabled for the owner's department.
    // Managers bypass; an empty enabled list means all groups are enabled.
    if (!canManage) {
      const setting = await db.systemSetting.findUnique({
        where: { key: "fpas_enabled_groups" },
      });
      let enabledGroupIds: string[] = [];
      if (setting?.value) {
        try { enabledGroupIds = JSON.parse(setting.value); } catch { enabledGroupIds = []; }
      }
      const ownerGroupId = existing.employee?.groupId ?? null;
      if (
        enabledGroupIds.length > 0 &&
        (!ownerGroupId || !enabledGroupIds.includes(ownerGroupId))
      ) {
        return NextResponse.json(
          { error: "Forbidden - FPAS is not enabled for this department" },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { formData, totalPoints } = body as {
      formData?: string;
      totalPoints?: number;
    };

    const submission = await db.fpasSubmission.update({
      where: { id },
      data: {
        ...(formData !== undefined ? { formData } : {}),
        ...(totalPoints !== undefined ? { totalPoints } : {}),
      },
    });

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("[API /fpas/[id]] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
