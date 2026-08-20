"use client";

import { useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import {
  Plus, ArrowLeft, AlertTriangle, Pencil,
  CheckCircle2, FileText, Info, Trash2, X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { usePermissions } from "@/hooks/use-permissions";
import {
  usePagination,
  PaginationControls,
} from "@/components/shared/table-pagination-v2";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface EvalCriterion {
  id: string;
  category: string;
  description: string;
  maxScore: number;
  weight: number;
  sortOrder: number;
}

interface EvalForm {
  id: string;
  name: string;
  version: number;
  active: boolean;
  criteria?: EvalCriterion[]; // Only present when fetched from /api/evaluation-forms/[id]
  criteriaCount?: number; // Present when fetched from /api/evaluation-forms (list)
  periodsCount?: number; // Present when fetched from /api/evaluation-forms (list)
}

interface EvalPeriod {
  id: string;
  formId: string;
  form?: { id: string; name: string; active: boolean };
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  createdAt: string;
  evaluationsCount?: number;
  groupIds?: string[] | null;
  targetRoleIds?: string[] | null;
  openedAt?: string | null;
  closedAt?: string | null;
  createdBy?: string | null;
}

interface EvalResponse {
  id: string;
  criterionId: string;
  score: number;
  comments: string | null;
  criterion?: { id: string; category: string; description: string; maxScore: number; weight: number; sortOrder: number };
}

interface Evaluation {
  id: string;
  periodId: string;
  formId: string;
  evaluatorId: string;
  evaluator: { id: string; name: string } | null;
  employeeId: string;
  employee: { id: string; name: string; employeeId: string; groupId: string | null; group: { name: string } | null; role: { name: string } | null } | null;
  status: "draft" | "submitted" | "acknowledged";
  totalScore: number | null;
  remarks: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  form: { id: string; name: string } | null;
  period: { id: string; name: string; status: string } | null;
  responses: EvalResponse[];
}

interface EmployeeBrief {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  groupId: string | null;
}

const inputClass =
  "w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40";

// 7 categories × 34 criteria total — real RCC Faculty Evaluation Tool
const EVAL_CATEGORIES = [
  "I. Communication Skills",
  "II. Instructional Skills",
  "III. Knowledge of the Subject-Matter",
  "IV. Classroom Management",
  "V. Professional Qualities",
  "VI. Personal Qualities",
  "VII. Classwork Design (For Online Classroom)",
];

// ═══════════════════════════════════════════════════════════════
// EvaluationFormsPage — period management with group/role access
// ═══════════════════════════════════════════════════════════════

export function EvaluationFormsPage() {
  const { has } = usePermissions();
  const [periods, setPeriods] = useState<EvalPeriod[]>([]);
  const [forms, setForms] = useState<EvalForm[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resettingPeriodId, setResettingPeriodId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [retentionMonths, setRetentionMonths] = useState(12);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; variant: "danger" | "warning"; onConfirm: () => void } | null>(null);
  const [editingAccessId, setEditingAccessId] = useState<string | null>(null);
  const [editGroupIds, setEditGroupIds] = useState<string[]>([]);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);
  const [editAllGroups, setEditAllGroups] = useState(true);
  const [editAllRoles, setEditAllRoles] = useState(true);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, f, g, r, cl] = await Promise.all([
        apiFetch<{ periods: EvalPeriod[] }>("/api/evaluation-periods"),
        apiFetch<{ forms: EvalForm[] }>("/api/evaluation-forms"),
        apiFetch<{ groups: { id: string; name: string }[] }>("/api/groups").catch(() => ({ groups: [] })),
        apiFetch<{ roles: { id: string; name: string }[] }>("/api/roles").catch(() => ({ roles: [] })),
        apiFetch<{ retentionMonths: number }>("/api/evaluations/cleanup").catch(() => ({ retentionMonths: 12 })),
      ]);

      let formsData = f.forms ?? [];

      // Auto-create default form if none exists
      if (formsData.length === 0) {
        await apiFetch("/api/evaluation-forms", {
          method: "POST",
          body: JSON.stringify({ name: "RCC Faculty Evaluation Tool" }),
        });
        const refetch = await apiFetch<{ forms: EvalForm[] }>("/api/evaluation-forms");
        formsData = refetch.forms ?? [];
      }

      setPeriods(p.periods ?? []);
      setForms(formsData);
      setGroups(g.groups ?? []);
      setRoles(r.roles ?? []);
      setRetentionMonths(cl.retentionMonths ?? 12);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeForm = forms.find((f) => f.active) ?? forms[0];

  const handleToggle = async (p: EvalPeriod) => {
    setTogglingId(p.id);
    const next = p.status === "open" ? "closed" : "open";
    try {
      await apiFetch(`/api/evaluation-periods/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle failed.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleAddPeriod = async () => {
    if (!newName.trim()) return setError("Period name is required.");
    if (!activeForm) return setError("No active evaluation form found.");
    setSaving(true);
    setError(null);
    try {
      const today = new Date();
      const end = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
      await apiFetch("/api/evaluation-periods", {
        method: "POST",
        body: JSON.stringify({
          formId: activeForm.id,
          name: newName.trim(),
          startDate: today.toISOString(),
          endDate: end.toISOString(),
          status: "closed",
          allGroups: true,
          allRoles: true,
        }),
      });
      setNewName("");
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create period.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPeriod = async (periodId: string, periodName: string) => {
    setConfirmState({
      open: true,
      title: `Clear evaluations for "${periodName}"?`,
      message: "This will permanently delete all evaluations for this period. This cannot be undone.",
      variant: "danger",
      onConfirm: async () => {
        setConfirmState(null);
        setResettingPeriodId(periodId);
        setError(null);
        try {
          await apiFetch(`/api/evaluation-periods/${periodId}/reset`, { method: "POST" });
          load();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Reset failed.");
        } finally {
          setResettingPeriodId(null);
        }
      },
    });
  };

  const handleRenamePeriod = async (periodId: string) => {
    if (!editName.trim()) return setError("Period name is required.");
    setError(null);
    try {
      await apiFetch(`/api/evaluation-periods/${periodId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim() }),
      });
      setEditingPeriodId(null);
      setEditName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
    }
  };

  const handleSaveAccess = async (periodId: string) => {
    setError(null);
    try {
      await apiFetch(`/api/evaluation-periods/${periodId}`, {
        method: "PATCH",
        body: JSON.stringify({
          allGroups: editAllGroups,
          allRoles: editAllRoles,
          groupIds: editAllGroups ? [] : editGroupIds,
          targetRoleIds: editAllRoles ? [] : editRoleIds,
        }),
      });
      setEditingAccessId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save access settings.");
    }
  };

  const handleExportArchive = async (period: EvalPeriod) => {
    setExportingId(period.id);
    setError(null);
    try {
      const data = await apiFetch<{ period: Record<string, unknown>; evaluations: Array<{
        employee?: { name: string; employeeId: string; groupName: string | null; roleName: string | null } | null;
        evaluator?: { name: string; employeeId: string } | null;
        totalScore: number | null;
        remarks: string | null;
        submittedAt: string | null;
        responses: Array<{ category: string; description: string; score: number; maxScore: number; comments: string | null }>;
      }> }>(`/api/evaluation-periods/${period.id}/archive`);

      // Build CSV
      const headers = ["Employee Name", "Employee ID", "Group", "Role", "Evaluator", "Score", "Submitted", "Remarks"];
      const rows = data.evaluations.map((ev) => [
        ev.employee?.name ?? "",
        ev.employee?.employeeId ?? "",
        ev.employee?.groupName ?? "",
        ev.employee?.roleName ?? "",
        ev.evaluator?.name ?? "",
        ev.totalScore?.toFixed(2) ?? "",
        ev.submittedAt ? new Date(ev.submittedAt).toLocaleDateString() : "",
        (ev.remarks ?? "").replace(/"/g, '""'),
      ]);

      const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${period.name.replace(/[^a-zA-Z0-9]/g, "_")}_archive.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExportingId(null);
    }
  };

  const handleSaveRetention = async () => {
    setRetentionSaving(true);
    setError(null);
    try {
      await apiFetch("/api/evaluations/cleanup", {
        method: "PATCH",
        body: JSON.stringify({ retentionMonths }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save retention setting.");
    } finally {
      setRetentionSaving(false);
    }
  };

  const handleCleanup = async () => {
    setConfirmState({
      open: true,
      title: "Run Cleanup",
      message: `Delete all evaluations older than ${retentionMonths} months? This cannot be undone.`,
      variant: "danger",
      onConfirm: async () => {
        setConfirmState(null);
        setCleaningUp(true);
        setCleanupResult(null);
        setError(null);
        try {
          const result = await apiFetch<{ deletedEvaluations: number; retentionMonths: number }>("/api/evaluations/cleanup", { method: "POST" });
          setCleanupResult(`Deleted ${result.deletedEvaluations} evaluation(s) older than ${result.retentionMonths} months.`);
          load();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Cleanup failed.");
        } finally {
          setCleaningUp(false);
        }
      },
    });
  };

  const startEditAccess = (p: EvalPeriod) => {
    setEditingAccessId(p.id);
    setEditGroupIds(p.groupIds ?? []);
    setEditRoleIds(p.targetRoleIds ?? []);
    setEditAllGroups(p.groupIds === null);
    setEditAllRoles(p.targetRoleIds === null);
  };

  const groupNameById = (id: string) => groups.find((g) => g.id === id)?.name ?? id;
  const roleNameById = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-rcc-text-primary">Evaluation Management</h1>
          <p className="text-sm text-rcc-text-muted mt-0.5">
            Toggle evaluation periods on/off. When ON, authorized users can evaluate. When OFF, evaluation is closed.
          </p>
        </div>
        {has("evaluation.manage_forms") && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="inline-flex items-center gap-2 bg-rcc-primary text-rcc-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-rcc-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> {showAdd ? "Cancel" : "New Period"}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Period name (e.g., 1st Semester 2026)"
              className={inputClass}
              onKeyDown={(e) => e.key === "Enter" && handleAddPeriod()}
            />
            <button
              onClick={handleAddPeriod}
              disabled={saving || !newName.trim()}
              className="px-4 py-2 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 disabled:opacity-50 shrink-0"
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
          <p className="text-xs text-rcc-text-muted">New periods default to institution-wide access. You can restrict access after creation using Edit Access.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      {/* Info card */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 flex items-start gap-3">
        <div className="w-9 h-9 rounded-md bg-rcc-accent/10 text-rcc-accent flex items-center justify-center shrink-0">
          <Info className="h-5 w-5" />
        </div>
        <div className="text-sm">
          <p className="font-semibold text-rcc-text-primary">RCC Faculty Evaluation Tool - 34 Criteria</p>
          <p className="text-rcc-text-muted mt-1">
            All evaluations use the official RCC faculty evaluation form across 7 categories:
            <span className="text-rcc-text-secondary"> {EVAL_CATEGORIES.join(" · ")}</span>.
            Each criterion is scored 1–5. Two textual evaluation fields are provided at the end.
          </p>
          {activeForm && (
            <p className="text-xs text-rcc-text-muted mt-2">
              Active form: <span className="font-mono">{activeForm.name}</span> (v{activeForm.version}) · {activeForm.criteriaCount ?? 0} criteria
            </p>
          )}
        </div>
      </div>

      {/* Period cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-rcc-primary border-t-transparent" />
          <span className="ml-2 text-sm text-rcc-text-muted">Loading...</span>
        </div>
      ) : periods.length === 0 ? (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-8 text-center text-rcc-text-muted">
          No evaluation periods found. Create one to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {periods.map((p) => {
            const isOpen = p.status === "open";
            const isEditingAccess = editingAccessId === p.id;
            const isAllGroups = p.groupIds === null;
            const isAllRoles = p.targetRoleIds === null;
            const groupTags = (p.groupIds ?? []).map(groupNameById);
            const roleTags = (p.targetRoleIds ?? []).map(roleNameById);

            return (
              <div key={p.id} className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
                {/* Header row */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      {editingPeriodId === p.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="px-2 py-1 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenamePeriod(p.id);
                              if (e.key === "Escape") { setEditingPeriodId(null); setEditName(""); }
                            }}
                            autoFocus
                          />
                          <button onClick={() => handleRenamePeriod(p.id)} disabled={!editName.trim()} className="px-2 py-1 rounded-md text-xs font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 disabled:opacity-50">Save</button>
                          <button onClick={() => { setEditingPeriodId(null); setEditName(""); }} className="px-2 py-1 rounded-md text-xs font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-lg font-semibold text-rcc-text-primary">{p.name}</h3>
                          <button onClick={() => { setEditingPeriodId(p.id); setEditName(p.name); }} className="text-rcc-text-muted hover:text-rcc-primary transition-colors" title="Rename period">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${isOpen ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-green-500" : "bg-gray-400"}`}></span>
                        {isOpen ? "Open" : "Closed"}
                      </span>
                    </div>
                    <p className="text-sm text-rcc-text-muted mt-1">
                      {isOpen ? "Evaluation is active. Authorized users can submit evaluations." : "Evaluation is closed."}
                    </p>
                    {/* Group & Role tags */}
                    {!isEditingAccess && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {isAllGroups ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">All Groups</span>
                        ) : groupTags.length > 0 ? groupTags.map((g) => (
                          <span key={g} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">{g}</span>
                        )) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">No Groups</span>
                        )}
                        {isAllRoles ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">All Roles</span>
                        ) : roleTags.length > 0 ? roleTags.map((r) => (
                          <span key={r} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">{r}</span>
                        )) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">No Roles</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(p)}
                      disabled={togglingId === p.id}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${isOpen ? "bg-green-500" : "bg-gray-300"}`}
                      title={isOpen ? "Click to close evaluation" : "Click to open evaluation"}
                    >
                      <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${isOpen ? "translate-x-7" : "translate-x-1"}`} />
                    </button>
                  </div>
                </div>

                {/* Access editing */}
                {isEditingAccess ? (
                  <div className="bg-rcc-bg/50 rounded-md border border-rcc-border p-4 space-y-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1.5">
                        <p className="text-xs font-semibold text-rcc-text-primary">Groups</p>
                        <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editAllGroups}
                            onChange={(e) => { setEditAllGroups(e.target.checked); if (e.target.checked) setEditGroupIds([]); }}
                            className="rounded border-rcc-border text-rcc-primary focus:ring-rcc-accent/40"
                          />
                          All Groups
                        </label>
                      </div>
                      {!editAllGroups && (
                        <div className="flex flex-wrap gap-2">
                          {groups.map((g) => (
                            <label key={g.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rcc-surface border border-rcc-border text-xs cursor-pointer hover:bg-rcc-bg transition-colors">
                              <input
                                type="checkbox"
                                checked={editGroupIds.includes(g.id)}
                                onChange={(e) => {
                                  setEditGroupIds(e.target.checked ? [...editGroupIds, g.id] : editGroupIds.filter((id) => id !== g.id));
                                }}
                                className="rounded border-rcc-border text-rcc-primary focus:ring-rcc-accent/40"
                              />
                              {g.name}
                            </label>
                          ))}
                          {editGroupIds.length === 0 && <span className="text-[10px] text-rcc-text-muted italic">No groups selected — no one will be authorized</span>}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1.5">
                        <p className="text-xs font-semibold text-rcc-text-primary">Roles</p>
                        <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editAllRoles}
                            onChange={(e) => { setEditAllRoles(e.target.checked); if (e.target.checked) setEditRoleIds([]); }}
                            className="rounded border-rcc-border text-rcc-primary focus:ring-rcc-accent/40"
                          />
                          All Roles
                        </label>
                      </div>
                      {!editAllRoles && (
                        <div className="flex flex-wrap gap-2">
                          {roles.map((r) => (
                            <label key={r.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rcc-surface border border-rcc-border text-xs cursor-pointer hover:bg-rcc-bg transition-colors">
                              <input
                                type="checkbox"
                                checked={editRoleIds.includes(r.id)}
                                onChange={(e) => {
                                  setEditRoleIds(e.target.checked ? [...editRoleIds, r.id] : editRoleIds.filter((id) => id !== r.id));
                                }}
                                className="rounded border-rcc-border text-rcc-primary focus:ring-rcc-accent/40"
                              />
                              {r.name}
                            </label>
                          ))}
                          {editRoleIds.length === 0 && <span className="text-[10px] text-rcc-text-muted italic">No roles selected — no one will be authorized</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => handleSaveAccess(p.id)} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90">Save Access</button>
                      <button onClick={() => setEditingAccessId(null)} className="px-3 py-1.5 rounded-md text-xs font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg">Cancel</button>
                    </div>
                  </div>
                ) : (
                  /* Action buttons row */
                  <div className="flex items-center gap-3 flex-wrap">
                    {has("evaluation.manage_forms") && (
                      <button onClick={() => startEditAccess(p)} className="text-xs text-rcc-primary hover:underline font-medium">Edit Access</button>
                    )}
                    {p.evaluationsCount !== undefined && p.evaluationsCount > 0 && (
                      <>
                        <span className="text-xs text-rcc-text-muted">{p.evaluationsCount} evaluation(s) submitted</span>
                        {has("evaluation.manage_forms") && (
                          <button onClick={() => handleExportArchive(p)} disabled={exportingId === p.id} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium disabled:opacity-50">
                            <FileText className="h-3 w-3" /> {exportingId === p.id ? "Exporting..." : "Export CSV"}
                          </button>
                        )}
                        {has("evaluation.reset") && (
                          <button onClick={() => handleResetPeriod(p.id, p.name)} disabled={resettingPeriodId === p.id} className="text-xs text-red-600 hover:underline disabled:opacity-50">
                            {resettingPeriodId === p.id ? "Clearing..." : "Clear this period"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Retention Policy */}
      {has("evaluation.manage_forms") && (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">Retention Policy</h3>
          <p className="text-xs text-rcc-text-muted">Automatically delete evaluations after a set number of months from their submission date.</p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-rcc-text-secondary">Delete evaluations older than</span>
            <input
              type="number"
              min="1"
              max="120"
              value={retentionMonths}
              onChange={(e) => setRetentionMonths(Number(e.target.value))}
              className="w-20 px-2 py-1 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary text-center"
            />
            <span className="text-sm text-rcc-text-secondary">months</span>
            <button onClick={handleSaveRetention} disabled={retentionSaving} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 disabled:opacity-50">
              {retentionSaving ? "Saving..." : "Save"}
            </button>
            <button onClick={handleCleanup} disabled={cleaningUp} className="px-3 py-1.5 rounded-md text-xs font-semibold border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg disabled:opacity-50">
              {cleaningUp ? "Cleaning..." : "Run Cleanup Now"}
            </button>
          </div>
          {cleanupResult && <p className="text-xs text-green-700 font-medium">{cleanupResult}</p>}
        </div>
      )}

      <ConfirmDialog
        open={confirmState?.open ?? false}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        variant={confirmState?.variant ?? "danger"}
        onConfirm={() => { confirmState?.onConfirm(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SubmitEvaluationPage
// ═══════════════════════════════════════════════════════════════

export function SubmitEvaluationPage() {
  const [periods, setPeriods] = useState<EvalPeriod[]>([]);
  const [employees, setEmployees] = useState<EmployeeBrief[]>([]);
  const [forms, setForms] = useState<EvalForm[]>([]);
  const [activeForm, setActiveForm] = useState<EvalForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [periodId, setPeriodId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [remarksB, setRemarksB] = useState("");
  const [existingEval, setExistingEval] = useState<Evaluation | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(false);

  // Load open periods + employees (group-scoped by API)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [p, e, f] = await Promise.all([
          apiFetch<{ periods: EvalPeriod[] }>("/api/evaluation-periods"),
          apiFetch<{ employees: EmployeeBrief[] }>("/api/employees?active=true&scope=evaluation"),
          apiFetch<{ forms: EvalForm[] }>("/api/evaluation-forms"),
        ]);
        const openPeriods = (p.periods ?? []).filter((x) => x.status === "open");
        setPeriods(openPeriods);
        setEmployees(e.employees ?? []);
        setForms(f.forms ?? []);

        // Fetch the FULL form with criteria from the detail endpoint
        const formList = f.forms ?? [];
        const activeFormSummary = formList.find((x) => x.active) ?? formList[0];
        if (activeFormSummary) {
          const fullForm = await apiFetch<{ form: EvalForm }>(`/api/evaluation-forms/${activeFormSummary.id}`);
          setActiveForm(fullForm.form);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedPeriod = periods.find((p) => p.id === periodId);

  // Group criteria by category
  const criteriaByCategory = useMemo(() => {
    if (!activeForm?.criteria) return [] as { category: string; items: EvalCriterion[] }[];
    const map = new Map<string, EvalCriterion[]>();
    for (const c of activeForm.criteria) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  }, [activeForm]);

  // Load existing evaluation (draft or submitted) for the chosen period+employee
  useEffect(() => {
    if (!periodId || !employeeId) {
      setExistingEval(null);
      setScores({});
      setComments({});
      setRemarks("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ evaluations: Evaluation[] }>(
          `/api/evaluations?scope=submitted_by_me&periodId=${periodId}`
        );
        const existing = (data.evaluations ?? []).find((e) => e.employeeId === employeeId);
        if (cancelled) return;
        if (existing) {
          setExistingEval(existing);
          const s: Record<string, number> = {};
          const c: Record<string, string> = {};
          for (const r of existing.responses) {
            s[r.criterionId] = r.score;
            if (r.comments) c[r.criterionId] = r.comments;
          }
          setScores(s);
          setComments(c);
          // Split remarks on the separator into A and B
          const sep = "\n\n---\n\n";
          const raw = existing.remarks ?? "";
          if (raw.includes(sep)) {
            const parts = raw.split(sep);
            setRemarks(parts[0] ?? "");
            setRemarksB(parts[1] ?? "");
          } else {
            setRemarks(raw);
            setRemarksB("");
          }
        } else {
          setExistingEval(null);
          setScores({});
          setComments({});
          setRemarks("");
          setRemarksB("");
        }
      } catch {
        if (cancelled) return;
        setExistingEval(null);
        setScores({});
        setComments({});
        setRemarks("");
        setRemarksB("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [periodId, employeeId]);

  const handleSubmit = async (status: "draft" | "submitted") => {
    setError(null);
    if (!periodId) return setError("Please select a period.");
    if (!employeeId) return setError("Please select an employee.");
    if (!activeForm?.criteria) return setError("No active evaluation form configured.");
    if (status === "submitted") {
      const missing = activeForm.criteria.filter((c) => !scores[c.id]);
      if (missing.length > 0) {
        return setError(`Please score all ${activeForm.criteria.length} criteria before submitting. ${missing.length} missing.`);
      }
    }
    setSaving(true);
    try {
      const responses = activeForm.criteria
        .filter((c) => scores[c.id] !== undefined)
        .map((c) => ({
          criterionId: c.id,
          score: scores[c.id],
          comments: comments[c.id]?.trim() || undefined,
        }));
      const combinedRemarks = [remarks.trim(), remarksB.trim()]
        .filter(Boolean)
        .join("\n\n---\n\n") || undefined;
      await apiFetch("/api/evaluations", {
        method: "POST",
        body: JSON.stringify({
          periodId,
          formId: activeForm.id,
          employeeId,
          responses,
          remarks: combinedRemarks,
          status,
        }),
      });
      setError(null);
      // reset on success
      if (status === "submitted") {
        setEmployeeId("");
        setScores({});
        setComments({});
        setRemarks("");
        setRemarksB("");
        setExistingEval(null);
        setExpandedSections({});
        setShowComments({});
        setAllExpanded(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-rcc-text-muted">Loading evaluation form...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-rcc-text-primary">Submit Evaluation</h1>
        <p className="text-sm text-rcc-text-muted mt-0.5">
          Score each criterion 1–5 across 7 categories (34 criteria). Two optional textual evaluations at the bottom.
          You can save a draft and return later, or submit when complete.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      {existingEval && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p>
              An existing <strong>{existingEval.status}</strong> evaluation for this employee was found.
              Saving will overwrite it. {existingEval.submittedAt && `Last submitted: ${new Date(existingEval.submittedAt).toLocaleString()}.`}
            </p>
          </div>
        </div>
      )}

      {/* Selectors */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Evaluation Period" required hint={!selectedPeriod ? "Select an open period to begin scoring." : undefined}>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className={inputClass}>
              <option value="">Select period...</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Employee" required hint="Limited to your group.">
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass}>
              <option value="">Select employee...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeId})
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Rating legend */}
      {selectedPeriod && (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border px-5 py-3 flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
          {[
            { n: 1, label: "Poor", color: "bg-red-100 text-red-700 border-red-200" },
            { n: 2, label: "Fair", color: "bg-amber-100 text-amber-700 border-amber-200" },
            { n: 3, label: "Satisfactory", color: "bg-blue-100 text-blue-700 border-blue-200" },
            { n: 4, label: "Very Good", color: "bg-green-100 text-green-700 border-green-200" },
            { n: 5, label: "Excellent", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
          ].map((r) => (
            <span
              key={r.n}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${r.color}`}
            >
              <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold bg-white/60">
                {r.n}
              </span>
              {r.label}
            </span>
          ))}
        </div>
      )}

      {/* Criteria — collapsible sections */}
      {selectedPeriod && activeForm && (
        <div className="space-y-4">

          {/* Expand / Collapse All */}
          <div className="flex items-center justify-end">
            <button
              onClick={() => {
                const next = !allExpanded;
                setAllExpanded(next);
                const all: Record<string, boolean> = {};
                for (const g of criteriaByCategory) {
                  all[g.category] = next;
                }
                setExpandedSections(all);
              }}
              className="text-xs font-medium text-rcc-accent hover:underline"
            >
              {allExpanded ? "Collapse All" : "Expand All"}
            </button>
          </div>

          {criteriaByCategory.map((group) => {
            const scoredCount = group.items.filter((c) => scores[c.id] !== undefined).length;
            const isExpanded = !!expandedSections[group.category];
            return (
              <div key={group.category} className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
                {/* Section header */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !isExpanded;
                    setExpandedSections((prev) => ({ ...prev, [group.category]: next }));
                    if (!next) setAllExpanded(false);
                    else if (criteriaByCategory.every((g) => g.category === group.category ? true : expandedSections[g.category])) {
                      setAllExpanded(true);
                    }
                  }}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-rcc-bg/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <svg
                      className={`w-4 h-4 text-rcc-text-muted shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-semibold text-rcc-text-primary">{group.category}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      scoredCount === group.items.length
                        ? "bg-green-100 text-green-700"
                        : scoredCount > 0
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-500"
                    }`}>
                      {scoredCount}/{group.items.length} scored
                    </span>
                  </div>
                </button>

                {/* Section body */}
                {isExpanded && (
                  <div className="border-t border-rcc-border divide-y divide-rcc-border">
                    {group.items.map((crit) => (
                      <div key={crit.id} className="px-5 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 pt-1">
                            <p className="text-sm text-rcc-text-primary leading-snug">{crit.description}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <label
                                key={n}
                                className={`w-7 h-7 rounded-md border cursor-pointer flex items-center justify-center text-xs font-bold transition-colors ${
                                  scores[crit.id] === n
                                    ? "bg-rcc-primary text-rcc-primary-foreground border-rcc-primary"
                                    : "border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg"
                                }`}
                                title={n === 1 ? "Poor" : n === 2 ? "Fair" : n === 3 ? "Satisfactory" : n === 4 ? "Very Good" : "Excellent"}
                              >
                                <input
                                  type="radio"
                                  name={`crit-${crit.id}`}
                                  value={n}
                                  checked={scores[crit.id] === n}
                                  onChange={() => setScores((prev) => ({ ...prev, [crit.id]: n }))}
                                  className="sr-only"
                                />
                                {n}
                              </label>
                            ))}
                            <button
                              type="button"
                              onClick={() => setShowComments((prev) => ({ ...prev, [crit.id]: !prev[crit.id] }))}
                              className={`w-7 h-7 rounded-md border flex items-center justify-center text-xs transition-colors ${
                                showComments[crit.id]
                                  ? "bg-rcc-accent/10 text-rcc-accent border-rcc-accent/30"
                                  : "border-rcc-border text-rcc-text-muted hover:bg-rcc-bg"
                              }`}
                              title={showComments[crit.id] ? "Hide comment" : "Add comment"}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {showComments[crit.id] && (
                          <input
                            type="text"
                            value={comments[crit.id] ?? ""}
                            onChange={(e) => setComments((prev) => ({ ...prev, [crit.id]: e.target.value }))}
                            placeholder="Optional comment..."
                            className={`${inputClass} mt-2 text-xs`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Textual Evaluation — A */}
          <div className="bg-rcc-surface rounded-lg border border-rcc-border p-5 space-y-2">
            <h3 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">Textual Evaluation (A)</h3>
            <p className="text-xs text-rcc-text-muted leading-relaxed">
              Please state briefly and sincerely anything about your teacher which is not covered in the preceding items.
            </p>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="Any other comments about the teacher..."
              className={`${inputClass} resize-y text-xs`}
            />
          </div>

          {/* Textual Evaluation — B */}
          <div className="bg-rcc-surface rounded-lg border border-rcc-border p-5 space-y-2">
            <h3 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">Textual Evaluation (B)</h3>
            <p className="text-xs text-rcc-text-muted leading-relaxed">
              Please state any recommendations for the improvement of facilities, services, students, faculty or administration in general.
            </p>
            <textarea
              value={remarksB}
              onChange={(e) => setRemarksB(e.target.value)}
              rows={3}
              placeholder="Recommendations for improvement..."
              className={`${inputClass} resize-y text-xs`}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => handleSubmit("draft")}
              disabled={saving || !employeeId}
              className="px-4 py-2 rounded-md text-sm font-semibold border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button
              onClick={() => handleSubmit("submitted")}
              disabled={saving || !employeeId}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saving ? "Submitting..." : "Submit Evaluation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EvaluationResultsPage — dynamic tabs based on permissions
// ═══════════════════════════════════════════════════════════════

export function EvaluationResultsPage() {
  const { has, scopeAllEvaluation, isSystemAdmin } = usePermissions();

  // Determine available tabs based on permissions
  const tabs = useMemo(() => {
    const out: { key: string; label: string; scope: string }[] = [];
    if (has("evaluation.view_results")) {
      out.push({ key: "for_me", label: "For Me", scope: "for_me" });
    }
    if (has("evaluation.view") || scopeAllEvaluation || isSystemAdmin) {
      const label = scopeAllEvaluation || isSystemAdmin ? "Institution" : "My Department";
      out.push({ key: "all", label, scope: "all" });
    }
    return out;
  }, [has, scopeAllEvaluation, isSystemAdmin]);

  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? "");

  useEffect(() => {
    if (!tabs.find((t) => t.key === activeTab) && tabs.length > 0) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  const active = tabs.find((t) => t.key === activeTab);

  if (tabs.length === 0) {
    return (
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-8 text-center text-sm text-rcc-text-muted">
        You do not have permission to view evaluation results.
      </div>
    );
  }

    return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-rcc-text-primary">Evaluation Results</h1>
          <p className="text-sm text-rcc-text-muted mt-0.5">
            Browse submitted evaluations across the available scopes.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-rcc-border overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeTab === t.key ? "border-rcc-accent text-rcc-accent" : "border-transparent text-rcc-text-muted hover:text-rcc-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active && <ResultsTable key={active.key} scope={active.scope} />}
    </div>
  );
}

function ResultsTable({ scope }: { scope: string }) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Evaluation | null>(null);
  const [groupId, setGroupId] = useState("");
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ evaluations: Evaluation[] }>(`/api/evaluations?scope=${scope}`);
      setEvaluations(data.evaluations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load evaluations.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (scope === "all") {
      apiFetch<{ groups: { id: string; name: string }[] }>("/api/groups")
        .then((data) => setGroups(data.groups ?? []))
        .catch(() => {});
    }
  }, [scope]);

  // Build dynamic columns based on scope
  const showEvaluator = scope === "for_me" || scope === "all";
  const showEmployee = scope === "submitted_by_me" || scope === "all";

  // Filter evaluations by group
  const filtered = useMemo(() => {
    if (!groupId) return evaluations;
    return evaluations.filter((ev) => ev.employee?.groupId === groupId);
  }, [evaluations, groupId]);

  // Pagination must be called unconditionally at the top of the component —
  // but we need to call it before any early return. The hook above is already unconditional.
  const { currentData, controls } = usePagination(filtered, { defaultPageSize: 15 });

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
        {scope === "all" && groups.length > 0 && (
          <div className="px-4 py-3 border-b border-rcc-border flex items-center gap-3">
            <span className="text-sm text-rcc-text-secondary">Filter by Group:</span>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="px-3 py-1.5 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
            >
              <option value="">All Groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            {groupId && (
              <button
                onClick={() => setGroupId("")}
                className="text-xs text-rcc-accent hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-rcc-bg/50 border-b border-rcc-border">
              <tr>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Period</th>
                {showEmployee && (
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Employee</th>
                )}
                {showEmployee && (
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Department</th>
                )}
                {showEmployee && (
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Role</th>
                )}
                {showEvaluator && (
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Evaluator</th>
                )}
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Score</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Submitted</th>
                <th className="text-right text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rcc-border">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-rcc-text-muted">Loading...</td></tr>
              ) : currentData.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-rcc-text-muted">No evaluations found.</td></tr>
              ) : (
                currentData.map((ev) => (
                  <tr key={ev.id} className="hover:bg-rcc-bg/30 transition-colors">
                    <td className="px-4 py-3 text-rcc-text-secondary">{ev.period?.name ?? ""}</td>
                    {showEmployee && (
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-rcc-text-primary">{ev.employee?.name ?? ""}</p>
                          <p className="text-xs text-rcc-text-muted font-mono">{ev.employee?.employeeId ?? ""}</p>
                        </div>
                      </td>
                    )}
                    {showEmployee && (
                      <td className="px-4 py-3 text-rcc-text-secondary text-sm">{ev.employee?.group?.name ?? ""}</td>
                    )}
                    {showEmployee && (
                      <td className="px-4 py-3 text-rcc-text-secondary text-sm">{ev.employee?.role?.name ?? ""}</td>
                    )}
                    {showEvaluator && (
                      <td className="px-4 py-3 text-rcc-text-secondary">{ev.evaluator?.name ?? ""}</td>
                    )}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                        ev.status === "submitted" ? "bg-green-50 text-green-700 border-green-200"
                        : ev.status === "acknowledged" ? "bg-rcc-accent/10 text-rcc-accent border-rcc-accent/20"
                        : "bg-rcc-bg text-rcc-text-muted border-rcc-border"
                      }`}>
                        {ev.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {ev.totalScore !== null ? (
                        <span className="font-bold text-rcc-text-primary tabular-nums">{ev.totalScore.toFixed(2)}</span>
                      ) : (
                        <span className="text-rcc-text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-rcc-text-muted">
                      {ev.submittedAt ? new Date(ev.submittedAt).toLocaleDateString() : ""}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelected(ev)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-rcc-accent hover:underline"
                      >
                        <FileText className="h-3 w-3" /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls {...controls} />
      </div>

      {/* Evaluation Remarks / Details Modal */}
      {selected && (
        <EvaluationDetailsModal evaluation={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function EvaluationDetailsModal({ evaluation, onClose }: { evaluation: Evaluation; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-rcc-surface rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-rcc-border">
          <div>
            <h3 className="text-base font-semibold text-rcc-text-primary">Evaluation Details</h3>
            <p className="text-xs text-rcc-text-muted">
              {evaluation.period?.name ?? ""} · {evaluation.form?.name ?? ""}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-rcc-text-muted hover:bg-rcc-bg hover:text-rcc-text-primary transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-rcc-text-muted uppercase">Employee</p>
              <p className="text-rcc-text-primary font-medium">{evaluation.employee?.name ?? ""}</p>
            </div>
            <div>
              <p className="text-xs text-rcc-text-muted uppercase">Evaluator</p>
              <p className="text-rcc-text-primary font-medium">{evaluation.evaluator?.name ?? ""}</p>
            </div>
            <div>
              <p className="text-xs text-rcc-text-muted uppercase">Status</p>
              <p className="text-rcc-text-primary font-medium capitalize">{evaluation.status}</p>
            </div>
            <div>
              <p className="text-xs text-rcc-text-muted uppercase">Total Score</p>
              <p className="text-rcc-text-primary font-bold tabular-nums">
                {evaluation.totalScore !== null ? evaluation.totalScore.toFixed(2) : ""}
              </p>
            </div>
          </div>

          {/* Textual Evaluation A & B */}
          {evaluation.remarks && (() => {
            const sep = "\n\n---\n\n";
            const raw = evaluation.remarks ?? "";
            let partA = raw;
            let partB = "";
            if (raw.includes(sep)) {
              const parts = raw.split(sep);
              partA = parts[0] ?? "";
              partB = parts[1] ?? "";
            }
            return (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-rcc-text-muted uppercase tracking-wide">Textual Evaluation</h4>
                {partA && (
                  <div>
                    <p className="text-[10px] text-rcc-text-secondary font-medium mb-1">(A) About the teacher</p>
                    <div className="bg-rcc-bg/40 border border-rcc-border rounded-md p-3 text-sm text-rcc-text-secondary whitespace-pre-wrap">
                      {partA}
                    </div>
                  </div>
                )}
                {partB && (
                  <div>
                    <p className="text-[10px] text-rcc-text-secondary font-medium mb-1">(B) Recommendations</p>
                    <div className="bg-rcc-bg/40 border border-rcc-border rounded-md p-3 text-sm text-rcc-text-secondary whitespace-pre-wrap">
                      {partB}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Responses — grouped by category */}
          {evaluation.responses.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-rcc-text-muted uppercase tracking-wide mb-2">Criterion Responses</h4>
              {(() => {
                const grouped = new Map<string, typeof evaluation.responses>();
                for (const r of evaluation.responses) {
                  const cat = r.criterion?.category ?? "Other";
                  if (!grouped.has(cat)) grouped.set(cat, []);
                  grouped.get(cat)!.push(r);
                }
                return Array.from(grouped.entries()).map(([category, items]) => (
                  <div key={category} className="mb-3 last:mb-0">
                    <p className="text-[10px] font-semibold text-rcc-text-muted uppercase tracking-wide mb-1.5">{category}</p>
                    <ul className="space-y-1.5">
                      {items.map((r) => (
                        <li key={r.id} className="border border-rcc-border rounded-md px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-rcc-text-primary min-w-0">{r.criterion?.description ?? r.criterionId}</p>
                            <span className="text-sm font-bold text-rcc-text-primary tabular-nums shrink-0">{r.score} / 5</span>
                          </div>
                          {r.comments && <p className="text-[11px] text-rcc-text-secondary mt-1 italic">{r.comments}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Unified EvaluationPage — all features in one page, gated by permissions
// ═══════════════════════════════════════════════════════════════

export function EvaluationPage() {
  const { has, scopeAllEvaluation, isSystemAdmin } = usePermissions();

  const canSubmit = has("evaluation.submit");
  const canViewResults = has("evaluation.view") || has("evaluation.view_results") || scopeAllEvaluation || isSystemAdmin;
  const canManage = has("evaluation.manage_forms");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-rcc-text-primary">Performance Evaluation</h1>
        <p className="text-sm text-rcc-text-muted mt-0.5">
          Submit evaluations, view results, and manage evaluation periods.
        </p>
      </div>

      {/* 1. Submit Evaluation Section */}
      {canSubmit && <SubmitEvaluationPage />}

      {/* 2. Evaluation Results Section */}
      {canViewResults && <EvaluationResultsPage />}

      {/* 3. Manage Periods Section */}
      {canManage && <EvaluationFormsPage />}
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




