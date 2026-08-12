import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireAuth,
  requireAnyPermission,
} from "@/lib/auth-token";
import { getPremisesConfig } from "@/lib/geolocation";

// ═══════════════════════════════════════════════════════════════
// /api/settings/premises
// GET  auth                                                — read config
// POST attendance.edit OR roles.edit                       — update config
//   Body: { lat, lng, radiusMeters, label }
// ═══════════════════════════════════════════════════════════════

const SETTING_KEY = "premises_config";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const config = await getPremisesConfig();
    return NextResponse.json({ premises: config });
  } catch (error) {
    console.error("[API /settings/premises GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAnyPermission(request, [
      "attendance.edit",
      "roles.edit",
    ]);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { lat, lng, radiusMeters, label } = body as {
      lat?: number;
      lng?: number;
      radiusMeters?: number;
      label?: string;
    };

    // Validate inputs
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      typeof radiusMeters !== "number" ||
      typeof label !== "string" ||
      !label.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "lat, lng, radiusMeters (numbers) and label (non-empty string) are required",
        },
        { status: 400 }
      );
    }
    if (lat < -90 || lat > 90) {
      return NextResponse.json(
        { error: "lat must be between -90 and 90" },
        { status: 400 }
      );
    }
    if (lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: "lng must be between -180 and 180" },
        { status: 400 }
      );
    }
    if (radiusMeters < 1 || radiusMeters > 100_000) {
      return NextResponse.json(
        { error: "radiusMeters must be between 1 and 100,000 meters" },
        { status: 400 }
      );
    }

    const value = JSON.stringify({
      lat,
      lng,
      radiusMeters: Math.round(radiusMeters),
      label: label.trim(),
    });

    // Upsert the SystemSetting row
    const existing = await db.systemSetting.findUnique({
      where: { key: SETTING_KEY },
    });
    if (existing) {
      await db.systemSetting.update({
        where: { key: SETTING_KEY },
        data: { value, category: "attendance" },
      });
    } else {
      await db.systemSetting.create({
        data: { key: SETTING_KEY, value, category: "attendance" },
      });
    }

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Update Premises Config",
        entity: "SystemSetting",
        entityId: SETTING_KEY,
        metadata: value,
      },
    });

    return NextResponse.json({
      premises: { lat, lng, radiusMeters: Math.round(radiusMeters), label: label.trim() },
    });
  } catch (error) {
    console.error("[API /settings/premises POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
