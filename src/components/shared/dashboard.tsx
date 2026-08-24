"use client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuthStore } from "@/store/auth-store";
import { MODULES } from "@/lib/permissions";
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  Users, ClipboardCheck, CalendarClock, BarChart3, ShieldCheck, Building2, LayoutDashboard,
  Clock, LogIn, LogOut, MapPin, Check, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, ClipboardCheck, CalendarClock, BarChart3, ShieldCheck, Building2,
};

interface Stats {
  roles?: number; groups?: number; employees?: number;
  pendingL1?: number; pendingL2?: number; myLeaveRequests?: number;
  myEvaluations?: number; pendingEvaluations?: number;
  todayAttendance?: number; offPremiseCount?: number;
}

export function DynamicDashboard() {
  const { user } = useAuth();
  const { has, visibleModules } = usePermissions();
  const { setCurrentPage } = useAuthStore();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function load() {
      const out: Stats = {};
      try {
        if (has("roles.view")) { const r = await apiFetch<{ roles: unknown[] }>("/api/roles"); out.roles = r.roles.length; }
        if (has("groups.view")) { const g = await apiFetch<{ groups: unknown[] }>("/api/groups"); out.groups = g.groups.length; }
        if (has("profiling.view")) { const e = await apiFetch<{ employees: unknown[] }>("/api/employees"); out.employees = e.employees.length; }
        if (has("leave.approve_l1")) { const l1 = await apiFetch<{ requests: unknown[] }>("/api/leave-requests?scope=pending_l1"); out.pendingL1 = l1.requests.length; }
        if (has("leave.approve_l2")) { const l2 = await apiFetch<{ requests: unknown[] }>("/api/leave-requests?scope=pending_l2"); out.pendingL2 = l2.requests.length; }
        if (has("leave.request")) { const mine = await apiFetch<{ requests: unknown[] }>("/api/leave-requests?scope=mine"); out.myLeaveRequests = mine.requests.length; }
        if (has("evaluation.view_results")) { const ev = await apiFetch<{ evaluations: unknown[] }>("/api/evaluations?scope=for_me"); out.myEvaluations = ev.evaluations.length; }
        if (has("evaluation.submit")) { const pe = await apiFetch<{ evaluations: unknown[] }>("/api/evaluations?scope=submitted_by_me"); out.pendingEvaluations = pe.evaluations.length; }
        if (has("attendance.view")) {
          const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          const att = await apiFetch<{ attendance?: unknown[]; records?: unknown[] }>(`/api/attendance?scope=all&date=${today}`);
          out.todayAttendance = (att.attendance ?? att.records ?? []).length;
        }
        setStats(out);
      } catch {}
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build widget list dynamically based on permissions
  const widgets: Array<{ icon: LucideIcon; label: string; value: number; onClick?: () => void; highlight?: "amber" | "red" }> = [];
  if (has("profiling.view") && stats?.employees !== undefined)
    widgets.push({ icon: Users, label: "Employees", value: stats.employees, onClick: () => setCurrentPage("profiling") });
  if (has("leave.approve_l1") && stats?.pendingL1 !== undefined)
    widgets.push({ icon: Clock, label: "Pending L1 Approvals", value: stats.pendingL1, onClick: () => setCurrentPage("leave", "approvals"), highlight: stats.pendingL1 > 0 ? "amber" : undefined });
  if (has("leave.approve_l2") && stats?.pendingL2 !== undefined)
    widgets.push({ icon: Clock, label: "Pending L2 Approvals", value: stats.pendingL2, onClick: () => setCurrentPage("leave", "approvals"), highlight: stats.pendingL2 > 0 ? "amber" : undefined });
  if (has("leave.request") && stats?.myLeaveRequests !== undefined)
    widgets.push({ icon: CalendarClock, label: "My Leave Requests", value: stats.myLeaveRequests, onClick: () => setCurrentPage("leave", "mine") });
  if (has("evaluation.view_results") && stats?.myEvaluations !== undefined)
    widgets.push({ icon: ClipboardCheck, label: "My Evaluations", value: stats.myEvaluations, onClick: () => setCurrentPage("evaluation", "results") });
  if (has("evaluation.submit") && stats?.pendingEvaluations !== undefined)
    widgets.push({ icon: ClipboardCheck, label: "Evaluations Submitted", value: stats.pendingEvaluations, onClick: () => setCurrentPage("evaluation", "submit") });
  if (has("attendance.view") && stats?.todayAttendance !== undefined)
    widgets.push({ icon: Clock, label: "Today's Attendance", value: stats.todayAttendance, onClick: () => setCurrentPage("attendance", "all") });
  if (has("roles.view") && stats?.roles !== undefined)
    widgets.push({ icon: ShieldCheck, label: "Roles", value: stats.roles, onClick: () => setCurrentPage("roles") });
  if (has("groups.view") && stats?.groups !== undefined)
    widgets.push({ icon: Building2, label: "Groups", value: stats.groups, onClick: () => setCurrentPage("groups") });

  return (
    <div className="space-y-6">
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6">
        <h1 className="text-xl font-bold text-rcc-text-primary">Welcome, {user?.name?.split(" ")[0] ?? "User"}</h1>
        <p className="text-sm text-rcc-text-muted mt-1">
          You're signed in as <span className="font-medium text-rcc-text-secondary">{user?.roleName}</span>.
          {user?.isSystem && " You have full system access."}
        </p>
      </div>

      {has("attendance.clock_in") && <TimeAttendanceWidget />}

      {widgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {widgets.map((w, i) => <WidgetCard key={i} {...w} />)}
        </div>
      )}

    </div>
  );
}

