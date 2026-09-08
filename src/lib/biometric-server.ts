// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Biometric server helpers (import from API routes ONLY,
// never from client components — pulls in the DB client).
// ═══════════════════════════════════════════════════════════════

import { db } from "@/lib/db";

export const BIOMETRICS_SETTING_KEY = "biometrics.enabled";

/** Master kill switch. Missing row = ON (preserves current behavior). */
export async function getBiometricsEnabled(): Promise<boolean> {
  try {
    const row = await db.systemSetting.findUnique({
      where: { key: BIOMETRICS_SETTING_KEY },
      select: { value: true },
    });
    if (!row) return true;
    return row.value.trim().toLowerCase() !== "false";
  } catch {
    // Fail open like today if the settings table is unreachable.
    return true;
  }
}
