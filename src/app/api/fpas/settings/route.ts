import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

const SETTING_KEY = "fpas_enabled_groups";

// ═══════════════════════════════════════════════════════════════
// GET /api/fpas/settings — returns enabled group IDs
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "fpas.fill");
    if (!auth.ok) return auth.response;

    const setting = await db.systemSetting.findUnique({
      where: { key: SETTING_KEY },
    });

    let enabledGroupIds: string[] = [];
    if (setting?.value) {
      try {
        enabledGroupIds = JSON.parse(setting.value);
      } catch {
        enabledGroupIds = [];
      }
    }

    return NextResponse.json({ enabledGroupIds });
  } catch (error) {
    console.error("[API /fpas/settings] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH /api/fpas/settings — update enabled group IDs
// ═══════════════════════════════════════════════════════════════
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "fpas.manage");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { enabledGroupIds } = body as { enabledGroupIds?: string[] };

    if (!Array.isArray(enabledGroupIds)) {
      return NextResponse.json(
        { error: "enabledGroupIds must be an array" },
        { status: 400 }
      );
    }

    const value = JSON.stringify(enabledGroupIds);

    await db.systemSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value, category: "fpas" },
      update: { value },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "update",
        entity: "fpas_settings",
        metadata: JSON.stringify({ enabledGroupIds }),
      },
    });

    return NextResponse.json({ enabledGroupIds });
  } catch (error) {
    console.error("[API /fpas/settings] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
