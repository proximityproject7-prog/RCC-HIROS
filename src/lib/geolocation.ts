import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Geolocation & Geofence helpers
// Loads premises config from SystemSetting, computes haversine
// distance, and evaluates whether a clock-in/out is on-premise.
// ═══════════════════════════════════════════════════════════════

export interface PremisesConfig {
  /** Latitude of the premises center. */
  lat: number;
  /** Longitude of the premises center. */
  lng: number;
  /** Allowed radius in meters. */
  radiusMeters: number;
  /** Human-readable label shown to users. */
  label: string;
}

const DEFAULT_PREMISES: PremisesConfig = {
  lat: 15.1428,
  lng: 120.5886,
  radiusMeters: 200,
  label: "Republic Central Colleges - Angeles",
};

const SETTING_KEY = "premises_config";

/**
 * Load premises configuration from SystemSetting (JSON value).
 * Falls back to DEFAULT_PREMISES if not configured or invalid.
 */
export async function getPremisesConfig(): Promise<PremisesConfig> {
  try {
    const row = await db.systemSetting.findUnique({
      where: { key: SETTING_KEY },
    });
    if (!row?.value) return DEFAULT_PREMISES;
    const parsed = JSON.parse(row.value) as Partial<PremisesConfig>;
    return {
      lat: typeof parsed.lat === "number" ? parsed.lat : DEFAULT_PREMISES.lat,
      lng: typeof parsed.lng === "number" ? parsed.lng : DEFAULT_PREMISES.lng,
      radiusMeters:
        typeof parsed.radiusMeters === "number"
          ? parsed.radiusMeters
          : DEFAULT_PREMISES.radiusMeters,
      label: typeof parsed.label === "string" ? parsed.label : DEFAULT_PREMISES.label,
    };
  } catch {
    return DEFAULT_PREMISES;
  }
}

/**
 * Haversine distance between two coordinates in meters.
 * Standard formula using Earth's mean radius = 6,371,000 m.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export interface GeofenceEvaluation {
  onPremise: boolean;
  distance: number; // meters from premises center
}

/**
 * Evaluate whether a coordinate is within the configured premises geofence.
 * Returns onPremise + distance from center.
 */
export async function evaluateGeofence(
  lat: number,
  lng: number
): Promise<GeofenceEvaluation> {
  const cfg = await getPremisesConfig();
  const distance = haversineMeters(lat, lng, cfg.lat, cfg.lng);
  return { onPremise: distance <= cfg.radiusMeters, distance };
}

/** Format a meter distance for display. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  const km = (meters / 1000).toFixed(2);
  return `${km} km`;
}

/** Build an OpenStreetMap URL for the given coordinates (debug / display). */
export function osmUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}
