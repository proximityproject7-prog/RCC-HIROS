"use client";
import { ReactNode } from "react";
import { usePermissions } from "@/hooks/use-permissions";

export function PermissionGuard({ require, any, children, fallback = null }: {
  require?: string; any?: string[]; children: ReactNode; fallback?: ReactNode;
}) {
  const { has, hasAny } = usePermissions();
  if (require && !has(require)) return <>{fallback}</>;
  if (any && !hasAny(any)) return <>{fallback}</>;
  return <>{children}</>;
}