function WidgetCard({ icon: Icon, label, value, onClick, highlight }: { icon: LucideIcon; label: string; value: number; onClick?: () => void; highlight?: "amber" | "red" }) {
  const cls = highlight === "amber" ? "border-amber-300 bg-amber-50" : highlight === "red" ? "border-red-300 bg-red-50" : "border-rcc-border bg-rcc-surface";
  return (
    <button onClick={onClick} className={`${cls} rounded-lg border p-5 text-left hover:shadow-sm transition-all`}>
      <div className="flex items-center justify-between">
        <div><p className="text-xs text-rcc-text-muted uppercase tracking-wide">{label}</p><p className="text-2xl font-bold text-rcc-text-primary mt-1">{value}</p></div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${highlight ? "bg-white/50" : "bg-rcc-accent/10"}`}><Icon className={`h-5 w-5 ${highlight ? "text-rcc-text-primary" : "text-rcc-accent"}`} /></div>
      </div>
    </button>
  );
}

// ─── Time & Attendance Widget ──────────────────────────────────────────────
interface TodayAttendance { id: string; clockInAt: string | null; clockOutAt: string | null; clockInOnPremise: boolean | null; clockInDistance: number | null; manuallyEdited: boolean; editRemarks: string | null; }
interface PremisesInfo { lat: number | null; lng: number | null; radiusMeters: number; label: string; }

function TimeAttendanceWidget() {
  const { setCurrentPage } = useAuthStore();
  const [now, setNow] = useState(new Date());
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [premises, setPremises] = useState<PremisesInfo | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);

  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);

  const loadToday = useCallback(async () => {
    try {
      const d = new Date(); const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const data = await apiFetch<{ attendance?: TodayAttendance[]; records?: TodayAttendance[] }>(`/api/attendance?scope=mine&date=${todayStr}`);
      setToday((data.attendance ?? data.records ?? [])[0] ?? null);
      const p = await apiFetch<{ premises: PremisesInfo }>("/api/settings/premises");
      setPremises(p.premises);
    } catch {}
  }, []);
  useEffect(() => { loadToday(); }, [loadToday]);

  async function captureLocation(): Promise<{ lat?: number; lng?: number }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve({}); return; }
      setLocationStatus("Capturing location…");
      navigator.geolocation.getCurrentPosition(
        (pos) => { setLocationStatus(null); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        () => { setLocationStatus(null); resolve({}); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  async function handleAction(action: "clock_in" | "clock_out") {
    setActionLoading(true); setError(null);
    try {
      const loc = await captureLocation();
      if (loc.lat === undefined || loc.lng === undefined) {
        setError("Location access is required to clock in/out. Please enable location permissions and try again.");
        return;
      }
      const d = new Date();
      const clientDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const body: Record<string, unknown> = { action, clientDate };
      if (loc.lat !== undefined) { body.lat = loc.lat; body.lng = loc.lng; }
      const result = await apiFetch<{ attendance: TodayAttendance }>("/api/attendance", { method: "POST", body: JSON.stringify(body) });
      setToday(result.attendance);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionLoading(false); }
  }

  const clockedIn = !!today?.clockInAt;
  const clockedOut = !!today?.clockOutAt;
  const statusText = !clockedIn ? "Not Clocked In" : clockedOut ? "Clocked Out" : "Clocked In";
  const statusColorClass = !clockedIn ? "text-yellow-50/70" : clockedOut ? "text-green-300" : "text-blue-300";

  return (
    <div className="bg-rcc-sidebar-bg rounded-lg overflow-hidden shadow-md">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" /><h2 className="text-sm font-semibold text-yellow-50">Time &amp; Attendance</h2></div>
        {premises?.lat && <div className="flex items-center gap-1 text-xs text-yellow-50/60"><MapPin className="h-3 w-3" />{premises.label}</div>}
      </div>
      <div className="px-6 py-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-4xl font-bold tabular-nums tracking-tight text-yellow-50">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}</div>
            <div className="text-sm mt-1 text-yellow-50/60">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
          </div>
          <div className="bg-black/25 rounded-lg px-4 py-3 min-w-[240px]">
            <div className="text-xs uppercase tracking-wide text-yellow-50/50">Today's Status</div>
            <div className="flex items-center gap-2 mt-1"><span className={`text-lg font-bold ${statusColorClass}`}>{statusText}</span></div>
            {clockedIn && today?.clockInAt && <div className="text-xs mt-1 text-yellow-50/60">In: {new Date(today.clockInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{clockedOut && today.clockOutAt && <> · Out: {new Date(today.clockOutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}</div>}
            {clockedIn && today?.clockInOnPremise !== null && today?.clockInOnPremise !== undefined && <div className="text-xs mt-1">{today.clockInOnPremise ? <span className="font-medium text-green-300">✓ On premise</span> : <span className="font-medium text-yellow-400">⚠ Off premise ({Math.round(today.clockInDistance ?? 0)}m)</span>}</div>}
            <div className="mt-3">
              {!clockedIn && <button onClick={() => handleAction("clock_in")} disabled={actionLoading} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md w-full justify-center transition-colors disabled:opacity-60 bg-green-600 text-white"><LogIn className="h-4 w-4" />{actionLoading ? "Working…" : "Clock In"}</button>}
              {clockedIn && !clockedOut && <button onClick={() => handleAction("clock_out")} disabled={actionLoading} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md w-full justify-center transition-colors disabled:opacity-60 bg-red-600 text-white"><LogOut className="h-4 w-4" />{actionLoading ? "Working…" : "Clock Out"}</button>}
              {clockedOut && <div className="text-center text-sm font-medium py-2 text-green-300">✓ Day Complete</div>}
            </div>
          </div>
        </div>
        {locationStatus && <p className="text-xs mt-2 text-blue-300">{locationStatus}</p>}
        {error && <p className="text-xs mt-2 text-red-300">{error}</p>}
        {today?.manuallyEdited && <p className="text-xs mt-2 text-yellow-400">⚠ Record was manually edited. {today.editRemarks && `"${today.editRemarks}"`}</p>}
        <button onClick={() => setCurrentPage("attendance", "all")} className="text-xs hover:underline mt-3 text-amber-500">View full attendance →</button>
      </div>
    </div>
  );
}
