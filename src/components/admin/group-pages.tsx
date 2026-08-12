"use client";

import { useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import {
  Plus, Search, Pencil, ArrowLeft, Save, Building2,
  Users as UsersIcon, AlertTriangle, ToggleLeft, ToggleRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { usePermissions } from "@/hooks/use-permissions";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface Group {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  employeeCount?: number;
}

// ═══════════════════════════════════════════════════════════════
// GroupListPage
// ═══════════════════════════════════════════════════════════════

export function GroupListPage() {
  const { setCurrentPage } = useAuthStore();
  const { has } = usePermissions();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toggleTarget, setToggleTarget] = useState<Group | null>(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ groups: Group[] }>("/api/groups");
      setGroups(data.groups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.code.toLowerCase().includes(q) ||
        (g.description ?? "").toLowerCase().includes(q)
    );
  }, [groups, search]);

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      if (toggleTarget.active) {
        await apiFetch(`/api/groups/${toggleTarget.id}`, { method: "DELETE" });
      } else {
        await apiFetch(`/api/groups/${toggleTarget.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: true }),
        });
      }
      setToggleTarget(null);
      loadGroups();
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
          <h1 className="text-xl font-bold text-rcc-text-primary">Groups</h1>
          <p className="text-sm text-rcc-text-muted mt-0.5">
            Departments / organizational units used for scoping.
          </p>
        </div>
        {has("groups.manage") && (
          <button
            onClick={() => setCurrentPage("groups", "create")}
            className="inline-flex items-center gap-2 bg-rcc-primary text-rcc-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-rcc-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Group
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
            placeholder="Search by name, code, or description..."
            className="w-full pl-10 pr-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">
          {error}
        </div>
      )}

      {/* Card grid */}
      {loading ? (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-8 text-center text-sm text-rcc-text-muted">
          Loading groups...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-8 text-center text-sm text-rcc-text-muted">
          No groups found. {search && "Try adjusting your search."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((group) => (
            <div
              key={group.id}
              className="bg-rcc-surface rounded-lg border border-rcc-border p-5 hover:border-rcc-accent/40 hover:shadow-md transition-all flex flex-col"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-md flex items-center justify-center bg-rcc-primary/10 text-rcc-primary shrink-0">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-1">
                  {has("groups.manage") && (
                    <>
                      <button
                        onClick={() => setCurrentPage("groups", `edit:${group.id}`)}
                        className="p-1.5 rounded-md text-rcc-text-secondary hover:bg-rcc-bg hover:text-rcc-primary transition-colors"
                        title="Edit group"
                        aria-label="Edit group"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setToggleTarget(group)}
                        className={`p-1.5 rounded-md transition-colors ${
                          group.active
                            ? "text-rcc-text-secondary hover:bg-red-50 hover:text-rcc-error"
                            : "text-rcc-text-secondary hover:bg-green-50 hover:text-green-600"
                        }`}
                        title={group.active ? "Disable group" : "Enable group"}
                        aria-label={group.active ? "Disable group" : "Enable group"}
                      >
                        {group.active ? (
                          <ToggleRight className="h-3.5 w-3.5" />
                        ) : (
                          <ToggleLeft className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-rcc-text-primary">{group.name}</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rcc-accent/10 text-rcc-accent border border-rcc-accent/20">
                    {group.code}
                  </span>
                  {!group.active && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-rcc-error border border-rcc-error/20">
                      INACTIVE
                    </span>
                  )}
                </div>
                {group.description ? (
                  <p className="text-sm text-rcc-text-muted mt-1 line-clamp-2">{group.description}</p>
                ) : (
                  <p className="text-sm text-rcc-text-muted/60 mt-1 italic">No description</p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-rcc-border flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs text-rcc-text-secondary">
                  <UsersIcon className="h-3.5 w-3.5" />
                  {group.employeeCount ?? 0} employee{(group.employeeCount ?? 0) === 1 ? "" : "s"}
                </span>
                {has("groups.manage") && (
                  <button
                    onClick={() => setCurrentPage("groups", `edit:${group.id}`)}
                    className="text-xs font-medium text-rcc-accent hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Enable/Disable confirmation modal */}
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
                  {toggleTarget.active ? "Disable" : "Enable"} group &ldquo;{toggleTarget.name}&rdquo;?
                </h3>
                <p className="text-sm text-rcc-text-muted mt-1">
                  {toggleTarget.active
                    ? "This group will be hidden from new employee assignments. Existing employees will keep their assignment."
                    : "This group will become available for new employee assignments."}
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

// ═══════════════════════════════════════════════════════════════
// GroupFormPage
// ═══════════════════════════════════════════════════════════════

export function GroupFormPage({ mode, groupId }: { mode: "create" | "edit"; groupId?: string }) {
  const { setCurrentPage } = useAuthStore();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !groupId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch<{ group: Group }>(`/api/groups/${groupId}`);
        if (cancelled) return;
        const g = data.group;
        setName(g.name);
        setCode(g.code);
        setDescription(g.description ?? "");
        setActive(g.active);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load group.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, groupId]);

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Group name is required.");
      return;
    }
    if (!code.trim()) {
      setError("Group code is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
        active,
      };
      if (mode === "create") {
        await apiFetch("/api/groups", { method: "POST", body: JSON.stringify(payload) });
      } else if (groupId) {
        await apiFetch(`/api/groups/${groupId}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      setCurrentPage("groups");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-rcc-text-muted">Loading group...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCurrentPage("groups")}
          className="inline-flex items-center gap-1 text-sm text-rcc-text-secondary hover:text-rcc-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to groups
        </button>
      </div>
      <div>
        <h1 className="text-xl font-bold text-rcc-text-primary">
          {mode === "create" ? "Create Group" : "Edit Group"}
        </h1>
        <p className="text-sm text-rcc-text-muted mt-0.5">
          Define the group&apos;s name, code, and description.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">
          {error}
        </div>
      )}

      {/* Form */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
        <Field label="Group Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Human Resources"
            className="w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
          />
        </Field>

        <Field label="Group Code" required hint="Stored uppercase (e.g. HR, IT, FIN).">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. HR"
            className="w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm font-mono text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40 uppercase"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description of this group..."
            rows={3}
            className="w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40 resize-y"
          />
        </Field>

        <label
          className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
            active ? "border-rcc-accent/40 bg-rcc-accent/5" : "border-rcc-border hover:bg-rcc-bg/40"
          }`}
        >
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-rcc-border text-rcc-accent focus:ring-rcc-accent/40"
          />
          <div>
            <p className="text-sm font-semibold text-rcc-text-primary">Active Group</p>
            <p className="text-xs text-rcc-text-muted mt-0.5">
              Inactive groups cannot be assigned to new employees.
            </p>
          </div>
        </label>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={() => setCurrentPage("groups")}
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
          {saving ? "Saving..." : mode === "create" ? "Create Group" : "Save Changes"}
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
