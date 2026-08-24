"use client";

import { useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import {
  ArrowLeft, Search, Pencil, MapPin, Settings, X, Save, AlertTriangle,
  Navigation, ExternalLink, Clock, Clock as ClockOut,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { usePermissions } from "@/hooks/use-permissions";
import {
  usePagination,
  PaginationControls,
} from "@/components/shared/table-pagination-v2";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface AttendanceEmployee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  groupId: string | null;
  group?: { id: string; name: string; code: string } | null;
  role?: { id: string; name: string } | null;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employee: AttendanceEmployee | null;
  date: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  clockInLat: number | null;
  clockInLng: number | null;
  clockInOnPremise: boolean | null;
  clockInDistance: number | null;
  clockOutLat: number | null;
  clockOutLng: number | null;
  clockOutOnPremise: boolean | null;
  clockOutDistance: number | null;
  biometricVerified: boolean;
  manuallyEdited: boolean;
  editRemarks: string | null;
  editedById: string | null;
  editedBy: { id: string; name: string } | null;
  status: "clocked_in" | "clocked_out" | "no_clock_in";
}

interface GroupBrief { id: string; name: string; code: string; }
interface RoleBrief { id: string; name: string; }

interface PremisesConfig {
  lat: number;
  lng: number;
  radiusMeters: number;
  label: string;
}

const inputClass =
  "w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function toLocalDatetimeInputValue(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function osmUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

// ═══════════════════════════════════════════════════════════════
// AttendanceListPage
// ═══════════════════════════════════════════════════════════════

export function AttendanceListPage() {
  const { setCurrentPage } = useAuthStore();
  const { has, scopeAllAttendance, scopeGroupAttendance, isSystemAdmin } = usePermissions();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [groups, setGroups] = useState<GroupBrief[]>([]);
  const [roles, setRoles] = useState<RoleBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(todayISO());
  const [groupId, setGroupId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [status, setStatus] = useState<string>("all");

  const [editing, setEditing] = useState<AttendanceRecord | null>(null);

  // Effective scope: "all" if institution-wide (attendance.view_all / scopeAllAttendance / system)
  // or group-scoped (scopeGroupAttendance) — the server then enforces the actual range.
  const canViewAll = isSystemAdmin || has("attendance.view_all") || scopeAllAttendance;
  const canSeeOthers = canViewAll || scopeGroupAttendance;

  useEffect(() => {
    (async () => {
      try {
        const [g, r] = await Promise.all([
          apiFetch<{ groups: GroupBrief[] }>("/api/groups"),
          apiFetch<{ roles: RoleBrief[] }>("/api/roles/active"),
        ]);
        setGroups(g.groups ?? []);
        setRoles(r.roles ?? []);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("scope", canSeeOthers ? "all" : "mine");
      if (date) params.set("date", date);
      if (groupId) params.set("groupId", groupId);
      if (roleId) params.set("roleId", roleId);
      if (status !== "all") params.set("status", status);
      const data = await apiFetch<{ attendance: AttendanceRecord[] }>(`/api/attendance?${params.toString()}`);
      setRecords(data.attendance ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attendance.");
    } finally {
      setLoading(false);
    }
  }, [canSeeOthers, date, groupId, roleId, status]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const { currentData, controls } = usePagination(records, { defaultPageSize: 15 });

  const canEditTime = isSystemAdmin || has("attendance.edit");
  const canEditOnPremise = isSystemAdmin || has("attendance.edit_on_premise");
  const showEditBtn = canEditTime || canEditOnPremise;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-rcc-text-primary">Attendance</h1>
          <p className="text-sm text-rcc-text-muted mt-0.5">
            Daily clock-in / clock-out records. {canViewAll ? "Institution-wide view." : "Group-scoped view."}
          </p>
        </div>
        {(canEditTime || isSystemAdmin || has("roles.edit")) && (
          <button
            onClick={() => setCurrentPage("attendance", "premises")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors"
          >
            <Settings className="h-4 w-4" /> Premises Settings
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">Group</label>
            <select
              value={canViewAll ? groupId : ""}
              onChange={(e) => setGroupId(e.target.value)}
              disabled={!canViewAll}
              title={canViewAll ? undefined : "You can only view your own group's attendance."}
              className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">Role</label>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className={inputClass}>
              <option value="">All roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="all">All</option>
              <option value="clocked_in">Clocked In (still in)</option>
              <option value="clocked_out">Clocked Out</option>
              <option value="no_clock_in">No Clock-In</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      {/* Table */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-rcc-bg/50 border-b border-rcc-border">
              <tr>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Employee</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Group</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Role</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Clock In</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Clock Out</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Location</th>
                {showEditBtn && (
                  <th className="text-right text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-rcc-border">
              {loading ? (
                <tr>
                  <td colSpan={showEditBtn ? 7 : 6} className="px-4 py-10 text-center">
                    <div className="flex items-center justify-center py-12">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-rcc-primary border-t-transparent" />
                      <span className="ml-2 text-sm text-rcc-text-muted">Loading...</span>
                    </div>
                  </td>
                </tr>
              ) : currentData.length === 0 ? (
                <tr>
                  <td colSpan={showEditBtn ? 7 : 6} className="px-4 py-10 text-center text-rcc-text-muted">
                    No attendance records for the selected filters.
                  </td>
                </tr>
              ) : (
                currentData.map((r) => {
                  const emp = r.employee;
                  const isSynthetic = r.id.startsWith("synthetic-");
                  return (
                    <tr key={r.id} className="hover:bg-rcc-bg/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-rcc-primary/10 text-rcc-primary flex items-center justify-center shrink-0 text-xs font-bold">
                            {emp ? (emp.firstName.charAt(0) + emp.lastName.charAt(0)).toUpperCase() : "??"}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-rcc-text-primary truncate">
                              {emp ? `${emp.firstName} ${emp.lastName}` : ""}
                            </p>
                            <p className="text-xs text-rcc-text-muted font-mono">{emp?.employeeId ?? ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-rcc-text-secondary">
                        {emp?.group?.name ?? <span className="text-rcc-text-muted">-</span>}
                      </td>
                      <td className="px-4 py-3 text-rcc-text-secondary">
                        {emp?.role?.name ?? <span className="text-rcc-text-muted">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-rcc-text-muted" />
                          <span className={`tabular-nums ${r.clockInAt ? "text-rcc-text-primary font-medium" : "text-rcc-text-muted"}`}>
                            {formatTime(r.clockInAt)}
                          </span>
                          {r.clockInOnPremise === false && r.clockInAt && (
                            <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              OFF
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <ClockOut className="h-3.5 w-3.5 text-rcc-text-muted" />
                          <span className={`tabular-nums ${r.clockOutAt ? "text-rcc-text-primary font-medium" : "text-rcc-text-muted"}`}>
                            {formatTime(r.clockOutAt)}
                          </span>
                          {r.clockOutOnPremise === false && r.clockOutAt && (
                            <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              OFF
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {r.clockInAt ? (
                            <LocationBadge onPremise={r.clockInOnPremise} />
                          ) : (
                            <span className="text-xs text-rcc-text-muted">No clock-in</span>
                          )}
                          {r.clockInLat != null && r.clockInLng != null && (
                            <a
                              href={osmUrl(r.clockInLat, r.clockInLng)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-rcc-accent hover:underline"
                              title="View on map"
                            >
                              <MapPin className="h-3 w-3" /> Map
                            </a>
                          )}
                          {r.manuallyEdited && (
                            <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-bold bg-rcc-accent/10 text-rcc-accent border border-rcc-accent/20">
                              EDITED
                            </span>
                          )}
                        </div>
                      </td>
                      {showEditBtn && (
                        <td className="px-4 py-3 text-right">
                          {!isSynthetic && (
                            <button
                              onClick={() => setEditing(r)}
                              className="inline-flex items-center gap-1 p-1.5 rounded-md text-rcc-text-secondary hover:bg-rcc-bg hover:text-rcc-primary transition-colors"
                              title="Edit record"
                              aria-label="Edit record"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls {...controls} />
      </div>

      {/* Edit Modal */}
      {editing && (
        <EditAttendanceModal
          record={editing}
          canEditTime={canEditTime}
          canEditOnPremise={canEditOnPremise}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadRecords();
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

function LocationBadge({ onPremise }: { onPremise: boolean | null }) {
  if (onPremise === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rcc-bg text-rcc-text-muted border border-rcc-border">
        <MapPin className="h-2.5 w-2.5" /> Unknown
      </span>
    );
  }
  if (onPremise) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200">
        <MapPin className="h-2.5 w-2.5" /> On Premise
      </span>
    );
  }
  return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <MapPin className="h-2.5 w-2.5" /> Off Premise
      </span>
  );
}

function EditAttendanceModal({
  record,
  canEditTime,
  canEditOnPremise,
  onClose,
  onSaved,
  onError,
}: {
  record: AttendanceRecord;
  canEditTime: boolean;
  canEditOnPremise: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [clockIn, setClockIn] = useState(toLocalDatetimeInputValue(record.clockInAt));
  const [clockOut, setClockOut] = useState(toLocalDatetimeInputValue(record.clockOutAt));
  const [clockInOnPremise, setClockInOnPremise] = useState<string>(
    record.clockInOnPremise === null ? "" : record.clockInOnPremise ? "true" : "false"
  );
  const [clockOutOnPremise, setClockOutOnPremise] = useState<string>(
    record.clockOutOnPremise === null ? "" : record.clockOutOnPremise ? "true" : "false"
  );
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const emp = record.employee;
  const empName = emp ? `${emp.firstName} ${emp.lastName}` : "";

  const handleSave = async () => {
    if (!remarks.trim()) {
      onError("Edit remarks are required.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { editRemarks: remarks.trim() };
      if (canEditTime) {
        payload.clockInAt = clockIn ? new Date(clockIn).toISOString() : null;
        payload.clockOutAt = clockOut ? new Date(clockOut).toISOString() : null;
      }
      if (canEditOnPremise) {
        payload.clockInOnPremise = clockInOnPremise === "" ? undefined : clockInOnPremise === "true";
        payload.clockOutOnPremise = clockOutOnPremise === "" ? undefined : clockOutOnPremise === "true";
      }
      await apiFetch(`/api/attendance/${record.id}/edit`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Edit failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-rcc-surface rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-rcc-text-primary">Edit Attendance</h3>
            <p className="text-xs text-rcc-text-muted">{empName} · {new Date(record.date).toLocaleDateString()}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-rcc-text-muted hover:bg-rcc-bg hover:text-rcc-text-primary transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {canEditTime ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Clock In">
                <input
                  type="datetime-local"
                  value={clockIn}
                  onChange={(e) => setClockIn(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Clock Out">
                <input
                  type="datetime-local"
                  value={clockOut}
                  onChange={(e) => setClockOut(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          ) : (
            <div className="text-xs text-rcc-text-muted bg-rcc-bg/40 border border-rcc-border rounded-md p-2">
              Time editing requires <code className="text-rcc-text-secondary">attendance.edit</code> permission.
            </div>
          )}

          {canEditOnPremise ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Clock-In On Premise Override" hint="Blank = no override.">
                <select value={clockInOnPremise} onChange={(e) => setClockInOnPremise(e.target.value)} className={inputClass}>
                  <option value="">No override</option>
                  <option value="true">On Premise</option>
                  <option value="false">Off Premise</option>
                </select>
              </Field>
              <Field label="Clock-Out On Premise Override" hint="Blank = no override.">
                <select value={clockOutOnPremise} onChange={(e) => setClockOutOnPremise(e.target.value)} className={inputClass}>
                  <option value="">No override</option>
                  <option value="true">On Premise</option>
                  <option value="false">Off Premise</option>
                </select>
              </Field>
            </div>
          ) : (
            <div className="text-xs text-rcc-text-muted bg-rcc-bg/40 border border-rcc-border rounded-md p-2">
              On-premise override requires <code className="text-rcc-text-secondary">attendance.edit_on_premise</code> permission.
            </div>
          )}

          <Field label="Edit Remarks" required hint="Required. Explain the reason for this manual edit.">
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="e.g. Employee forgot to clock in; verified via security log #1234."
              className={`${inputClass} resize-y`}
            />
          </Field>

          {record.manuallyEdited && record.editedBy && (
            <div className="text-xs text-rcc-text-muted bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p>Previously edited by {record.editedBy.name}.</p>
                {record.editRemarks && <p className="italic">&ldquo;{record.editRemarks}&rdquo;</p>}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
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
            {saving ? "Saving..." : "Save Edit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PremisesSettingsPage
// ═══════════════════════════════════════════════════════════════

export function PremisesSettingsPage() {
  const { setCurrentPage } = useAuthStore();

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ premises: PremisesConfig }>("/api/settings/premises");
        const p = data.premises;
        setLat(String(p.lat));
        setLng(String(p.lng));
        setRadius(String(p.radiusMeters));
        setLabel(p.label);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load premises config.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        setLocating(false);
      },
      (err) => {
        setError(err.message || "Failed to get current location.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseInt(radius, 10);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) return setError("Latitude must be between -90 and 90.");
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) return setError("Longitude must be between -180 and 180.");
    if (isNaN(radiusNum) || radiusNum < 1 || radiusNum > 100_000) return setError("Radius must be 1–100,000 meters.");
    if (!label.trim()) return setError("Label is required.");

    setSaving(true);
    try {
      await apiFetch("/api/settings/premises", {
        method: "POST",
        body: JSON.stringify({ lat: latNum, lng: lngNum, radiusMeters: radiusNum, label: label.trim() }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-rcc-text-muted">Loading premises config...</p>
      </div>
    );
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCurrentPage("attendance")}
          className="inline-flex items-center gap-1 text-sm text-rcc-text-secondary hover:text-rcc-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to attendance
        </button>
      </div>
      <div>
        <h1 className="text-xl font-bold text-rcc-text-primary">Premises Settings</h1>
        <p className="text-sm text-rcc-text-muted mt-0.5">
          Configure the geofence center and radius used to evaluate clock-in / clock-out on-premise status.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-700">
          Premises settings saved.
        </div>
      )}

      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
        <Field label="Premises Label" required>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. RCC Angeles Campus" className={inputClass} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Latitude" required hint="-90 to 90">
            <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Longitude" required hint="-180 to 180">
            <input type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Radius (meters)" required hint="1–100,000">
            <input type="number" step="1" value={radius} onChange={(e) => setRadius(e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleUseMyLocation}
            disabled={locating}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors disabled:opacity-50"
          >
            <Navigation className="h-4 w-4" />
            {locating ? "Locating..." : "Use my current location"}
          </button>
          {!isNaN(latNum) && !isNaN(lngNum) && (
            <a
              href={osmUrl(latNum, lngNum)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-rcc-accent hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> View on OpenStreetMap
            </a>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={() => setCurrentPage("attendance")}
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
          {saving ? "Saving..." : "Save Settings"}
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
