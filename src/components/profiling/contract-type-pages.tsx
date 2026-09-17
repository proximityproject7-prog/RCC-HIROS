"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { Plus, Pencil, ToggleLeft, ToggleRight, Save, ArrowLeft } from "lucide-react";

interface ContractType {
  id: string;
  name: string;
  code: string;
  active: boolean;
}

const inputClass =
  "w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40";

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-rcc-text-primary mb-1">
        {label} {required && <span className="text-rcc-error">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-rcc-text-muted mt-1">{hint}</p>}
    </div>
  );
}

export function ContractTypeManagementPage() {
  const { setCurrentPage } = useAuthStore();
  const [contractTypes, setContractTypes] = useState<ContractType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ContractType | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ContractType | null>(null);
  const [toggleConfirmOpen, setToggleConfirmOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ contractTypes: ContractType[] }>("/api/contract-types");
      setContractTypes(data.contractTypes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contract types.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setName("");
    setCode("");
    setEditTarget(null);
    setShowForm(false);
  };

  const startEdit = (ct: ContractType) => {
    setEditTarget(ct);
    setName(ct.name);
    setCode(ct.code);
    setShowForm(true);
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (!code.trim()) return setError("Code is required.");
    setSaving(true);
    try {
      const payload = { name: name.trim(), code: code.trim().toUpperCase() };
      if (editTarget) {
        await apiFetch(`/api/contract-types/${editTarget.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/contract-types", { method: "POST", body: JSON.stringify({ ...payload, active: true }) });
      }
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      if (toggleTarget.active) {
        await apiFetch(`/api/contract-types/${toggleTarget.id}`, { method: "DELETE" });
      } else {
        await apiFetch(`/api/contract-types/${toggleTarget.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: true }),
        });
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle failed.");
    } finally {
      setToggling(false);
      setToggleTarget(null);
      setToggleConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentPage("profiling")}
            className="p-2 rounded-md text-rcc-text-secondary hover:bg-rcc-bg hover:text-rcc-primary transition-colors"
            title="Back to Employee Records"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-rcc-text-primary">Contract Types</h1>
            <p className="text-sm text-rcc-text-muted mt-0.5">Configure contract types (Regular, Contractual, Part-Time, etc.).</p>
          </div>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          disabled={showForm}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New Contract Type
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      {showForm && (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
          <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
            {editTarget ? `Edit: ${editTarget.name}` : "Create Contract Type"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Name" required>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Regular" className={inputClass} />
            </Field>
            <Field label="Code" required hint="Stored uppercase (e.g. REG, CTR).">
              <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="REG" className={`${inputClass} font-mono uppercase`} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={resetForm} disabled={saving} className="px-4 py-2 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : editTarget ? "Save Changes" : "Create"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-rcc-bg/50 border-b border-rcc-border">
              <tr>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Code</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rcc-border">
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-rcc-text-muted">Loading...</td></tr>
              ) : contractTypes.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-rcc-text-muted">No contract types. Create one to get started.</td></tr>
              ) : (
                contractTypes.map((ct) => (
                  <tr key={ct.id} className="hover:bg-rcc-bg/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-rcc-text-primary">{ct.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-rcc-text-secondary">{ct.code}</td>
                    <td className="px-4 py-3">
                      {ct.active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-rcc-error"><span className="w-1.5 h-1.5 rounded-full bg-rcc-error" /> Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => startEdit(ct)} className="p-1.5 rounded-md text-rcc-text-secondary hover:bg-rcc-bg hover:text-rcc-primary transition-colors" title="Edit" aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { setToggleTarget(ct); setToggleConfirmOpen(true); }}
                          disabled={toggling}
                          className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                            ct.active
                              ? "text-rcc-text-secondary hover:bg-red-50 hover:text-rcc-error"
                              : "text-rcc-text-secondary hover:bg-green-50 hover:text-green-600"
                          }`}
                          title={ct.active ? "Deactivate" : "Activate"}
                          aria-label={ct.active ? "Deactivate" : "Activate"}
                        >
                          {ct.active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {toggleConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setToggleTarget(null); setToggleConfirmOpen(false); }}>
          <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-rcc-text-primary mb-2">
              {toggleTarget?.active ? "Deactivate" : "Activate"} &ldquo;{toggleTarget?.name}&rdquo;?
            </h3>
            <p className="text-sm text-rcc-text-muted mb-4">
              {toggleTarget?.active
                ? "This contract type will be hidden from new employee forms. Existing employees will keep their assignment."
                : "This contract type will become available for new employee forms."}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setToggleTarget(null); setToggleConfirmOpen(false); }} disabled={toggling} className="px-4 py-2 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleToggleActive}
                disabled={toggling}
                className={`px-4 py-2 rounded-md text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                  toggleTarget?.active ? "bg-rcc-error hover:bg-rcc-error/90" : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {toggling ? "Saving..." : toggleTarget?.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
