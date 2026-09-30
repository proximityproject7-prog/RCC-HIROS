"use client";

import { useEffect, useCallback, useRef, useState } from "react";

/**
 * Warns before leaving the page or navigating when there are unsaved changes.
 *
 * - Registers a `beforeunload` listener to block browser tab close / refresh.
 * - Exposes `confirmNavigation()` that returns `true` if safe to proceed.
 *
 * Usage:
 * ```ts
 * const hasChanges = useUnsavedChanges(dirty);
 * // ...
 * if (hasChanges) return; // don't navigate
 * ```
 */
export function useUnsavedChanges(isDirty: boolean): boolean {
  const isDirtyRef = useRef(isDirty);

  // Keep ref in sync so the beforeunload handler always reads the latest value.
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return isDirty;
}

/**
 * In-app navigation guard for unsaved changes. Unlike the native
 * `window.confirm`, this drives the shared `ConfirmDialog` component so
 * dirty-navigation prompts match the app's UI/UX.
 *
 * Returns `requestNavigation(action)` — runs `action` immediately when
 * clean, otherwise opens the dialog — plus `navDialogProps` to spread
 * onto a single `<ConfirmDialog />` rendered by the component:
 *
 * @example
 * ```tsx
 * const { requestNavigation, navDialogProps } = useNavigationGuard(isDirty);
 *
 * <button onClick={() => requestNavigation(() => onBack())}>Back</button>
 * ...
 * {navDialogProps && <ConfirmDialog {...navDialogProps} />}
 * ```
 */
export interface NavigationGuardDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

export function useNavigationGuard(
  isDirty: boolean,
  opts?: {
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }
): {
  requestNavigation: (action: () => void) => void;
  navDialogProps: NavigationGuardDialogProps | null;
} {
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const [pending, setPending] = useState<(() => void) | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  pendingRef.current = pending;

  const requestNavigation = useCallback((action: () => void) => {
    if (!isDirtyRef.current) {
      action();
      return;
    }
    setPending(() => action);
  }, []);

  const handleCancel = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  const handleConfirm = useCallback(() => {
    const fn = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    fn?.();
  }, []);

  return {
    requestNavigation,
    navDialogProps: pending
      ? {
          open: true,
          title: opts?.title ?? "Unsaved changes",
          message:
            opts?.message ?? "You have unsaved changes. Leave anyway?",
          confirmLabel: opts?.confirmLabel ?? "Leave",
          cancelLabel: opts?.cancelLabel ?? "Stay",
          variant: "warning" as const,
          onConfirm: handleConfirm,
          onCancel: handleCancel,
        }
      : null,
  };
}
