"use client";

import { type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Shared Alert Components
// Consistent error, success, and warning messages.
// ═══════════════════════════════════════════════════════════════

interface AlertProps {
  children: ReactNode;
  className?: string;
}

// ─── Error Alert ─────────────────────────────────────────────
export function ErrorAlert({ children, className = "" }: AlertProps) {
  return (
    <div className={`bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error ${className}`}>
      {children}
    </div>
  );
}

// ─── Success Alert ───────────────────────────────────────────
export function SuccessAlert({ children, className = "" }: AlertProps) {
  return (
    <div className={`bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-700 ${className}`}>
      {children}
    </div>
  );
}

// ─── Warning Alert (with icon) ───────────────────────────────
export function WarningAlert({ children, className = "" }: AlertProps) {
  return (
    <div className={`bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800 flex items-start gap-2 ${className}`}>
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

// ─── Info Alert (with icon) ──────────────────────────────────
export function InfoAlert({ children, className = "" }: AlertProps) {
  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-700 flex items-start gap-2 ${className}`}>
      <Info className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
