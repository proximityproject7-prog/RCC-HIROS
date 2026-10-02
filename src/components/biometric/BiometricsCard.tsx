"use client";

import { useState, useEffect } from "react";
import { Fingerprint, Trash2, AlertCircle, Shield, ShieldOff, CheckCircle, Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { apiFetch, ApiError } from "@/lib/api-client";

const KIOSK_SERVICE_URL =
  process.env.NEXT_PUBLIC_KIOSK_SERVICE_URL || "http://127.0.0.1:8765";

/**
 * Parse a kiosk-service error body — FastAPI wraps messages as
 * {"detail": "..."} — so the UI shows a readable message instead of raw JSON.
 */
async function readKioskError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const data = JSON.parse(text) as { detail?: string };
    if (data && typeof data.detail === "string" && data.detail) {
      return data.detail;
    }
  } catch {
    // not JSON — fall through to raw text
  }
  return text || `Scanner request failed (HTTP ${res.status})`;
}

interface Template {
  id: string;
  fingerIndex: number;
  quality: number;
  createdAt: string;
  engine: string;
}

interface BiometricsCardProps {
  employeeId: string;
}

export function BiometricsCard({ employeeId }: BiometricsCardProps) {
  const { has, canManageBiometrics } = usePermissions();
  const canEnroll = has("biometric.enroll") || canManageBiometrics;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const [checkingScanner, setCheckingScanner] = useState(true);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);

  // Probe kiosk service on mount
  useEffect(() => {
    async function checkScanner() {
      try {
        const res = await fetch(`${KIOSK_SERVICE_URL}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        const data = await res.json();
        setScannerReady(data.scanner === "connected");
      } catch {
        setScannerReady(false);
      } finally {
        setCheckingScanner(false);
      }
    }
    checkScanner();
  }, []);

  // Load templates
  const loadTemplates = async () => {
    try {
      const data = await apiFetch(
        `/api/biometric/status?employeeId=${employeeId}`
      ) as { templates?: Template[] };
      setTemplates(data.templates || []);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [employeeId]);

  const handleEnroll = async (fingerIndex: number) => {
    setEnrolling(true);
    setEnrollMsg(null);
    setEnrollError(null);
    setCapturedImages([]);

    try {
      // Step 1: Capture 3 swipes via local kiosk service
      const captureRes = await fetch(`${KIOSK_SERVICE_URL}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swipes: 3, timeoutS: 15 }),
        signal: AbortSignal.timeout(60000),
      });

      if (!captureRes.ok) {
        throw new Error(await readKioskError(captureRes));
      }

      const { imagesB64, regTemplateB64, swipesCaptured, width, height, dpi } = await captureRes.json();

      // Show captured images for preview
      setCapturedImages(imagesB64);

      // Step 2: Save registration template to server
      const deviceName = `${window.location.hostname}-${navigator.userAgent.slice(0, 20)}`;
      const saveRes = await apiFetch<{ success: boolean }>("/api/biometric/zk/enroll", {
        method: "POST",
        body: JSON.stringify({
          employeeId,
          fingerIndex,
          regTemplateB64,
          deviceName,
          swipesCaptured,
        }),
      });

      if (!saveRes.success) {
        throw new Error("Server rejected enrollment");
      }

      setEnrollMsg(`Finger ${fingerIndex + 1} enrolled successfully (${swipesCaptured} swipes)`);
      loadTemplates();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Enrollment failed";
      if (msg.includes("timeout") || msg.includes("timed out")) {
        setEnrollError("Scan timed out - no finger detected");
      } else if (msg.includes("cancelled")) {
        setEnrollError("Enrollment cancelled");
      } else {
        setEnrollError(msg);
      }
    } finally {
      setEnrolling(false);
    }

    setTimeout(() => {
      setEnrollMsg(null);
      setEnrollError(null);
      setCapturedImages([]);
    }, 8000);
  };

  const handleDelete = async (templateId: string) => {
    setEnrollMsg(null);
    setEnrollError(null);
    try {
      await apiFetch("/api/biometric/enroll", {
        method: "DELETE",
        body: JSON.stringify({ templateId }),
      });
      loadTemplates();
    } catch (err) {
      if (err instanceof ApiError) {
        setEnrollError(err.message);
      } else if (err instanceof TypeError) {
        setEnrollError("Cannot reach the server. Is it running?");
      } else {
        setEnrollError("Failed to delete template");
      }
      setTimeout(() => setEnrollError(null), 8000);
    }
  };

  if (!canEnroll) return null;

  const maxFingers = 2;
  const canAddMore = templates.length < maxFingers;

  return (
    <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Fingerprint className="h-5 w-5 text-rcc-accent" />
        <h3 className="text-sm font-bold text-rcc-text-primary">
          Fingerprint Biometrics
        </h3>
        <div className="ml-auto flex items-center gap-1.5">
          {checkingScanner ? (
            <span className="inline-flex items-center gap-1 text-xs text-rcc-text-muted font-medium">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking scanner...
            </span>
          ) : scannerReady ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle className="h-3 w-3" /> ZK Scanner ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
              <ShieldOff className="h-3 w-3" /> Scanner not available on this device
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-rcc-text-secondary">
        Enroll up to {maxFingers} fingerprint templates for this employee.
        Fingerprint is used for clock in/out at the kiosk.
      </p>

      {/* Enrollment in progress banner */}
      {enrolling && (
        <div className="flex items-center gap-3 p-3 rounded-md border border-blue-200 bg-blue-50">
          <Loader2 className="h-5 w-5 text-blue-600 shrink-0 animate-spin" />
          <div>
            <p className="text-sm font-semibold text-blue-800">
              Capturing fingerprint ({capturedImages.length}/3 swipes)...
            </p>
            <p className="text-xs text-blue-600">
              Place your finger on the ZK9500 reader when prompted
            </p>
          </div>
        </div>
      )}

      {/* Captured image previews */}
      {capturedImages.length > 0 && !enrolling && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {capturedImages.map((img, i) => (
            <div key={i} className="flex-shrink-0 w-24">
              <img
                src={`data:image/png;base64,${img}`}
                alt={`Swipe ${i + 1}`}
                className="rounded border border-rcc-border"
              />
              <p className="text-[10px] text-center text-rcc-text-muted mt-1">Swipe {i + 1}</p>
            </div>
          ))}
        </div>
      )}

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
            <div
              key={t.id}
              className="flex items-center justify-between p-3 border border-rcc-border rounded-md bg-rcc-bg/30"
            >
              <div>
                <p className="text-sm font-medium text-rcc-text-primary">
                  Finger {t.fingerIndex + 1}
                  {t.engine === "zk" && (
                    <span className="ml-1.5 text-[10px] bg-rcc-accent/10 text-rcc-accent px-1 rounded">ZK</span>
                  )}
                  {t.engine === "webauthn" && (
                    <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1 rounded">Hello</span>
                  )}
                </p>
                <p className="text-xs text-rcc-text-muted">
                  Enrolled {new Date(t.createdAt).toLocaleDateString()}
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
      {canAddMore && scannerReady && (
        <div className="flex gap-2">
          {[0, 1]
            .filter((i) => !templates.find((t) => t.fingerIndex === i))
            .map((idx) => (
              <button
                key={idx}
                onClick={() => handleEnroll(idx)}
                disabled={enrolling || !scannerReady}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enrolling ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Enrolling...
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

      {!scannerReady && !checkingScanner && canAddMore && (
        <p className="text-xs text-amber-600">
          Plug in the ZK9500 scanner and ensure the local service is running on this device to enroll.
        </p>
      )}

      {/* Messages */}
      {enrollMsg && (
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 border border-green-200 rounded-md p-2">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" /> {enrollMsg}
        </div>
      )}
      {enrollError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {enrollError}
        </div>
      )}
    </div>
  );
}