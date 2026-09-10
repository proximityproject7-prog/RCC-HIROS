import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOpts } from "@/lib/webauthn";

// ═══════════════════════════════════════════════════════════════
// POST /api/biometric/webauthn/authenticate/options
// UNAUTHENTICATED - used by kiosk
// Returns WebAuthn authentication options for kiosk clock-in
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const options = await generateAuthenticationOpts();
    return NextResponse.json(options);
  } catch (error) {
    console.error("[API /biometric/webauthn/authenticate/options] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
