import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET /api/fpass/[id] — get a single submission
// ═══════════════════════════════════════════════════════════════
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, "fpass.fill");
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const { id } = await params;

    const submission = await db.fpassSubmission.findUnique({
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

    // Check access: owner or fpass.manage
    const canManage = user.isSystem || user.permissions.includes("fpass.manage");
    if (submission.employeeId !== user.id && !canManage) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("[API /fpass/[id]] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH /api/fpass/[id] — update a submission
// Requires fpass.fill; owner or fpass.manage. Self-updates are
// additionally blocked when the owner's group is not in the
// enabled list (managers bypass; empty list = all enabled).
// ═══════════════════════════════════════════════════════════════
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, "fpass.fill");
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const { id } = await params;

    const existing = await db.fpassSubmission.findUnique({
      where: { id },
      include: { employee: { select: { id: true, groupId: true } } },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    // Check access: owner or fpass.manage
    const canManage = user.isSystem || user.permissions.includes("fpass.manage");
    if (existing.employeeId !== user.id && !canManage) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Hard gate: FPASS must be enabled for the owner's department.
    // Managers bypass; an empty enabled list means all groups are enabled.
    if (!canManage) {
      const setting = await db.systemSetting.findUnique({
        where: { key: "fpass_enabled_groups" },
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
          { error: "Forbidden - FPASS is not enabled for this department" },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { formData, totalPoints } = body as {
      formData?: string;
      totalPoints?: number;
    };

    const submission = await db.fpassSubmission.update({
      where: { id },
      data: {
        ...(formData !== undefined ? { formData } : {}),
        ...(totalPoints !== undefined ? { totalPoints } : {}),
      },
    });

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("[API /fpass/[id]] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
