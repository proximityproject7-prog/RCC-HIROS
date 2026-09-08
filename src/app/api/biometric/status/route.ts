import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-token";
import { MAX_TEMPLATES_PER_EMPLOYEE } from "@/lib/biometric";
import { getBiometricsEnabled } from "@/lib/biometric-server";

// ═══════════════════════════════════════════════════════════════
// GET /api/biometric/status?employeeId=X
// Returns enrollment count + template metadata (no template blobs).
// Access: own record, or biometric.manage, or profiling.view.
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    // Master switch OFF: report empty, no DB lookups.
    if (!(await getBiometricsEnabled())) {
      const { searchParams } = new URL(request.url);
      return NextResponse.json({
        employeeId: searchParams.get("employeeId") || auth.user.id,
        enrolled: 0,
        maxAllowed: MAX_TEMPLATES_PER_EMPLOYEE,
        templates: [],
      });
    }

    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get("employeeId") || auth.user.id;

    // Viewing someone else's enrollment requires biometric.manage or profiling.view
    if (targetId !== auth.user.id) {
      const allowed =
        auth.user.isSystem ||
        auth.user.permissions.includes("biometric.manage") ||
        auth.user.permissions.includes("profiling.view");
      if (!allowed) {
        return NextResponse.json(
          { error: "You do not have permission to view this employee's biometrics" },
          { status: 403 }
        );
      }
    }

    const employee = await db.employee.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        active: true,
        role: { select: { isSystem: true } },
        biometricTemplates: {
          select: { id: true, fingerIndex: true, quality: true, createdAt: true },
          orderBy: { fingerIndex: "asc" },
        },
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // System admin stays hidden from non-system users
    if (employee.role?.isSystem && !auth.user.isSystem) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json({
      employeeId: employee.id,
      enrolled: employee.biometricTemplates.length,
      maxAllowed: MAX_TEMPLATES_PER_EMPLOYEE,
      templates: employee.biometricTemplates.map((t) => ({
        id: t.id,
        fingerIndex: t.fingerIndex,
        quality: t.quality,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("GET /api/biometric/status error:", err);
    return NextResponse.json({ error: "Failed to load biometric status" }, { status: 500 });
  }
}
