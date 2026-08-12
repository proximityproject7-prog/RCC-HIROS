// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Browser-side API client
// Token storage + fetch wrapper with Bearer auth + 401 handling.
// ═══════════════════════════════════════════════════════════════

const TOKEN_KEY = "hiros_token";

// ───────────────────────────────────────────────────────────────
// Token storage (localStorage)
// ───────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event("auth-token-change"));
}

export function removeToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event("auth-token-change"));
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

// ───────────────────────────────────────────────────────────────
// ApiError — structured error from API responses
// ───────────────────────────────────────────────────────────────

export interface ApiErrorShape {
  message: string;
  status: number;
  details?: unknown;
}

export class ApiError extends Error implements ApiErrorShape {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

// ───────────────────────────────────────────────────────────────
// apiFetch — wraps fetch with Bearer token + 401 handling
// ───────────────────────────────────────────────────────────────

export interface ApiFetchOptions extends RequestInit {
  /** Pass true to skip JSON content-type header (e.g. for FormData). */
  skipJsonHeader?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const token = getToken();
  const { skipJsonHeader, headers: rawHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(rawHeaders as Record<string, string>),
  };
  if (!skipJsonHeader && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...rest, headers });

  // 401 — token expired or invalid: clear and reset nav so next login lands on dashboard
  if (res.status === 401) {
    removeToken();
    // Reset currentPage via zustand store (called outside React render cycle).
    try {
      const { useAuthStore } = await import("@/store/auth-store");
      useAuthStore.getState().resetNavigation();
    } catch {
      // store import failed — nothing more we can do
    }
    throw new ApiError("Session expired. Please log in again.", 401);
  }

  // Attempt to parse JSON body for structured error info.
  let data: unknown = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : null) ||
      (data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : null) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, data);
  }

  // Some endpoints (DELETE) may return no body — fall back to {}.
  return (data ?? ({} as T)) as T;
}

/** Alias for use in React Query hooks. */
export const authFetchJSON = apiFetch;
