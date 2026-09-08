import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission } from "@/lib/auth-token";
import {
  BIOMETRICS_SETTING_KEY,
  getBiometricsEnabled,
} from "@/lib/biometric-server";

// ═══════════════════════════════════════════════════════════════
// /api/settings/biometrics — fingerprint master switch
// GET  public (no auth) — the logged-out login kiosk panel must
//      read it. Returns a bare boolean; nothing sensitive.
// POST attendance.edit OR roles.edit — update the switch
//   Body: { enabled: boolean }
// ═══════════════════════════════════════════════════════════════

export async function GET() {
  try {
    const enabled = await getBiometricsEnabled();
    return NextResponse.json({ enabled });
  } catch (error) {
    console.error("[API /settings/biometrics GET] Error:", error);
    return NextResponse.json({ enabled: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAnyPermission(request, [
      "attendance.edit",
      "roles.edit",
    ]);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled (boolean) is required" },
        { status: 400 }
      );
    }
    const enabled: boolean = body.enabled;
    const value = enabled ? "true" : "false";

    const existing = await db.systemSetting.findUnique({
      where: { key: BIOMETRICS_SETTING_KEY },
    });
    if (existing) {
      await db.systemSetting.update({
        where: { key: BIOMETRICS_SETTING_KEY },
        data: { value, category: "attendance" },
      });
    } else {
      await db.systemSetting.create({
        data: { key: BIOMETRICS_SETTING_KEY, value, category: "attendance" },
      });
    }

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Update Biometrics Config",
        entity: "SystemSetting",
        entityId: BIOMETRICS_SETTING_KEY,
        metadata: value,
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
