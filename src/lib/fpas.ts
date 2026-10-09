// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Single source of truth for the FPAS "can fill" rule
// (A9 fix). Previously re-implemented in four places; all callers
// must use this helper so the next rule change touches one file.
// Rule: empty/unknown enabled list = all enabled; groupless
// employee = allowed; bypass (fpas.manage / system) = allowed.
// ═══════════════════════════════════════════════════════════════

export interface CanFillFpasInput {
  /** The target employee's groupId (null/undefined = groupless). */
  groupId: string | null | undefined;
  /** Enabled group IDs (null/undefined = not yet loaded/failed → allowed). */
  enabledGroupIds: string[] | null | undefined;
  /** Manager bypass (fpas.manage holder or system). */
  bypass?: boolean;
}

export function canFillFpas({
  groupId,
  enabledGroupIds,
  bypass = false,
}: CanFillFpasInput): boolean {
  if (!enabledGroupIds || enabledGroupIds.length === 0) return true;
  if (!groupId) return true;
  if (bypass) return true;
  return enabledGroupIds.includes(groupId);
}
