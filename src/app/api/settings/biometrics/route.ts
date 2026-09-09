import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET  /api/settings/biometrics  — PUBLIC (login page checks this)
// POST /api/settings/biometrics  — attendance.edit required
// ═══════════════════════════════════════════════════════════════

export async function GET() {
  try {
    const setting = await db.systemSetting.findUnique({
      where: { key: "biometrics_enabled" },
    });
    const enabled = setting ? setting.value === "true" : false;
    return NextResponse.json({ enabled });
  } catch (error) {
    console.error("[API /settings/biometrics GET] Error:", error);
    return NextResponse.json({ enabled: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "attendance.edit");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { enabled } = body as { enabled?: boolean };

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 }
      );
    }

    await db.systemSetting.upsert({
      where: { key: "biometrics_enabled" },
      update: { value: String(enabled) },
      create: { key: "biometrics_enabled", value: String(enabled), category: "biometrics" },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: enabled ? "Enable Biometrics" : "Disable Biometrics",
        entity: "SystemSetting",
        entityId: "biometrics_enabled",
        metadata: JSON.stringify({ enabled }),
      },
    });

    return NextResponse.json({ enabled });
  } catch (error) {
    console.error("[API /settings/biometrics POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
