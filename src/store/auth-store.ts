import { create } from "zustand";
import { persist } from "zustand/middleware";

// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — UI-only navigation state
// Auth state lives in AuthProvider (server-backed via /api/auth/me).
// ═══════════════════════════════════════════════════════════════

interface AppState {
  currentPage: string;
  currentSubpage?: string;
  sidebarCollapsed: boolean;
  setCurrentPage: (page: string, subpage?: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  resetNavigation: () => void;
}

export const useAuthStore = create<AppState>()(
  persist(
    (set) => ({
      currentPage: "dashboard",
      currentSubpage: undefined,
      sidebarCollapsed: false,
      setCurrentPage: (page, subpage) =>
        set({ currentPage: page, currentSubpage: subpage }),
      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),
      resetNavigation: () =>
        set({ currentPage: "dashboard", currentSubpage: undefined, sidebarCollapsed: false }),
    }),
    {
      name: "rcc-nav-state",
      partialize: (state) => ({
        currentPage: state.currentPage,
        currentSubpage: state.currentSubpage,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
