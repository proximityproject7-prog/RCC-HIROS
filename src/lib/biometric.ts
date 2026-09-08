// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Biometric / fingerprint kiosk shared constants
// ═══════════════════════════════════════════════════════════════

/** Max fingerprint templates enrollable per employee (capstone scope). */
export const MAX_TEMPLATES_PER_EMPLOYEE = 2;

/** Human labels for the 10 finger slots (fingerIndex 0-9). */
export const FINGER_LABELS = [
  "Right Thumb",
  "Right Index",
  "Right Middle",
  "Right Ring",
  "Right Little",
  "Left Thumb",
  "Left Index",
  "Left Middle",
  "Left Ring",
  "Left Little",
] as const;

export function fingerLabel(index: number): string {
  return FINGER_LABELS[index] ?? `Finger ${index + 1}`;
}

/** WebSocket URL of the local Python fingerprint service. */
export function fingerprintServiceUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_FINGERPRINT_SERVICE_URL || "ws://localhost:8765";
  return base.replace(/\/$/, "");
}
