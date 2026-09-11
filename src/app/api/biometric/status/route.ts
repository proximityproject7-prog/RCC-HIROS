import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-token";
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

    // Allow self or biometric.manage
    const auth = await requirePermission(request, "biometric.manage");
    const isSelf = auth.ok && auth.user.id === employeeId;
    if (!auth.ok && !isSelf) return auth.response;

    const templates = await db.biometricTemplate.findMany({
      where: { employeeId },
      select: { id: true, fingerIndex: true, quality: true, createdAt: true },
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
