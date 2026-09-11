"use client";

import { useEffect, useCallback, useRef } from "react";

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
 * Returns a `confirmNavigation` callback that prompts the user if there are
 * unsaved changes. Call it before any manual navigation (sidebar clicks,
 * Back buttons, etc.).
 *
 * @example
 * ```tsx
 * const confirmNavigation = useNavigationGuard(isDirty);
 *
 * <button onClick={() => {
 *   if (!confirmNavigation()) return;
 *   onBack();
 * }}>Back</button>
 * ```
 */
export function useNavigationGuard(isDirty: boolean): () => boolean {
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const confirm = useCallback(() => {
    if (!isDirtyRef.current) return true;
    return window.confirm("You have unsaved changes. Leave anyway?");
  }, []);

  return confirm;
}
