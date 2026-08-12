"use client";

import { useAuthContext } from "@/components/providers/auth-provider";
import { useEffect, useRef, useCallback } from "react";

interface UseAuthReturn {
  user: ReturnType<typeof useAuthContext>["user"];
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

/** Wraps useAuthContext + useInactivityTimer (10 min). */
export function useAuth(): UseAuthReturn {
  const { user, isAuthenticated, isLoading, mustChangePassword, logout, refreshUser } =
    useAuthContext();

  // 10-minute inactivity timer — auto-logout on expiry.
  useInactivityTimer();

  return {
    user,
    isAuthenticated,
    isLoading,
    mustChangePassword,
    logout,
    refreshUser,
  };
}

/**
 * Inactivity timer — auto-logout after 10 minutes of no activity.
 * Fires `onWarning` at 9 minutes (60 seconds before logout) so the UI can show
 * a "Still there?" modal giving the user a chance to extend the session.
 */
export function useInactivityTimer(onWarning?: () => void) {
  const { isAuthenticated, logout } = useAuthContext();
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes
  const WARNING_MS = 9 * 60 * 1000; // 9 minutes (60s before logout)

  const resetTimer = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (isAuthenticated) {
      if (onWarning) {
        warningTimerRef.current = setTimeout(() => {
          onWarning();
        }, WARNING_MS);
      }
      logoutTimerRef.current = setTimeout(() => {
        logout();
      }, INACTIVITY_MS);
    }
  }, [isAuthenticated, logout, onWarning]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      return;
    }

    const events = ["mousedown", "keydown", "scroll", "touchstart", "click"] as const;
    const handleActivity = () => resetTimer();

    events.forEach((event) => window.addEventListener(event, handleActivity));
    resetTimer();

    return () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      events.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [isAuthenticated, resetTimer]);

  return { resetTimer };
}
