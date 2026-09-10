import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-token";
import { verifyRegistration } from "@/lib/webauthn";

// ═══════════════════════════════════════════════════════════════
// POST /api/biometric/webauthn/register/verify
// biometric.enroll required
// Verifies WebAuthn registration response and stores credential
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "biometric.enroll");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { employeeId, fingerIndex, response } = body as {
      employeeId?: string;
      fingerIndex?: number;
      response?: any;
    };

    if (!employeeId || fingerIndex === undefined || !response) {
      return NextResponse.json(
        { error: "Missing employeeId, fingerIndex, or response" },
        { status: 400 }
      );
    }

    const result = await verifyRegistration(employeeId, fingerIndex, response);

    if (!result.verified) {
      return NextResponse.json(
        { error: result.error || "Registration failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Fingerprint enrolled successfully",
      template: result.template,
    });
  } catch (error) {
    console.error("[API /biometric/webauthn/register/verify] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
