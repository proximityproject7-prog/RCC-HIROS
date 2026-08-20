"use client";
import { useAuth, useInactivityTimer } from "@/hooks/use-auth";
import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { DynamicSidebar } from "@/components/shared/dynamic-sidebar";
import InactivityWarningModal from "@/components/shared/inactivity-warning-modal";
import { GeofenceGuard } from "@/components/shared/geofence-guard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const handleInactivityWarning = useCallback(() => setShowInactivityWarning(true), []);
  const { resetTimer } = useInactivityTimer(handleInactivityWarning);
  const handleStayLoggedIn = useCallback(() => { setShowInactivityWarning(false); resetTimer(); }, [resetTimer]);
  const handleLogoutNow = useCallback(() => { setShowInactivityWarning(false); logout(); }, [logout]);
  const handleTimeout = useCallback(() => { setShowInactivityWarning(false); logout(); }, [logout]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <GeofenceGuard onLogout={logout}>
      <div className="flex h-screen bg-rcc-bg overflow-hidden">
        <DynamicSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 bg-rcc-surface border-b border-rcc-border flex items-center justify-between px-6 shrink-0">
            <h1 className="text-base font-semibold text-rcc-text-primary">{user?.roleName ?? "User"}</h1>
            <div className="flex items-center gap-3">
              <div ref={userMenuRef} className="relative">
                <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-rcc-bg transition-colors">
                  <div className="w-8 h-8 rounded-full bg-rcc-primary flex items-center justify-center">
                    <span className="text-xs font-bold text-rcc-primary-foreground">{(user?.name ?? "?").charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium text-rcc-text-primary leading-tight">{user?.name ?? ""}</p>
                    <p className="text-xs text-rcc-text-muted leading-tight">{user?.email ?? ""}</p>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-rcc-text-muted" />
                </button>
                {showUserMenu && (
                  <div className="absolute right-0 top-12 w-56 bg-rcc-surface rounded-lg shadow-lg border border-rcc-border z-50">
                    <div className="px-4 py-3 border-b border-rcc-border">
                      <p className="text-sm font-medium text-rcc-text-primary">{user?.name ?? ""}</p>
                      <p className="text-xs text-rcc-text-muted">{user?.email ?? ""}</p>
                      <p className="text-xs text-rcc-text-muted mt-0.5">Role: {user?.roleName ?? ""}</p>
                    </div>
                    <div className="p-1">
                      <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rcc-error hover:bg-red-50 rounded-md transition-colors">
                        <LogOut className="h-4 w-4" /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
        <InactivityWarningModal key={showInactivityWarning ? "open" : "closed"} open={showInactivityWarning} onStayLoggedIn={handleStayLoggedIn} onLogoutNow={handleLogoutNow} onTimeout={handleTimeout} />
      </div>
    </GeofenceGuard>
  );
}
