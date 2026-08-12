"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getToken, setToken, removeToken, apiFetch } from "@/lib/api-client";

// ═══════════════════════════════════════════════════════════════
// AuthUser — mirrors server-side AuthUser (src/lib/auth-token.ts)
// ═══════════════════════════════════════════════════════════════

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;

  // Scope flags
  scopeAllProfiling: boolean;
  scopeAllEvaluation: boolean;
  scopeAllLeave: boolean;
  scopeAllReports: boolean;
  scopeAllAttendance: boolean;
  canSelfApproveLeave: boolean;
  isSystem: boolean;

  // Employee profile
  employeeId?: string; // "EMP-0001"
  groupId: string | null;
  group?: { id: string; name: string; code: string } | null;
  active: boolean;
  mustChangePassword: boolean;

  // Effective permissions
  permissions: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ───────────────────────────────────────────────────────────────
// useSyncExternalStore for localStorage token (hydration-safe)
// ───────────────────────────────────────────────────────────────

function subscribe(callback: () => void) {
  window.addEventListener("auth-token-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("auth-token-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("hiros_token");
}

function getServerSnapshot() {
  return null;
}

// ───────────────────────────────────────────────────────────────
// AuthProvider
// ───────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false); // false on SSR, set true on mount
  const [hasMounted, setHasMounted] = useState(false);
  const resetNavigation = useAuthStore((s) => s.resetNavigation);

  // Mark as mounted on client — prevents hydration mismatch
  useEffect(() => {
    setHasMounted(true);
    setIsLoading(true); // Now that we're on the client, start loading
  }, []);

  const fetchUser = useCallback(async () => {
    const currentToken = getToken();
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const data = await apiFetch<{ user: AuthUser }>("/api/auth/me");
      setUser(data.user);
    } catch {
      removeToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch user when token changes (only after mount to avoid hydration issues)
  useEffect(() => {
    if (!hasMounted) return;
    if (token) {
      fetchUser();
    } else {
      setUser(null);
      setIsLoading(false);
    }
  }, [token, fetchUser, hasMounted]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      setToken(data.token);
      setUser(data.user);
      // Always land on dashboard after a fresh login (not whatever page they were on before)
      resetNavigation();
    },
    [resetNavigation]
  );

  const logout = useCallback(() => {
    removeToken();
    setUser(null);
    // Clear currentPage so the next login lands on dashboard.
    resetNavigation();
  }, [resetNavigation]);

  const mustChangePassword = user?.mustChangePassword ?? false;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        mustChangePassword,
        login,
        logout,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}
