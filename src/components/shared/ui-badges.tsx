"use client";

import { type ReactNode } from "react";

// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Shared Badge Components
// All badges use consistent sizing, weight, and radius.
// ═══════════════════════════════════════════════════════════════

type BadgeVariant = "default" | "success" | "danger" | "warning" | "info" | "accent" | "muted";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-600 border-gray-200",
  success: "bg-green-50 text-green-700 border-green-200",
  danger: "bg-red-50 text-rcc-error border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  accent: "bg-rcc-accent/10 text-rcc-accent border-rcc-accent/20",
  muted: "bg-rcc-bg text-rcc-text-muted border-rcc-border",
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </span>
  );
}

// ─── Dot Badge (with status dot) ─────────────────────────────
interface DotBadgeProps extends BadgeProps {
  dot?: boolean;
}

export function DotBadge({ children, variant = "default", dot = true, className = "" }: DotBadgeProps) {
  const dotColor = variant === "success" ? "bg-green-500"
    : variant === "danger" ? "bg-red-500"
    : variant === "warning" ? "bg-amber-500"
    : variant === "info" ? "bg-blue-500"
    : "bg-gray-400";

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold border ${VARIANT_CLASSES[variant]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      {children}
    </span>
  );
}

// ─── Pill Badge (rounded-full, for status toggles) ───────────
interface PillBadgeProps extends BadgeProps {
  dot?: boolean;
}

export function PillBadge({ children, variant = "default", dot = true, className = "" }: PillBadgeProps) {
  const dotColor = variant === "success" ? "bg-green-500"
    : variant === "danger" ? "bg-red-500"
    : variant === "warning" ? "bg-amber-500"
    : variant === "info" ? "bg-blue-500"
    : "bg-gray-400";

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${VARIANT_CLASSES[variant]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      {children}
    </span>
  );
}
