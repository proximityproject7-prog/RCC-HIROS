"use client";

import { useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import {
  Plus, Search, Pencil, ArrowLeft, Save, ShieldCheck,
  AlertTriangle, Users as UsersIcon, Lock, Unlock, Globe, BadgeCheck,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { usePermissions } from "@/hooks/use-permissions";
import {
  usePagination,
  PaginationControls,
} from "@/components/shared/table-pagination-v2";
import { PERMISSIONS } from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface Role {
  id: string;
  name: string;
  description: string | null;
  scopeAllProfiling: boolean;
  scopeAllEvaluation: boolean;
  scopeAllLeave: boolean;
  scopeAllReports: boolean;
  scopeAllAttendance: boolean;
  canSelfApproveLeave: boolean;
  isSystem: boolean;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  permissions: string[];
  allPermissions?: { identifier: string; granted: boolean }[];
  employeeCount?: number;
}

// ═══════════════════════════════════════════════════════════════
// PERMISSIONS_BY_MODULE — grouped matrix for the form
// ═══════════════════════════════════════════════════════════════

interface PermissionDef {
  id: string;
  label: string;
  description: string;
}

interface PermissionModule {
  label: string;
  permissions: PermissionDef[];
}

const PERMISSION_LABELS: Record<string, { label: string; description: string }> = {
  "dashboard.view": { label: "View Dashboard", description: "Access the main dashboard landing page." },

  "profiling.view": { label: "View Employees", description: "See employee records within scope." },
  "profiling.view_inactive": { label: "View Inactive", description: "See deactivated / soft-deleted employees." },
  "profiling.create": { label: "Create Employees", description: "Add new employee records." },
  "profiling.edit": { label: "Edit Employees", description: "Update employee fields, certs, and files." },
  "profiling.delete": { label: "Deactivate Employees", description: "Soft-delete an employee record." },
  "profile.selfEdit": { label: "Edit Own Profile", description: "Edit own basic profile fields (email, phone, address, birthday, gender)." },
  "profile.editAll": { label: "Edit All Profiles", description: "Edit any employee's basic profile fields inline." },

  "attendance.view": { label: "View Attendance", description: "See attendance records within scope." },
  "attendance.clock_in": { label: "Clock In / Out", description: "Submit clock-in / clock-out events." },
  "attendance.edit": { label: "Edit Times", description: "Manually edit clock-in / clock-out times." },
  "attendance.edit_on_premise": { label: "Edit On-Premise Flag", description: "Override the on-premise geofence flag." },
  "attendance.view_all": { label: "View All Groups", description: "Bypass group scoping for attendance." },

  "evaluation.view": { label: "View Results (Own Group)", description: "See evaluation results in own group." },
  "evaluation.submit": { label: "Submit Evaluations", description: "Create and submit evaluation forms." },
  "evaluation.view_results": { label: "View Results (For Me)", description: "See evaluations written about self." },
  "evaluation.manage_forms": { label: "Manage Forms & Periods", description: "Create evaluation forms, periods, criteria." },
  "evaluation.reset": { label: "Reset Evaluations", description: "Reset evaluation submissions for a new period." },

  "leave.request": { label: "Request Leave", description: "Submit own leave requests." },
  "leave.approve_l1": { label: "Approve L1", description: "First-level approval of leave." },
  "leave.approve_l2": { label: "Approve L2", description: "Second-level (final) approval of leave." },
  "leave.view_all": { label: "View All Requests", description: "See all leave requests across the institution." },
  "leave.manage_types": { label: "Manage Leave Types", description: "Create / edit leave types." },

  "reports.view": { label: "View Reports", description: "Access the reports module." },
  "reports.export": { label: "Export Reports", description: "Download CSV / PDF report exports." },

  "roles.view": { label: "View Roles", description: "List and inspect role definitions." },
  "roles.create": { label: "Create Roles", description: "Define new roles." },
  "roles.edit": { label: "Edit Roles", description: "Modify role permissions and flags." },
  "roles.delete": { label: "Delete Roles", description: "Remove unused roles." },

  "groups.view": { label: "View Groups", description: "List groups / departments." },
  "groups.manage": { label: "Manage Groups", description: "Create, edit, and delete groups." },

  "fpass.fill": { label: "Fill FPASS Form", description: "Fill out the Faculty Performance Appraisal form." },
  "fpass.manage": { label: "Manage FPASS", description: "View all FPASS submissions and manage group access." },
};

const PERMISSIONS_BY_MODULE: PermissionModule[] = [
  {
    label: "Dashboard",
    permissions: ["dashboard.view"],
  },
  {
    label: "Employee Profiling",
    permissions: ["profiling.view", "profiling.view_inactive", "profiling.create", "profiling.edit", "profiling.delete", "profile.selfEdit", "profile.editAll"],
  },
  {
    label: "Attendance",
    permissions: ["attendance.view", "attendance.clock_in", "attendance.edit", "attendance.edit_on_premise", "attendance.view_all"],
  },
  {
    label: "Performance Evaluation",
    permissions: ["evaluation.view", "evaluation.submit", "evaluation.view_results", "evaluation.manage_forms", "evaluation.reset"],
  },
  {
    label: "Leave Management",
    permissions: ["leave.request", "leave.approve_l1", "leave.approve_l2", "leave.view_all", "leave.manage_types"],
  },
  {
    label: "Reports",
    permissions: ["reports.view", "reports.export"],
  },
  {
    label: "Roles & Permissions",
    permissions: ["roles.view", "roles.create", "roles.edit", "roles.delete"],
  },
  {
    label: "Groups",
    permissions: ["groups.view", "groups.manage"],
  },
  {
    label: "FPASS (Faculty Appraisal)",
    permissions: ["fpass.fill", "fpass.manage"],
  },
].map((m) => ({
  label: m.label,
  permissions: m.permissions.map((id) => ({
    id,
    label: PERMISSION_LABELS[id]?.label ?? id,
    description: PERMISSION_LABELS[id]?.description ?? "",
  })),
}));

// Validate that all PERMISSIONS exist in the matrix.
const _allIds = new Set<string>(PERMISSIONS);
PERMISSIONS_BY_MODULE.forEach((m) => m.permissions.forEach((p) => _allIds.delete(p.id)));
// _allIds should be empty in production; left as runtime no-op.

// ═══════════════════════════════════════════════════════════════
// RoleListPage
// ═══════════════════════════════════════════════════════════════

export function RoleListPage() {
  const { setCurrentPage } = useAuthStore();
  const { has } = usePermissions();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toggleTarget, setToggleTarget] = useState<Role | null>(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ roles: Role[] }>("/api/roles");
      setRoles(data.roles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
    );
  }, [roles, search]);

  const { currentData, controls } = usePagination(filtered, { defaultPageSize: 15 });

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      if (toggleTarget.active) {
        await apiFetch(`/api/roles/${toggleTarget.id}`, { method: "DELETE" });
      } else {
        await apiFetch(`/api/roles/${toggleTarget.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: true }),
        });
      }
      setToggleTarget(null);
      loadRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle failed.");
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-rcc-text-primary">Roles &amp; Permissions</h1>
          <p className="text-sm text-rcc-text-muted mt-0.5">
            Define roles, scope flags, and granular permissions.
          </p>
        </div>
        {has("roles.create") && (
          <button
            onClick={() => setCurrentPage("roles", "create")}
            className="inline-flex items-center gap-2 bg-rcc-primary text-rcc-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-rcc-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Role
          </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-rcc-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles by name or description..."
            className="w-full pl-10 pr-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-rcc-bg/50 border-b border-rcc-border">
              <tr>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Role</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Permissions</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Employees</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Flags</th>
                {has("roles.edit") && (
                  <th className="text-right text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-rcc-border">
              {loading ? (
                <tr>
                  <td colSpan={has("roles.edit") ? 5 : 4} className="px-4 py-10 text-center text-rcc-text-muted">
                    Loading roles...
                  </td>
                </tr>
              ) : currentData.length === 0 ? (
                <tr>
                  <td colSpan={has("roles.edit") ? 5 : 4} className="px-4 py-10 text-center text-rcc-text-muted">
                    No roles found. {search && "Try adjusting your search."}
                  </td>
                </tr>
              ) : (
                currentData.map((role) => (
                  <tr key={role.id} className="hover:bg-rcc-bg/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-rcc-primary/10 text-rcc-primary flex items-center justify-center shrink-0">
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-rcc-text-primary truncate">
                            {role.name}
                            {role.isSystem && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rcc-primary/10 text-rcc-primary border border-rcc-primary/20">
                                SYSTEM
                              </span>
                            )}
                          </p>
                          {role.description && (
                            <p className="text-xs text-rcc-text-muted truncate max-w-md">
                              {role.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-rcc-text-secondary font-medium tabular-nums">
                      {role.permissions.length}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-rcc-text-secondary">
                        <UsersIcon className="h-3.5 w-3.5" />
                        <span className="tabular-nums">{role.employeeCount ?? 0}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {role.scopeAllLeave && <FlagBadge color="amber" icon={Globe}>All Leave</FlagBadge>}
                        {role.scopeAllAttendance && <FlagBadge color="amber" icon={Globe}>All Attendance</FlagBadge>}
                        {role.canSelfApproveLeave && <FlagBadge color="violet" icon={BadgeCheck}>Self-Approve</FlagBadge>}
                        {role.isSystem && <FlagBadge color="primary" icon={Lock}>System</FlagBadge>}
                        {role.active ? (
                          <FlagBadge color="green" icon={Unlock}>Active</FlagBadge>
                        ) : (
                          <FlagBadge color="red" icon={Lock}>Inactive</FlagBadge>
                        )}
                      </div>
                    </td>
                    {has("roles.edit") && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setCurrentPage("roles", `edit:${role.id}`)}
                            className="p-1.5 rounded-md text-rcc-text-secondary hover:bg-rcc-bg hover:text-rcc-primary transition-colors"
                            title="Edit role"
                            aria-label="Edit role"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {has("roles.delete") && !role.isSystem && (
                            <button
                              onClick={() => setToggleTarget(role)}
                              className={`p-1.5 rounded-md transition-colors ${
                                role.active
                                  ? "text-rcc-text-secondary hover:bg-red-50 hover:text-rcc-error"
                                  : "text-rcc-text-secondary hover:bg-green-50 hover:text-green-600"
                              }`}
                              title={role.active ? "Disable role" : "Enable role"}
                              aria-label={role.active ? "Disable role" : "Enable role"}
                            >
                              {role.active ? (
                                <ToggleRight className="h-3.5 w-3.5" />
                              ) : (
                                <ToggleLeft className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls {...controls} />
      </div>

      {/* Enable/Disable confirmation */}
      {toggleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-rcc-surface rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                toggleTarget.active ? "bg-red-50" : "bg-green-50"
              }`}>
                <AlertTriangle className={`h-5 w-5 ${toggleTarget.active ? "text-rcc-error" : "text-green-600"}`} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-rcc-text-primary">
                  {toggleTarget.active ? "Disable" : "Enable"} role &ldquo;{toggleTarget.name}&rdquo;?
                </h3>
                <p className="text-sm text-rcc-text-muted mt-1">
                  {toggleTarget.active
                    ? "This role will be hidden from new employee assignments. Existing employees will keep their role."
                    : "This role will become available for new employee assignments."}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setToggleTarget(null)}
                disabled={toggling}
                className="px-4 py-2 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleActive}
                disabled={toggling}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 ${
                  toggleTarget.active
                    ? "bg-rcc-error text-white hover:bg-red-700"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {toggling ? "Processing..." : toggleTarget.active ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FlagBadge({
  color,
  icon: Icon,
  children,
}: {
  color: "amber" | "violet" | "primary" | "green" | "red";
  icon: typeof Globe;
  children: ReactNode;
}) {
  const colorMap: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    primary: "bg-rcc-primary/10 text-rcc-primary border-rcc-primary/20",
    green: "bg-green-50 text-green-700 border-green-200",
    red: "bg-red-50 text-rcc-error border-red-200",
  };
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${colorMap[color]}`}>
      <Icon className="h-2.5 w-2.5" />
      {children}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// RoleFormPage
// ═══════════════════════════════════════════════════════════════

export function RoleFormPage({ mode, roleId }: { mode: "create" | "edit"; roleId?: string }) {
  const { setCurrentPage } = useAuthStore();
  const { has } = usePermissions();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopeAllProfiling, setScopeAllProfiling] = useState(false);
  const [scopeAllEvaluation, setScopeAllEvaluation] = useState(false);
  const [scopeAllLeave, setScopeAllLeave] = useState(false);
  const [scopeAllReports, setScopeAllReports] = useState(false);
  const [scopeAllAttendance, setScopeAllAttendance] = useState(false);
  const [canSelfApproveLeave, setCanSelfApproveLeave] = useState(false);
  const [active, setActive] = useState(true);
  const [isSystem, setIsSystem] = useState(false);
  const [perms, setPerms] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !roleId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch<{ role: Role }>(`/api/roles/${roleId}`);
        if (cancelled) return;
        const r = data.role;
        setName(r.name);
        setDescription(r.description ?? "");
        setScopeAllProfiling(r.scopeAllProfiling);
        setScopeAllEvaluation(r.scopeAllEvaluation);
        setScopeAllLeave(r.scopeAllLeave);
        setScopeAllReports(r.scopeAllReports);
        setScopeAllAttendance(r.scopeAllAttendance);
        setCanSelfApproveLeave(r.canSelfApproveLeave);
        setActive(r.active);
        setIsSystem(r.isSystem);
        setPerms(new Set(r.permissions));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load role.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, roleId]);

  const togglePerm = (id: string) => {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Role name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        scopeAllProfiling,
        scopeAllEvaluation,
        scopeAllLeave,
        scopeAllReports,
        scopeAllAttendance,
        canSelfApproveLeave,
        active,
        permissions: Array.from(perms),
      };
      if (mode === "create") {
        await apiFetch("/api/roles", { method: "POST", body: JSON.stringify(payload) });
      } else if (roleId) {
        await apiFetch(`/api/roles/${roleId}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      setCurrentPage("roles");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-rcc-text-muted">Loading role...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCurrentPage("roles")}
          className="inline-flex items-center gap-1 text-sm text-rcc-text-secondary hover:text-rcc-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to roles
        </button>
      </div>
      <div>
        <h1 className="text-xl font-bold text-rcc-text-primary">
          {mode === "create" ? "Create Role" : `Edit Role: ${name}`}
        </h1>
        <p className="text-sm text-rcc-text-muted mt-0.5">
          Configure name, scope flags, and the permission matrix.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">
          {error}
        </div>
      )}

      {/* Basic info */}
      <section className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
        <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
          Basic Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Role Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dean of Studies"
              className="w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
            />
          </Field>
          <Field label="Description">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of this role..."
              className="w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
            />
          </Field>
        </div>
      </section>

      {/* Scope & Special Permissions */}
      <section className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
            Scope &amp; Special Permissions
          </h2>
          <p className="text-xs text-rcc-text-muted mt-0.5">
            Scope flags bypass group-based restrictions for the module.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <ScopeCard
            checked={scopeAllProfiling}
            onChange={setScopeAllProfiling}
            title="All Profiling"
            description="See employee records across all groups."
          />
          <ScopeCard
            checked={scopeAllEvaluation}
            onChange={setScopeAllEvaluation}
            title="All Evaluation"
            description="View &amp; submit evaluations institution-wide."
          />
          <ScopeCard
            checked={scopeAllLeave}
            onChange={setScopeAllLeave}
            title="All Leave"
            description="Approve and view all leave requests."
          />
          <ScopeCard
            checked={scopeAllReports}
            onChange={setScopeAllReports}
            title="All Reports"
            description="Access reports across all groups."
          />
          <ScopeCard
            checked={scopeAllAttendance}
            onChange={setScopeAllAttendance}
            title="All Attendance"
            description="View attendance records across all groups."
          />
          <ScopeCard
            checked={canSelfApproveLeave}
            onChange={setCanSelfApproveLeave}
            title="Can Self-Approve Leave"
            description="Allow approving own leave requests."
          />
          <ScopeCard
            checked={active}
            onChange={setActive}
            title="Active"
            description="Inactive roles cannot be assigned to employees."
          />
        </div>
        {isSystem && (
          <div className="bg-rcc-primary/5 border border-rcc-primary/20 rounded-md p-3 text-xs text-rcc-text-secondary flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            This is a system role. The system flag and critical permissions cannot be removed.
          </div>
        )}
      </section>

      {/* Permission Matrix */}
      <section className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
            Permission Matrix
          </h2>
          <p className="text-xs text-rcc-text-muted mt-0.5">
            Toggle individual permissions, or use &ldquo;select all&rdquo; per module.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PERMISSIONS_BY_MODULE.map((mod) => {
            const all = mod.permissions.map((p) => p.id);
            const granted = all.filter((id) => perms.has(id));
            const allChecked = granted.length === all.length;
            const someChecked = granted.length > 0 && !allChecked;
            return (
              <div key={mod.label} className="border border-rcc-border rounded-lg overflow-hidden">
                <div className="bg-rcc-bg/40 px-4 py-2.5 border-b border-rcc-border flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked;
                      }}
                      onChange={() => {
                        setPerms((prev) => {
                          const next = new Set(prev);
                          if (allChecked) all.forEach((id) => next.delete(id));
                          else all.forEach((id) => next.add(id));
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-rcc-border text-rcc-accent focus:ring-rcc-accent/40"
                    />
                    <span className="text-sm font-semibold text-rcc-text-primary">{mod.label}</span>
                  </label>
                  <span className="text-xs text-rcc-text-muted tabular-nums">
                    {granted.length} / {all.length}
                  </span>
                </div>
                <div className="divide-y divide-rcc-border">
                  {mod.permissions.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-rcc-bg/30 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={perms.has(p.id)}
                        onChange={() => togglePerm(p.id)}
                        className="mt-0.5 h-4 w-4 rounded border-rcc-border text-rcc-accent focus:ring-rcc-accent/40"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-rcc-text-primary">{p.label}</p>
                        <p className="text-xs text-rcc-text-muted">{p.description}</p>
                      </div>
                      <code className="text-[10px] text-rcc-text-muted bg-rcc-bg px-1.5 py-0.5 rounded shrink-0">
                        {p.id}
                      </code>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={() => setCurrentPage("roles")}
          disabled={saving}
          className="px-4 py-2 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : mode === "create" ? "Create Role" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">
        {label}
        {required && <span className="text-rcc-error ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-rcc-text-muted mt-1">{hint}</p>}
    </div>
  );
}

function ScopeCard({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
        checked ? "border-rcc-accent/40 bg-rcc-accent/5" : "border-rcc-border hover:bg-rcc-bg/40"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-rcc-border text-rcc-accent focus:ring-rcc-accent/40"
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-rcc-text-primary">{title}</p>
        <p className="text-xs text-rcc-text-muted mt-0.5" dangerouslySetInnerHTML={{ __html: description }} />
      </div>
    </label>
  );
}
