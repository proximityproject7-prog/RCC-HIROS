"use client";

import { useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import {
  Plus, Search, Pencil, Trash2, ArrowLeft, Save, AlertTriangle,
  CalendarClock, FileText, Eye, Download, X, Upload, Clock,
  ThumbsUp, ThumbsDown, Undo2, FileUp, ToggleRight, ToggleLeft,
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

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  variant: "danger" | "warning";
  onConfirm: () => void;
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  defaultDays: number;
  active: boolean;
}

interface LeaveApproval {
  id: string;
  level: number;
  approverId: string;
  approverName: string | null;
  status: string;
  remarks: string | null;
  actedAt: string | null;
  createdAt: string;
}

interface LeaveRequest {
  id: string;
  requestNo: string;
  employeeId: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
    groupId: string | null;
  } | null;
  leaveTypeId: string;
  leaveType: { id: string; name: string; code: string } | null;
  startDate: string;
  endDate: string;
  workdays: number;
  reason: string;
  status: string;
  documentFileName: string | null;
  documentOriginalName: string | null;
  documentMimeType: string | null;
  documentFileSize: number | null;
  createdAt: string;
  updatedAt: string;
  approvals: LeaveApproval[];
}

const inputClass =
  "w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_l1: { label: "Pending L1", color: "amber" },
  pending_l2: { label: "Pending L2", color: "amber" },
  approved: { label: "Approved", color: "green" },
  rejected: { label: "Rejected", color: "red" },
  cancelled: { label: "Cancelled", color: "muted" },
  draft: { label: "Draft", color: "muted" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_LABELS[status] ?? { label: status, color: "muted" };
  const colorMap: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    green: "bg-green-50 text-green-700 border-green-200",
    red: "bg-red-50 text-rcc-error border-red-200",
    muted: "bg-rcc-bg text-rcc-text-muted border-rcc-border",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${colorMap[info.color]}`}>
      {info.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// MyLeavePage
// ═══════════════════════════════════════════════════════════════

export function MyLeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balanceWarning, setBalanceWarning] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<LeaveRequest | null>(null);
  const [formLeaveType, setFormLeaveType] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const loadLeaveTypes = useCallback(async () => {
    try {
      const data = await apiFetch<{ leaveTypes: LeaveType[] }>("/api/leave-types");
      setLeaveTypes(data.leaveTypes ?? []);
    } catch {
      // non-fatal
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ requests: LeaveRequest[] }>("/api/leave-requests?scope=mine");
      setRequests(data.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leave requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeaveTypes();
    loadRequests();
  }, [loadLeaveTypes, loadRequests]);

  const { currentData, controls } = usePagination(requests, { defaultPageSize: 10 });

  const resetForm = () => {
    setFormLeaveType("");
    setFormStart("");
    setFormEnd("");
    setFormReason("");
    setFormFile(null);
    setBalanceWarning(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    setError(null);
    setBalanceWarning(null);
    if (!formLeaveType) return setError("Please select a leave type.");
    if (!formStart) return setError("Start date is required.");
    if (!formEnd) return setError("End date is required.");
    if (new Date(formEnd) < new Date(formStart)) return setError("End date cannot be before start date.");
    if (!formReason.trim()) return setError("Reason is required.");

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("leaveTypeId", formLeaveType);
      fd.append("startDate", formStart);
      fd.append("endDate", formEnd);
      fd.append("reason", formReason.trim());
      if (formFile) fd.append("file", formFile);

      const res = await apiFetch<{ request: LeaveRequest; balanceWarning: { message: string } | null }>(
        "/api/leave-requests",
        { method: "POST", body: fd, skipJsonHeader: true }
      );
      if (res.balanceWarning) setBalanceWarning(res.balanceWarning.message);
      resetForm();
      loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-rcc-text-primary">My Leave Requests</h1>
          <p className="text-sm text-rcc-text-muted mt-0.5">Submit and track your own leave requests.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 bg-rcc-primary text-rcc-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-rcc-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {showForm ? "Cancel" : "New Request"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}
      {balanceWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Balance Warning</p>
            <p>{balanceWarning}</p>
          </div>
        </div>
      )}

      {/* New Request Form */}
      {showForm && (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
          <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">New Leave Request</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Leave Type" required>
              <select value={formLeaveType} onChange={(e) => setFormLeaveType(e.target.value)} className={inputClass}>
                <option value="">Select...</option>
                {leaveTypes.map((lt) => (
                  <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>
                ))}
              </select>
            </Field>
            <Field label="Start Date" required>
              <input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} className={inputClass} />
            </Field>
            <Field label="End Date" required>
              <input type="date" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="Reason" required>
            <textarea
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              rows={3}
              placeholder="Briefly describe the reason for your leave..."
              className={`${inputClass} resize-y`}
            />
          </Field>
          <Field label="Supporting Document (Optional)" hint="Medical certificate, etc. PDF/images/Word. Max 25MB.">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors cursor-pointer">
              <Upload className="h-4 w-4" />
              {formFile ? formFile.name : "Choose File"}
              <input
                type="file"
                className="hidden"
                onChange={(e) => setFormFile(e.target.files?.[0] ?? null)}
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
              />
            </label>
          </Field>
          <div className="flex justify-end gap-2">
            <button onClick={resetForm} disabled={saving} className="px-4 py-2 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-rcc-bg/50 border-b border-rcc-border">
              <tr>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Request No.</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Dates</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Workdays</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Reason</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Doc</th>
                <th className="text-right text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rcc-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-rcc-text-muted">Loading...</td>
                </tr>
              ) : currentData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-rcc-text-muted">
                    No leave requests yet. Click &ldquo;New Request&rdquo; to create one.
                  </td>
                </tr>
              ) : (
                currentData.map((r) => (
                  <tr key={r.id} className="hover:bg-rcc-bg/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-rcc-text-secondary">{r.requestNo}</td>
                    <td className="px-4 py-3 text-rcc-text-primary font-medium">{r.leaveType?.name ?? ""}</td>
                    <td className="px-4 py-3 text-rcc-text-secondary">
                      {formatDate(r.startDate)} → {formatDate(r.endDate)}
                    </td>
                    <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{r.workdays}</td>
                    <td className="px-4 py-3 text-rcc-text-secondary max-w-xs truncate" title={r.reason}>{r.reason}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      {r.documentFileName ? (
                        <button
                          onClick={async () => {
                            const token = localStorage.getItem("hiros_token");
                            const res = await fetch(`/api/leave-requests/${r.id}/document`, {
                              headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            if (!res.ok) return;
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            window.open(url, "_blank");
                            setTimeout(() => URL.revokeObjectURL(url), 60_000);
                          }}
                          className="inline-flex items-center gap-1 text-xs text-rcc-accent hover:underline"
                          title={r.documentOriginalName ?? "View document"}
                        >
                          <FileText className="h-3.5 w-3.5" /> View
                        </button>
                      ) : (
                        <span className="text-xs text-rcc-text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setViewingRequest(r)}
                          className="p-1.5 rounded hover:bg-rcc-bg text-rcc-text-muted hover:text-rcc-text-primary transition-colors"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {(r.status === "pending_l1" || r.status === "pending_l2") && (
                          <button
                            onClick={() => {
                              setConfirmState({
                                open: true,
                                title: "Cancel Leave Request",
                                message: "Are you sure you want to cancel this leave request? This cannot be undone.",
                                variant: "danger",
                                onConfirm: () => {
                                  setConfirmState(null);
                                  apiFetch(`/api/leave-requests/${r.id}`, { method: "DELETE" })
                                    .then(() => loadRequests())
                                    .catch((e) => { setError(e instanceof Error ? e.message : "Failed to cancel"); });
                                },
                              });
                            }}
                            className="p-1.5 rounded hover:bg-red-50 text-rcc-text-muted hover:text-rcc-error transition-colors"
                            title="Cancel request"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls {...controls} />
      </div>
      {/* Request Detail Modal */}
      {viewingRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-rcc-text-primary">Leave Request Details</h3>
              <button onClick={() => setViewingRequest(null)} className="text-rcc-text-muted hover:text-rcc-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-rcc-text-muted">Request No:</span><span className="font-mono text-rcc-text-primary">{viewingRequest.requestNo}</span></div>
              <div className="flex justify-between"><span className="text-rcc-text-muted">Type:</span><span className="text-rcc-text-primary">{viewingRequest.leaveType?.name ?? ""}</span></div>
              <div className="flex justify-between"><span className="text-rcc-text-muted">Dates:</span><span className="text-rcc-text-primary">{formatDate(viewingRequest.startDate)} → {formatDate(viewingRequest.endDate)}</span></div>
              <div className="flex justify-between"><span className="text-rcc-text-muted">Working Days:</span><span className="text-rcc-text-primary tabular-nums">{viewingRequest.workdays}</span></div>
              <div className="flex justify-between"><span className="text-rcc-text-muted">Status:</span><StatusBadge status={viewingRequest.status} /></div>
              <div><span className="text-rcc-text-muted">Reason:</span><p className="text-rcc-text-primary mt-1 italic">"{viewingRequest.reason}"</p></div>
              {viewingRequest.documentFileName && (
                <div>
                  <span className="text-rcc-text-muted">Document:</span>
                  <button
                    onClick={async () => {
                      const token = localStorage.getItem("hiros_token");
                      const res = await fetch(`/api/leave-requests/${viewingRequest.id}/document`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
                      if (!res.ok) return;
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank");
                      setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    }}
                    className="ml-2 inline-flex items-center gap-1 text-rcc-accent hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" /> {viewingRequest.documentOriginalName ?? "View document"}
                  </button>
                </div>
              )}
              {viewingRequest.approvals && viewingRequest.approvals.length > 0 && (
                <div>
                  <span className="text-rcc-text-muted">Approval History:</span>
                  <div className="mt-1 space-y-1">
                    {viewingRequest.approvals.map((a) => (
                      <div key={a.id} className="text-xs text-rcc-text-secondary flex items-center gap-2">
                        <span className="font-medium">L{a.level}</span>
                        <span>{a.approverName ?? ""}</span>
                        <span className={a.status === "approved" ? "text-green-600" : a.status === "rejected" ? "text-red-600" : "text-rcc-text-muted"}>{a.status}</span>
                        <span>{a.actedAt ? new Date(a.actedAt).toLocaleDateString() : ""}</span>
                        {a.remarks && <span className="italic">&ldquo;{a.remarks}&rdquo;</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-rcc-border">
              {(viewingRequest.status === "pending_l1" || viewingRequest.status === "pending_l2") && (
                <button
                  onClick={() => {
                    setConfirmState({
                      open: true,
                      title: "Cancel Leave Request",
                      message: "Are you sure you want to cancel this leave request? This cannot be undone.",
                      variant: "danger",
                      onConfirm: () => {
                        setConfirmState(null);
                        apiFetch(`/api/leave-requests/${viewingRequest.id}`, { method: "DELETE" })
                          .then(() => {
                            setViewingRequest(null);
                            loadRequests();
                          })
                          .catch((e) => { setError(e instanceof Error ? e.message : "Failed to cancel"); });
                      },
                    });
                  }}
                  className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Cancel Request
                </button>
              )}
              <button onClick={() => setViewingRequest(null)} className="px-4 py-2 text-sm font-medium text-rcc-text-secondary hover:bg-rcc-bg rounded-md">Close</button>
            </div>
          </div>
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
// LeaveApprovalPage
// ═══════════════════════════════════════════════════════════════

export function LeaveApprovalPage() {
  const { has } = usePermissions();
  const canL1 = has("leave.approve_l1");
  const canL2 = has("leave.approve_l2");
  const [tab, setTab] = useState<"l1" | "l2">(canL1 ? "l1" : "l2");

  const [l1Reqs, setL1Reqs] = useState<LeaveRequest[]>([]);
  const [l2Reqs, setL2Reqs] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action modal
  const [actionTarget, setActionTarget] = useState<{ req: LeaveRequest; level: 1 | 2; action: "approve" | "reject" | "recall" } | null>(null);
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tasks: Promise<void>[] = [];
      if (canL1) {
        tasks.push(
          apiFetch<{ requests: LeaveRequest[] }>("/api/leave-requests?scope=pending_l1")
            .then((d) => setL1Reqs(d.requests ?? []))
            .catch(() => setL1Reqs([]))
        );
      }
      if (canL2) {
        tasks.push(
          apiFetch<{ requests: LeaveRequest[] }>("/api/leave-requests?scope=pending_l2")
            .then((d) => setL2Reqs(d.requests ?? []))
            .catch(() => setL2Reqs([]))
        );
      }
      await Promise.all(tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  }, [canL1, canL2]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async () => {
    if (!actionTarget) return;
    if (actionTarget.action === "reject" && !remarks.trim()) {
      setError("Remarks are required for rejections.");
      return;
    }
    setActing(true);
    setError(null);
    try {
      if (actionTarget.action === "recall") {
        await apiFetch(`/api/leave-requests/${actionTarget.req.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "recall" }),
        });
      } else {
        await apiFetch(`/api/leave-requests/${actionTarget.req.id}/approve`, {
          method: "POST",
          body: JSON.stringify({
            level: actionTarget.level,
            action: actionTarget.action,
            remarks: remarks.trim(),
          }),
        });
      }
      setActionTarget(null);
      setRemarks("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActing(false);
    }
  };

  const list = tab === "l1" ? l1Reqs : l2Reqs;
  const level: 1 | 2 = tab === "l1" ? 1 : 2;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-rcc-text-primary">Leave Approvals</h1>
        <p className="text-sm text-rcc-text-muted mt-0.5">
          Approve, reject, or recall pending leave requests.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-rcc-border">
        {canL1 && (
          <button
            onClick={() => setTab("l1")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "l1" ? "border-rcc-accent text-rcc-accent" : "border-transparent text-rcc-text-muted hover:text-rcc-text-primary"
            }`}
          >
            L1 (Pending Dean) <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700">{l1Reqs.length}</span>
          </button>
        )}
        {canL2 && (
          <button
            onClick={() => setTab("l2")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "l2" ? "border-rcc-accent text-rcc-accent" : "border-transparent text-rcc-text-muted hover:text-rcc-text-primary"
            }`}
          >
            L2 (Pending HR/Final) <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700">{l2Reqs.length}</span>
          </button>
        )}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-8 text-center text-sm text-rcc-text-muted">
          Loading requests...
        </div>
      ) : list.length === 0 ? (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-8 text-center text-sm text-rcc-text-muted">
          No pending L{level} approvals. You&apos;re all caught up!
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              level={level}
              onApprove={() => setActionTarget({ req, level, action: "approve" })}
              onReject={() => setActionTarget({ req, level, action: "reject" })}
              onRecall={() => {
                setActionTarget({ req, level: 1, action: "recall" });
              }}
            />
          ))}
        </div>
      )}

      {/* Action Modal */}
      {actionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-rcc-surface rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-rcc-text-primary">
                {actionTarget.action === "approve" && "Approve Request"}
                {actionTarget.action === "reject" && "Reject Request"}
                {actionTarget.action === "recall" && "Recall L1 Approval"}
              </h3>
              <button
                onClick={() => {
                  setActionTarget(null);
                  setRemarks("");
                }}
                className="p-1.5 rounded-md text-rcc-text-muted hover:bg-rcc-bg hover:text-rcc-text-primary transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-rcc-text-muted mb-3">
              Request <span className="font-mono">{actionTarget.req.requestNo}</span> -{" "}
              {actionTarget.req.employee ? `${actionTarget.req.employee.firstName} ${actionTarget.req.employee.lastName}` : "Unknown"}
            </p>
            {actionTarget.action === "recall" ? (
              <p className="text-sm text-rcc-text-secondary">
                Recalling will return this request to <strong>Pending L1</strong> status and remove your prior L1 approval.
                The L2 approver will be notified that the request is no longer ready for final approval.
              </p>
            ) : (
              <Field label="Remarks" required>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  placeholder={actionTarget.action === "approve" ? "Optional approval note..." : "Reason for rejection (required)..."}
                  className={`${inputClass} resize-y`}
                />
              </Field>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setActionTarget(null);
                  setRemarks("");
                }}
                disabled={acting}
                className="px-4 py-2 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={acting}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                  actionTarget.action === "approve" ? "bg-green-600 hover:bg-green-700" : actionTarget.action === "reject" ? "bg-rcc-error hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {actionTarget.action === "approve" && <ThumbsUp className="h-4 w-4" />}
                {actionTarget.action === "reject" && <ThumbsDown className="h-4 w-4" />}
                {actionTarget.action === "recall" && <Undo2 className="h-4 w-4" />}
                {acting ? "Working..." : actionTarget.action === "approve" ? "Approve" : actionTarget.action === "reject" ? "Reject" : "Recall"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RequestCard({
  req,
  level,
  onApprove,
  onReject,
  onRecall,
}: {
  req: LeaveRequest;
  level: 1 | 2;
  onApprove: () => void;
  onReject: () => void;
  onRecall: () => void;
}) {
  const emp = req.employee;
  return (
    <div className="bg-rcc-surface rounded-lg border border-rcc-border p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-rcc-text-muted">{req.requestNo}</p>
          <p className="font-semibold text-rcc-text-primary truncate">
            {emp ? `${emp.firstName} ${emp.lastName}` : "Unknown"}
            <span className="ml-2 text-xs font-normal text-rcc-text-muted font-mono">{emp?.employeeId ?? ""}</span>
          </p>
        </div>
        <StatusBadge status={req.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-rcc-text-muted">Leave Type</dt>
          <dd className="text-rcc-text-primary font-medium">{req.leaveType?.name ?? ""}</dd>
        </div>
        <div>
          <dt className="text-xs text-rcc-text-muted">Workdays</dt>
          <dd className="text-rcc-text-primary font-medium tabular-nums">{req.workdays}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-rcc-text-muted">Dates</dt>
          <dd className="text-rcc-text-primary font-medium">{formatDate(req.startDate)} → {formatDate(req.endDate)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-rcc-text-muted">Reason</dt>
          <dd className="text-rcc-text-secondary text-sm whitespace-pre-wrap">{req.reason}</dd>
        </div>
      </dl>

      {req.documentFileName && (
        <div className="mt-3">
          <button
            onClick={async () => {
              const token = localStorage.getItem("hiros_token");
              const res = await fetch(`/api/leave-requests/${req.id}/document`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              if (!res.ok) return;
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              window.open(url, "_blank");
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }}
            className="inline-flex items-center gap-1 text-xs text-rcc-accent hover:underline"
          >
            <FileText className="h-3.5 w-3.5" /> {req.documentOriginalName ?? "View document"}
          </button>
        </div>
      )}

      {/* Approval chain */}
      <div className="mt-3 pt-3 border-t border-rcc-border">
        <p className="text-xs text-rcc-text-muted mb-1.5">Approval Chain</p>
        <div className="space-y-1">
          {req.approvals.length === 0 ? (
            <p className="text-xs text-rcc-text-muted italic">No approvals yet.</p>
          ) : (
            req.approvals.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs">
                <span className="text-rcc-text-secondary">
                  L{a.level}: {a.approverName ?? "Unknown"}
                </span>
                <span className={`font-semibold ${a.status === "approved" ? "text-green-700" : a.status === "rejected" ? "text-rcc-error" : "text-amber-700"}`}>
                  {a.status}
                  {a.actedAt && <span className="ml-1 text-rcc-text-muted font-normal">· {new Date(a.actedAt).toLocaleString()}</span>}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={onApprove}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
        >
          <ThumbsUp className="h-3.5 w-3.5" /> Approve L{level}
        </button>
        <button
          onClick={onReject}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-rcc-error text-white hover:bg-red-700 transition-colors"
        >
          <ThumbsDown className="h-3.5 w-3.5" /> Reject
        </button>
        {level === 2 && req.approvals.some((a) => a.level === 1 && a.status === "approved") && (
          <button
            onClick={onRecall}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors ml-auto"
            title="Recall L1 approval"
          >
            <Undo2 className="h-3.5 w-3.5" /> Recall L1
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LeaveTypeManagementPage
// ═══════════════════════════════════════════════════════════════

export function LeaveTypeManagementPage() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<LeaveType | null>(null);
  const [toggleTarget, setToggleTarget] = useState<LeaveType | null>(null);
  const [toggling, setToggling] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [defaultDays, setDefaultDays] = useState("0");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ leaveTypes: LeaveType[] }>("/api/leave-types");
      setLeaveTypes(data.leaveTypes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leave types.");
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
    setDefaultDays("0");
    setEditTarget(null);
    setShowForm(false);
  };

  const startEdit = (lt: LeaveType) => {
    setEditTarget(lt);
    setName(lt.name);
    setCode(lt.code);
    setDefaultDays(String(lt.defaultDays));
    setShowForm(true);
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (!code.trim()) return setError("Code is required.");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        defaultDays: Number(defaultDays) || 0,
      };
      if (editTarget) {
        await apiFetch(`/api/leave-types/${editTarget.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/leave-types", { method: "POST", body: JSON.stringify({ ...payload, active: true }) });
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
    setError(null);
    try {
      if (toggleTarget.active) {
        // Deactivate
        await apiFetch(`/api/leave-types/${toggleTarget.id}`, { method: "DELETE" });
      } else {
        // Re-enable
        await apiFetch(`/api/leave-types/${toggleTarget.id}`, {
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
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-rcc-text-primary">Leave Types</h1>
          <p className="text-sm text-rcc-text-muted mt-0.5">Configure leave categories (VL, SL, etc.).</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          disabled={showForm}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            showForm
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90"
          }`}
        >
          <Plus className="h-4 w-4" /> New Leave Type
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      {showForm && (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
          <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
            {editTarget ? `Edit: ${editTarget.name}` : "Create Leave Type"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Name" required>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vacation Leave" className={inputClass} />
            </Field>
            <Field label="Code" required hint="Stored uppercase (e.g. VL, SL).">
              <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VL" className={`${inputClass} font-mono uppercase`} />
            </Field>
            <Field label="Default Days / Year" hint="Default allocation for new employees.">
              <input type="number" step="0.5" min="0" value={defaultDays} onChange={(e) => setDefaultDays(e.target.value)} className={inputClass} />
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
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Default Days</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rcc-border">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-rcc-text-muted">Loading...</td></tr>
              ) : leaveTypes.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-rcc-text-muted">No leave types. Create one to get started.</td></tr>
              ) : (
                leaveTypes.map((lt) => (
                  <tr key={lt.id} className="hover:bg-rcc-bg/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-rcc-text-primary">{lt.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-rcc-text-secondary">{lt.code}</td>
                    <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{lt.defaultDays}</td>
                    <td className="px-4 py-3">
                      {lt.active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-rcc-error"><span className="w-1.5 h-1.5 rounded-full bg-rcc-error" /> Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => startEdit(lt)} className="p-1.5 rounded-md text-rcc-text-secondary hover:bg-rcc-bg hover:text-rcc-primary transition-colors" title="Edit" aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setToggleTarget(lt)}
                          disabled={toggling}
                          className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                            lt.active
                              ? "text-rcc-text-secondary hover:bg-red-50 hover:text-rcc-error"
                              : "text-rcc-text-secondary hover:bg-green-50 hover:text-green-600"
                          }`}
                          title={lt.active ? "Deactivate" : "Activate"}
                          aria-label={lt.active ? "Deactivate" : "Activate"}
                        >
                          {lt.active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
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
                  {toggleTarget.active ? "Deactivate" : "Activate"} leave type &ldquo;{toggleTarget.name}&rdquo;?
                </h3>
                <p className={`text-sm mt-1 ${toggleTarget.active ? "text-rcc-text-muted" : "text-green-600"}`}>
                  {toggleTarget.active
                    ? "This leave type will be hidden from new leave requests. Existing balances will be preserved."
                    : "This leave type will become available for new leave requests."}
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
                {toggling ? "Processing..." : toggleTarget.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AllLeavePage
// ═══════════════════════════════════════════════════════════════

export function AllLeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ requests: LeaveRequest[] }>("/api/leave-requests?scope=all");
      setRequests(data.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leave requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      const emp = r.employee;
      const empName = emp ? `${emp.firstName} ${emp.lastName}`.toLowerCase() : "";
      return (
        r.requestNo.toLowerCase().includes(q) ||
        empName.includes(q) ||
        (r.leaveType?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [requests, search, statusFilter]);

  const { currentData, controls } = usePagination(filtered, { defaultPageSize: 15 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-rcc-text-primary">All Leave Requests</h1>
        <p className="text-sm text-rcc-text-muted mt-0.5">Cross-group leave request log.</p>
      </div>

      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-rcc-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by employee, request no., or type..."
              className={`${inputClass} pl-10`}
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
            <option value="">All statuses</option>
            <option value="pending_l1">Pending L1</option>
            <option value="pending_l2">Pending L2</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-rcc-bg/50 border-b border-rcc-border">
              <tr>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Request No.</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Employee</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Dates</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Workdays</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rcc-border">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-rcc-text-muted">Loading...</td></tr>
              ) : currentData.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-rcc-text-muted">No leave requests found.</td></tr>
              ) : (
                currentData.map((r) => (
                  <tr key={r.id} className="hover:bg-rcc-bg/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-rcc-text-secondary">{r.requestNo}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-rcc-text-primary">
                          {r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : ""}
                        </p>
                        <p className="text-xs text-rcc-text-muted font-mono">{r.employee?.employeeId ?? ""}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-rcc-text-secondary">{r.leaveType?.name ?? ""}</td>
                    <td className="px-4 py-3 text-rcc-text-secondary">
                      {formatDate(r.startDate)} → {formatDate(r.endDate)}
                    </td>
                    <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{r.workdays}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-xs text-rcc-text-muted">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls {...controls} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LeavePage — unified entry point (like EvaluationPage)
// ═══════════════════════════════════════════════════════════════

export function LeavePage() {
  const { has } = usePermissions();

  const canRequest = has("leave.request");
  const canApprove = has("leave.approve_l1") || has("leave.approve_l2");
  const canViewAll = has("leave.view_all");
  const canManageTypes = has("leave.manage_types");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-rcc-text-primary">Leave Management</h1>
        <p className="text-sm text-rcc-text-muted mt-0.5">
          Submit and manage leave requests, approvals, and leave types.
        </p>
      </div>

      {/* 1. My Leave Requests */}
      {canRequest && <MyLeavePage />}

      {/* 2. Leave Approvals */}
      {canApprove && <LeaveApprovalPage />}

      {/* 3. All Leave Requests */}
      {canViewAll && <AllLeavePage />}

      {/* 4. Leave Type Management */}
      {canManageTypes && <LeaveTypeManagementPage />}
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

// Suppress unused-import warnings
void CalendarClock;
void Clock;
void Eye;
void Download;
void FileUp;
void ArrowLeft;
