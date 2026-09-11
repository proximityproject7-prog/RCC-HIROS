import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-token";
import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════
// DELETE /api/biometric/enroll  — biometric.enroll required
//   { templateId } or { employeeId } (deletes all for that employee)
// ═══════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "biometric.enroll");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { templateId, employeeId } = body as {
      templateId?: string;
      employeeId?: string;
    };

    if (!templateId && !employeeId) {
      return NextResponse.json(
        { error: "Missing templateId or employeeId" },
        { status: 400 }
      );
    }

    if (templateId) {
      // Delete single template
      await db.biometricTemplate.delete({
        where: { id: templateId },
      });
    } else if (employeeId) {
      // Delete all templates for employee
      await db.biometricTemplate.deleteMany({
        where: { employeeId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /biometric/enroll DELETE] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
