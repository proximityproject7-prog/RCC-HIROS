import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-token";
import { enrollFingerprint, deleteFingerprint } from "@/lib/biometric-server";

// ═══════════════════════════════════════════════════════════════
// POST /api/biometric/enroll  — biometric.enroll required
//   { employeeId, fingerIndex }
// DELETE /api/biometric/enroll  — biometric.enroll required
//   { templateId } or { employeeId } (deletes all)
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "biometric.enroll");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { employeeId, fingerIndex } = body as {
      employeeId?: string;
      fingerIndex?: number;
    };

    if (!employeeId || fingerIndex === undefined) {
      return NextResponse.json(
        { error: "Missing employeeId or fingerIndex" },
        { status: 400 }
      );
    }

    const result = await enrollFingerprint(employeeId, fingerIndex);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      message: result.message,
      template: result.template,
    });
  } catch (error) {
    console.error("[API /biometric/enroll POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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

    const result = await deleteFingerprint(templateId, employeeId);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({ message: result.message });
  } catch (error) {
    console.error("[API /biometric/enroll DELETE] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
