"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, Trash2, Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { apiFetch } from "@/lib/api-client";
import { MAX_TEMPLATES_PER_EMPLOYEE, FINGER_LABELS, fingerLabel, fingerprintServiceUrl } from "@/lib/biometric";

// ═══════════════════════════════════════════════════════════════
// BiometricsCard — fingerprint enrollment on the employee profile.
// Capture runs against the local Python service over WebSocket;
// the returned template GUID is saved via /api/biometric/enroll.
// ═══════════════════════════════════════════════════════════════

interface TemplateMeta {
  id: string;
  fingerIndex: number;
  quality: number;
  createdAt: string;
}

export function BiometricsCard({ employeeId }: { employeeId: string }) {
  const { user } = useAuth();
  const { has, isSystemAdmin } = usePermissions();
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState(1); // default: Right Index
  const [enrolling, setEnrolling] = useState(false);
  const [progress, setProgress] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const isSelf = user?.id === employeeId;
  const canModify =
    isSystemAdmin || has("biometric.manage") || (isSelf && has("biometric.enroll"));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ templates?: TemplateMeta[] }>(
        `/api/biometric/status?employeeId=${encodeURIComponent(employeeId)}`
      );
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load biometrics");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
    return () => {
      try { wsRef.current?.close(); } catch { /* noop */ }
    };
  }, [load]);

  const usedSlots = new Set(templates.map((t) => t.fingerIndex));
  const freeSlots = FINGER_LABELS.map((_, i) => i).filter((i) => !usedSlots.has(i));

  useEffect(() => {
    if (!freeSlots.includes(slot) && freeSlots.length > 0) setSlot(freeSlots[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.length]);

  const startEnrollment = () => {
    setError(null);
    setProgress("Connecting to fingerprint service...");
    setEnrolling(true);
    let ws: WebSocket;
    try {
      ws = new WebSocket(fingerprintServiceUrl());
    } catch {
      setError("Fingerprint service offline — start fingerprint-service/main.py on the kiosk machine.");
      setEnrolling(false);
      return;
    }
    wsRef.current = ws;
    const failTimer = setTimeout(() => {
      try { ws.close(); } catch { /* noop */ }
      if (wsRef.current === ws) {
        setError("Fingerprint service offline — start fingerprint-service/main.py on the kiosk machine.");
        setProgress("");
        setEnrolling(false);
      }
    }, 8000);

    ws.onopen = () => {
      clearTimeout(failTimer);
      setProgress("Place the selected finger on the reader...");
      ws.send(JSON.stringify({ type: "enroll_begin", employeeId, fingerIndex: slot }));
    };
    ws.onmessage = async (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "enroll_progress") {
        setProgress(typeof msg.message === "string" ? msg.message : "Scanning...");
      } else if (msg.type === "enroll_complete") {
        setProgress("Scan complete — saving...");
        try {
          await apiFetch("/api/biometric/enroll", {
            method: "POST",
            body: JSON.stringify({
              employeeId,
              fingerIndex: slot,
              templateData: msg.templateData,
              quality: msg.quality ?? 0,
            }),
          });
          setProgress("");
          try { ws.close(); } catch { /* noop */ }
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to save template");
          setProgress("");
        } finally {
          setEnrolling(false);
        }
      } else if (msg.type === "enroll_error") {
        setError(typeof msg.message === "string" ? msg.message : "Enrollment failed");
        setProgress("");
        setEnrolling(false);
        try { ws.close(); } catch { /* noop */ }
      }
    };
    ws.onclose = () => {
      clearTimeout(failTimer);
      if (wsRef.current === ws) {
        setEnrolling((prev) => {
          if (prev && !progress) setError("Lost connection to the fingerprint service.");
          return false;
        });
      }
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* noop */ }
    };
  };

  const cancelEnrollment = () => {
    try { wsRef.current?.send(JSON.stringify({ type: "enroll_cancel" })); } catch { /* noop */ }
    try { wsRef.current?.close(); } catch { /* noop */ }
    setEnrolling(false);
    setProgress("");
  };

  const removeTemplate = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(null);
    setDeleting(id);
    setError(null);
    try {
      await apiFetch(`/api/biometric/enroll?templateId=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete template");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5">
        <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-rcc-primary" /> Biometrics
        </h2>
        <span className="text-xs text-rcc-text-muted">{templates.length} / {MAX_TEMPLATES_PER_EMPLOYEE} enrolled</span>
      </div>
      <div className="p-5 pt-0 space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-rcc-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading fingerprints...
          </div>
        ) : (
          <>
            {templates.length === 0 ? (
              <p className="text-sm text-rcc-text-muted">No fingerprints enrolled. Enrolled fingers can clock in/out at the kiosk.</p>
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 p-3 border border-rcc-border rounded-md">
                    <div className="w-9 h-9 rounded-md bg-rcc-primary/10 text-rcc-primary flex items-center justify-center shrink-0">
                      <Fingerprint className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-rcc-text-primary">{fingerLabel(t.fingerIndex)}</p>
                      <p className="text-xs text-rcc-text-muted">
                        Quality {t.quality}% · {new Date(t.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                      </p>
                    </div>
                    {canModify && (
                      <button
                        onClick={() => removeTemplate(t.id)}
                        disabled={deleting === t.id}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${confirmDelete === t.id ? "bg-rcc-error text-white hover:bg-rcc-error/90" : "text-rcc-text-secondary hover:bg-red-50 hover:text-rcc-error"}`}
                        title={confirmDelete === t.id ? "Click again to confirm" : "Delete"}
                      >
                        <Trash2 className="h-3 w-3" /> {deleting === t.id ? "..." : confirmDelete === t.id ? "Confirm?" : ""}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-rcc-error">{error}</div>
            )}
            {enrolling && progress && (
              <div className="flex items-center gap-2 text-sm text-rcc-text-secondary bg-rcc-bg/50 border border-rcc-border rounded-md p-3">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" /> {progress}
              </div>
            )}

            {canModify && templates.length < MAX_TEMPLATES_PER_EMPLOYEE && !enrolling && (
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={slot}
                  onChange={(e) => setSlot(Number(e.target.value))}
                  className="flex-1 text-sm border border-rcc-border rounded-md px-2.5 py-2 bg-rcc-bg text-rcc-text-primary"
                >
                  {freeSlots.map((i) => (
                    <option key={i} value={i}>{FINGER_LABELS[i]}</option>
                  ))}
                </select>
                <button
                  onClick={startEnrollment}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Enroll Fingerprint
                </button>
              </div>
            )}
            {canModify && enrolling && (
              <button
                onClick={cancelEnrollment}
                className="px-3 py-2 rounded-md text-xs font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors"
              >
                Cancel Enrollment
              </button>
            )}
            {!canModify && (
              <p className="text-xs text-rcc-text-muted">Fingerprint enrollment is not enabled for your role.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
