"use client";

import { useState, useEffect, useRef } from "react";
import { Fingerprint, Trash2, AlertCircle, Wifi, WifiOff } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { apiFetch } from "@/lib/api-client";

// ═══════════════════════════════════════════════════════════════
// BiometricsCard — displays enrollment status + enroll/delete
// Shown on employee profile page, visible only with biometric.enroll
// Communicates with Python fingerprint service via WebSocket.
// ═══════════════════════════════════════════════════════════════

interface Template {
  id: string;
  fingerIndex: number;
  quality: number;
  createdAt: string;
}

interface BiometricsCardProps {
  employeeId: string;
}

export function BiometricsCard({ employeeId }: BiometricsCardProps) {
  const { has } = usePermissions();
  const canEnroll = has("biometric.enroll");

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [fpConnected, setFpConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const enrollResolveRef = useRef<((data: Record<string, unknown>) => void) | null>(null);

  // Load templates
  const loadTemplates = async () => {
    try {
      const data = await apiFetch(`/api/biometric/status?employeeId=${employeeId}`) as { templates?: Template[] };
      setTemplates(data.templates || []);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Connect to fingerprint service
  useEffect(() => {
    if (!canEnroll) return;

    const wsUrl = process.env.NEXT_PUBLIC_FINGERPRINT_SERVICE_URL || "ws://localhost:8765";
    let cancelled = false;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ op: "ping" }));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(String(event.data));
          if (data.type === "status") {
            setFpConnected(data.connected && data.readerReady);
          } else if (data.type === "result" && data.op === "enroll") {
            enrollResolveRef.current?.(data);
            enrollResolveRef.current = null;
          }
        } catch {
          // Ignore
        }
      };

      ws.onerror = () => {
        if (!cancelled) setFpConnected(false);
      };

      ws.onclose = () => {
        if (!cancelled) setFpConnected(false);
      };
    } catch {
      setFpConnected(false);
    }

    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [canEnroll]);

  const handleEnroll = async (fingerIndex: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setEnrollError("Fingerprint service not connected");
      return;
    }

    setEnrolling(true);
    setEnrollMsg(null);
    setEnrollError(null);

    // Enroll via WebSocket
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      enrollResolveRef.current = resolve;
      wsRef.current!.send(JSON.stringify({
        op: "enroll",
        employeeId,
        fingerIndex,
      }));

      // Timeout after 30s
      setTimeout(() => {
        if (enrollResolveRef.current === resolve) {
          enrollResolveRef.current = null;
          resolve({ success: false, message: "Enrollment timeout" });
        }
      }, 30000);
    });

    setEnrolling(false);

    if (result.success) {
      setEnrollMsg(`Finger ${fingerIndex + 1} enrolled successfully`);
      loadTemplates();
    } else {
      setEnrollError(String(result.message || "Enrollment failed"));
    }

    // Clear message after 5s
    setTimeout(() => {
      setEnrollMsg(null);
      setEnrollError(null);
    }, 5000);
  };

  const handleDelete = async (templateId: string) => {
    try {
      await apiFetch("/api/biometric/enroll", {
        method: "DELETE",
        body: JSON.stringify({ templateId }),
      });
      loadTemplates();
    } catch {
      setEnrollError("Failed to delete template");
    }
  };

  if (!canEnroll) return null;

  const maxFingers = 2;
  const canAddMore = templates.length < maxFingers;

  return (
    <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Fingerprint className="h-5 w-5 text-rcc-accent" />
        <h3 className="text-sm font-bold text-rcc-text-primary">Fingerprint Biometrics</h3>
        <div className="ml-auto flex items-center gap-1.5">
          {fpConnected ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
              <Wifi className="h-3 w-3" /> Reader connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-rcc-text-muted font-medium">
              <WifiOff className="h-3 w-3" /> No reader
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-rcc-text-secondary">
        Enroll up to {maxFingers} fingerprint templates for this employee.
        Fingerprint is used for clock in/out at the kiosk.
      </p>

      {/* Enrolled templates */}
      {loading ? (
        <p className="text-xs text-rcc-text-muted">Loading...</p>
      ) : templates.length === 0 ? (
        <div className="text-center py-4 border border-dashed border-rcc-border rounded-md">
          <Fingerprint className="h-8 w-8 text-rcc-text-muted mx-auto mb-2" />
          <p className="text-xs text-rcc-text-muted">No fingerprints enrolled</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 border border-rcc-border rounded-md bg-rcc-bg/30">
              <div>
                <p className="text-sm font-medium text-rcc-text-primary">
                  Finger {t.fingerIndex + 1}
                </p>
                <p className="text-xs text-rcc-text-muted">
                  Quality: {t.quality}% &middot; Enrolled {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(t.id)}
                className="p-1.5 rounded-md text-rcc-text-muted hover:text-rcc-error hover:bg-red-50 transition-colors"
                title="Delete template"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Enroll buttons */}
      {canAddMore && (
        <div className="flex gap-2">
          {[0, 1].filter(i => !templates.find(t => t.fingerIndex === i)).map((idx) => (
            <button
              key={idx}
              onClick={() => handleEnroll(idx)}
              disabled={enrolling || !fpConnected}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enrolling ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scanning...
                </>
              ) : (
                <>
                  <Fingerprint className="h-3.5 w-3.5" />
                  Enroll Finger {idx + 1}
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      {enrollMsg && (
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 border border-green-200 rounded-md p-2">
          {enrollMsg}
        </div>
      )}
      {enrollError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {enrollError}
        </div>
      )}

      {/* Service note */}
      {!fpConnected && (
        <p className="text-[10px] text-rcc-text-muted">
          Fingerprint service not available. Start the Python service to enroll.
        </p>
      )}
    </div>
  );
}
