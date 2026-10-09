// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Evaluation period scope-overlap helper (A1 fix)
// Periods carry groupIds / targetRoleIds as JSON text: null = all,
// "[]" = nobody. Opening a period closes only other OPEN periods
// whose scope overlaps (same department/role coverage), so CCS and
// CBA can each run their own period simultaneously.
// ═══════════════════════════════════════════════════════════════

export type ScopeList = string[] | null; // null = institution-wide

function parseScope(raw: string | null): ScopeList {
  if (raw === null || raw === undefined) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : null;
  } catch {
    return null;
  }
}

function listsOverlap(a: ScopeList, b: ScopeList): boolean {
  // "[]" (nobody) overlaps with nothing.
  if (a !== null && a.length === 0) return false;
  if (b !== null && b.length === 0) return false;
  // null (all) overlaps with any non-empty scope.
  if (a === null || b === null) return true;
  return a.some((id) => b.includes(id));
}

/**
 * Do two period scopes overlap? Overlap requires BOTH the group
 * coverage and the role coverage to intersect.
 */
export function periodScopesOverlap(
  aGroups: ScopeList,
  aRoles: ScopeList,
  bGroups: ScopeList,
  bRoles: ScopeList
): boolean {
  return listsOverlap(aGroups, bGroups) && listsOverlap(aRoles, bRoles);
}

export { parseScope };
