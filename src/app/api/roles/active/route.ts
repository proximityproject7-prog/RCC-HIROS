import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET /api/roles/active
// Lightweight list of active roles for dropdowns. Auth only (no perm check).
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const roles = await db.role.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        scopeAllProfiling: true,
        scopeAllEvaluation: true,
        scopeAllLeave: true,
        scopeAllReports: true,
        scopeAllAttendance: true,
        canSelfApproveLeave: true,
        isSystem: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ roles });
  } catch (error) {
    console.error("[API /roles/active] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
