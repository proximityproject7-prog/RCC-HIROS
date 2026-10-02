import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-token";
import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════
// GET /api/biometric/status?employeeId=xxx
// biometric.manage or self
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");

    if (!employeeId) {
      return NextResponse.json({ error: "Missing employeeId" }, { status: 400 });
    }

    // Allow self or biometric.manage (or system admin)
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const isSelf = auth.user.id === employeeId;
    const canView =
      isSelf ||
      auth.user.isSystem ||
      auth.user.permissions.includes("biometric.manage");
    if (!canView) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 }
      );
    }

    const templates = await db.biometricTemplate.findMany({
      where: { employeeId },
      select: { id: true, fingerIndex: true, engine: true, quality: true, createdAt: true },
      orderBy: { fingerIndex: "asc" },
    });

    return NextResponse.json({
      enrolled: templates.length,
      templates,
    });
  } catch (error) {
    console.error("[API /biometric/status] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
