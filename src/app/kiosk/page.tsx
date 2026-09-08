"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import LoginPage from "@/components/login-page";
import ChangePasswordModal from "@/components/shared/change-password-modal";
import { PermissionDenied } from "@/components/shared/permission-denied";
import { KioskScreen } from "@/components/kiosk/KioskScreen";

// Standalone kiosk route (no AppLayout sidebar) — same auth gates as HomePage.
export default function KioskPage() {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const { has, isSystemAdmin } = usePermissions();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-stone-400">Loading kiosk…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginPage />;
  if (mustChangePassword) return <ChangePasswordModal />;
  if (!isSystemAdmin && !has("kiosk.view")) return <PermissionDenied />;

  return <KioskScreen />;
}
