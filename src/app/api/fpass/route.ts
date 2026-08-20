import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET /api/fpass — list submissions
//   ?employeeId=X — filter by employee
//   ?schoolYear=X — filter by school year
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "fpass.fill");
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") || undefined;
    const schoolYear = searchParams.get("schoolYear") || undefined;

    const canManage = user.isSystem || user.permissions.includes("fpass.manage");

    const where: Record<string, unknown> = {};

    if (employeeId) {
      where.employeeId = employeeId;
    } else if (!canManage) {
      // Non-admins can only see their own submissions
      where.employeeId = user.id;
    }

    if (schoolYear) {
      where.schoolYear = schoolYear;
    }

    const submissions = await db.fpassSubmission.findMany({
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
    console.error("[API /fpass] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/fpass — create or update a submission (upsert)
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "fpass.fill");
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

    // If filling for another employee, require fpass.manage
    const canManage = user.isSystem || user.permissions.includes("fpass.manage");
    if (targetEmployeeId !== user.id && !canManage) {
      return NextResponse.json(
        { error: "Forbidden - cannot fill FPASS for another employee" },
        { status: 403 }
      );
    }

    // Verify the target employee exists
    const targetEmployee = await db.employee.findUnique({
      where: { id: targetEmployeeId },
      select: { id: true, active: true },
    });
    if (!targetEmployee || !targetEmployee.active) {
      return NextResponse.json(
        { error: "Employee not found or inactive" },
        { status: 404 }
      );
    }

    // Upsert: one submission per employee per school year
    const existing = await db.fpassSubmission.findUnique({
      where: { employeeId_schoolYear: { employeeId: targetEmployeeId, schoolYear } },
    });

    let submission;
    if (existing) {
      submission = await db.fpassSubmission.update({
        where: { id: existing.id },
        data: {
          formData,
          totalPoints: totalPoints ?? 0,
        },
      });
    } else {
      submission = await db.fpassSubmission.create({
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
    console.error("[API /fpass] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
