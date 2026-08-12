"use client";

import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  getVisibleModules,
  hasPermission,
  hasAnyPermission,
  MODULES,
  type ModuleDef,
} from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════
// usePermissions — exposes permission helpers + scope flags + visible modules
// ═══════════════════════════════════════════════════════════════

export interface UsePermissionsResult {
  /** Whether the user has the given permission identifier. */
  has: (identifier: string) => boolean;
  /** Whether the user has ANY of the given permission identifiers. */
  hasAny: (identifiers: string[]) => boolean;
  /** Visible sidebar modules based on the user's permission set. */
  visibleModules: ModuleDef[];
  /** True if the user is a System Admin (bypasses all checks). */
  isSystemAdmin: boolean;
  /** Scope flags from the user's role. */
  scopeAllProfiling: boolean;
  scopeAllEvaluation: boolean;
  scopeAllLeave: boolean;
  scopeAllReports: boolean;
  scopeAllAttendance: boolean;
  /** Whether the user can self-approve their own leave requests. */
  canSelfApproveLeave: boolean;
  /** Raw permission set (frozen list). */
  permissions: string[];
}

export function usePermissions(): UsePermissionsResult {
  const { user } = useAuth();

  const permissions = user?.permissions ?? [];
  const isSystemAdmin = user?.isSystem ?? false;

  return useMemo(() => {
    // System admin has effective access to every permission.
    const effectivePerms = isSystemAdmin ? new Set<string>(["*"]) : new Set<string>(permissions);

    const has = (identifier: string) => {
      if (isSystemAdmin) return true;
      return effectivePerms.has(identifier);
    };

    const hasAny = (identifiers: string[]) => {
      if (isSystemAdmin) return true;
      if (identifiers.length === 0) return false;
      return identifiers.some((id) => effectivePerms.has(id));
    };

    const visibleModules = isSystemAdmin
      ? [...MODULES] // System admin sees ALL modules
      : getVisibleModules(permissions);

    return {
      has,
      hasAny,
      visibleModules,
      isSystemAdmin,
      scopeAllProfiling: user?.scopeAllProfiling ?? false,
      scopeAllEvaluation: user?.scopeAllEvaluation ?? false,
      scopeAllLeave: user?.scopeAllLeave ?? false,
      scopeAllReports: user?.scopeAllReports ?? false,
      scopeAllAttendance: user?.scopeAllAttendance ?? false,
      canSelfApproveLeave: user?.canSelfApproveLeave ?? false,
      permissions,
    };
  }, [permissions, isSystemAdmin, user]);
}
