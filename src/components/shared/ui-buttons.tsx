"use client";

import { type ReactNode } from "react";
import { Plus } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Shared Button Components
// All buttons use consistent styling from this module.
// ═══════════════════════════════════════════════════════════════

interface ButtonBaseProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit";
}

const BASE_TRANSITION = "transition-colors";

// ─── Primary ─────────────────────────────────────────────────
export function PrimaryButton({ children, onClick, disabled, className = "", title, type = "button" }: ButtonBaseProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 disabled:opacity-50 ${BASE_TRANSITION} ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Secondary / Cancel ──────────────────────────────────────
export function SecondaryButton({ children, onClick, disabled, className = "", title, type = "button" }: ButtonBaseProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg disabled:opacity-50 ${BASE_TRANSITION} ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Danger ──────────────────────────────────────────────────
export function DangerButton({ children, onClick, disabled, className = "", title, type = "button" }: ButtonBaseProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-rcc-error text-white hover:bg-red-700 disabled:opacity-50 ${BASE_TRANSITION} ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Success / Approve ───────────────────────────────────────
export function SuccessButton({ children, onClick, disabled, className = "", title, type = "button" }: ButtonBaseProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 ${BASE_TRANSITION} ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Icon Button ─────────────────────────────────────────────
interface IconButtonProps extends ButtonBaseProps {
  variant?: "default" | "danger";
}

export function IconButton({ children, onClick, disabled, className = "", title, variant = "default", type = "button" }: IconButtonProps) {
  const variantClasses = variant === "danger"
    ? "text-rcc-text-muted hover:text-rcc-error hover:bg-red-50"
    : "text-rcc-text-secondary hover:text-rcc-primary hover:bg-rcc-bg";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-md disabled:opacity-50 ${variantClasses} ${BASE_TRANSITION} ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Toggle Button (New X / Cancel) ──────────────────────────
interface ToggleButtonProps {
  isActive: boolean;
  onClick: () => void;
  activeLabel: string;
  inactiveLabel: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function ToggleButton({ isActive, onClick, activeLabel, inactiveLabel, icon, disabled, className = "" }: ToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold ${BASE_TRANSITION} ${
        isActive
          ? "border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg"
          : "bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90"
      } disabled:opacity-50 ${className}`}
    >
      {icon ?? <Plus className="h-4 w-4" />}
      {isActive ? activeLabel : inactiveLabel}
    </button>
  );
}
