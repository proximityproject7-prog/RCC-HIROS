import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-token";
import { generateRegistrationOpts } from "@/lib/webauthn";

// ═══════════════════════════════════════════════════════════════
// POST /api/biometric/webauthn/register/options
// biometric.enroll required
// Returns WebAuthn registration options for enrollment
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

    if (fingerIndex < 0 || fingerIndex > 1) {
      return NextResponse.json(
        { error: "fingerIndex must be 0 or 1" },
        { status: 400 }
      );
    }

    const options = await generateRegistrationOpts(employeeId, fingerIndex);

    return NextResponse.json(options);
  } catch (error) {
    console.error("[API /biometric/webauthn/register/options] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
