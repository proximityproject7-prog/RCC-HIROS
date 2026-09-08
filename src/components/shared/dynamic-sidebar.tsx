"use client";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useAuthStore } from "@/store/auth-store";
import { MODULES } from "@/lib/permissions";
import Image from "next/image";
import {
  LayoutDashboard, Users, Clock, ClipboardCheck, CalendarClock,
  BarChart3, ShieldCheck, Building2, ChevronLeft, ChevronRight, UserCircle, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, Clock, ClipboardCheck, CalendarClock, BarChart3, ShieldCheck, Building2,
};

export function DynamicSidebar() {
  const { visibleModules, has } = usePermissions();
  const { user } = useAuth();
  const { currentPage, setCurrentPage, sidebarCollapsed, setSidebarCollapsed } = useAuthStore();

  function handleClick(m: typeof MODULES[0]) {
    if (m.key === "leave" || m.key === "evaluation") {
      // Unified page — all features gated by permissions within the page
      setCurrentPage(m.key);
    } else if (m.key === "attendance") {
      if (has("attendance.view")) setCurrentPage("attendance", "all");
      else setCurrentPage("attendance");
    } else {
      setCurrentPage(m.key);
    }
  }

  const profileActive = currentPage === "profiling" && (window as any).__navSubpage?.startsWith("view:") && (window as any).__navSubpage === `view:${user?.id}`;

  return (
    <aside className={`${sidebarCollapsed ? "w-[68px]" : "w-[260px]"} bg-rcc-sidebar-bg flex flex-col shrink-0 transition-all duration-300`}>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
        <div className="w-9 h-9 shrink-0">
          <Image src="/hiros-logo-sidebar.png" alt="RCC-HIROS" width={36} height={36} className="object-contain w-full h-full" />
        </div>
        {!sidebarCollapsed && (
          <div className="overflow-hidden">
            <h2 className="text-sm font-bold text-rcc-primary-foreground tracking-tight">RCC-HIROS</h2>
            <p className="text-xs text-rcc-primary-foreground/50">HR Operations System</p>
          </div>
        )}
      </div>
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        {visibleModules.length === 0 && !sidebarCollapsed && (
          <div className="px-3 py-6 text-center"><p className="text-xs text-rcc-primary-foreground/40">No modules assigned.<br />Contact your administrator.</p></div>
        )}
        {visibleModules.map((m) => {
          const Icon = ICONS[m.icon] || LayoutDashboard;
          const active = currentPage === m.key && !(m.key === "profiling" && (useAuthStore.getState() as any).currentSubpage === "myprofile");
          return (
            <button key={m.key} onClick={() => handleClick(m)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-colors ${active ? "bg-rcc-accent/15 text-rcc-accent" : "text-rcc-primary-foreground/70 hover:bg-white/5 hover:text-rcc-primary-foreground"}`}
              title={sidebarCollapsed ? m.label : undefined}>
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-rcc-accent" : ""}`} />
              {!sidebarCollapsed && <span>{m.label}</span>}
            </button>
          );
        })}

        {/* My Profile — always visible for all logged-in users */}
        {user && (
          <>
            <div className="my-2 border-t border-white/10" />
            <button
              onClick={() => setCurrentPage("profiling", `myprofile`)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-colors ${currentPage === "profiling" && (useAuthStore.getState() as any).currentSubpage === "myprofile" ? "bg-rcc-accent/15 text-rcc-accent" : "text-rcc-primary-foreground/70 hover:bg-white/5 hover:text-rcc-primary-foreground"}`}
              title={sidebarCollapsed ? "My Profile" : undefined}
            >
              <UserCircle className={`h-4 w-4 shrink-0 ${currentPage === "profiling" && (useAuthStore.getState() as any).currentSubpage === "myprofile" ? "text-rcc-accent" : ""}`} />
              {!sidebarCollapsed && <span>My Profile</span>}
            </button>
          </>
        )}
      </nav>
      <div className="p-2 border-t border-white/10">
        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-rcc-primary-foreground/50 hover:bg-white/5 hover:text-rcc-primary-foreground text-sm transition-colors">
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
