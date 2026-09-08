"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, LogIn, LogOut, CircleAlert } from "lucide-react";
import { fingerprintServiceUrl } from "@/lib/biometric";

// ═══════════════════════════════════════════════════════════════
// KioskLoginPanel — fingerprint clock in/out on the login screen.
// Renders NOTHING unless the local fingerprint service is reachable
// with a ready reader, so non-kiosk devices show the plain login.
// Scans never authenticate: they only toggle attendance and show a
// confirmation card. The terminal stays logged out.
// ═══════════════════════════════════════════════════════════════

interface Notice {
  key: number;
  title: string;
  subtitle: string;
  tone: "in" | "out" | "warn";
}

export function KioskLoginPanel() {
  const [active, setActive] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const keyRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((n: Omit<Notice, "key">) => {
    const key = ++keyRef.current;
    setNotice({ ...n, key });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setNotice(null), 5000);
  }, []);

  const handleEvent = useCallback((msg: Record<string, unknown>) => {
    const type = msg.type as string;
    if (type === "reader_status") {
      setActive(msg.connected === true);
    } else if (type === "attendance") {
      const action = msg.action as string;
      const name = String(msg.name ?? "Unknown");
      const code = String(msg.employeeCode ?? "");
      const time = String(msg.time ?? "");
      if (action === "clock_in") {
        showNotice({ title: `Welcome, ${name}`, subtitle: `${code} · You are now clocked in (${time})`, tone: "in" });
      } else if (action === "clock_out") {
        showNotice({ title: `Goodbye, ${name}`, subtitle: `${code} · You are now clocked out (${time})`, tone: "out" });
      } else {
        showNotice({ title: name, subtitle: `${code} · Already completed for today (${time})`, tone: "warn" });
      }
    } else if (type === "unknown") {
      showNotice({ title: "Fingerprint not recognized", subtitle: "Please try again or see HR to enroll.", tone: "warn" });
    }
  }, [showNotice]);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (closed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(fingerprintServiceUrl());
      } catch {
        scheduleRetry();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        retryRef.current = 0;
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && typeof msg === "object") handleEvent(msg as Record<string, unknown>);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setActive(false);
        scheduleRetry();
      };
      ws.onerror = () => {
        try { ws.close(); } catch { /* noop */ }
      };
    };

    const scheduleRetry = () => {
      if (closed) return;
      // Quiet backoff: a non-kiosk device refuses instantly and stays hidden;
      // if the service starts later, the panel appears on its own.
      retryRef.current = Math.min(retryRef.current + 1, 6);
      const delay = Math.min(1000 * 2 ** retryRef.current, 30000);
      timer = setTimeout(connect, delay);
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      if (timerRef.current) clearTimeout(timerRef.current);
      try { wsRef.current?.close(); } catch { /* noop */ }
    };
  }, [handleEvent]);

  if (!active) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 border-t border-rcc-border" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-rcc-text-muted">or clock in with fingerprint</span>
        <div className="flex-1 border-t border-rcc-border" />
      </div>

      <div className="flex flex-col items-center rounded-md border border-rcc-border bg-rcc-bg/60 px-4 py-5">
        <div className="w-14 h-14 rounded-full bg-rcc-primary/10 text-rcc-primary flex items-center justify-center animate-pulse">
          <Fingerprint className="h-7 w-7" />
        </div>
        <p className="mt-2 text-sm font-semibold text-rcc-text-primary">Scan your fingerprint</p>
        <p className="text-xs text-rcc-text-muted">First scan clocks you in, second clocks you out</p>

        {notice && (
          <div key={notice.key} className={`mt-3 w-full rounded-md border p-3 flex items-center gap-2.5 ${
            notice.tone === "in" ? "border-emerald-300 bg-emerald-50"
            : notice.tone === "out" ? "border-sky-300 bg-sky-50"
            : "border-amber-300 bg-amber-50"
          }`}>
            {notice.tone === "in"
              ? <LogIn className="h-5 w-5 text-emerald-600 shrink-0" />
              : notice.tone === "out"
                ? <LogOut className="h-5 w-5 text-sky-600 shrink-0" />
                : <CircleAlert className="h-5 w-5 text-amber-600 shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-bold text-rcc-text-primary truncate">{notice.title}</p>
              <p className="text-xs text-rcc-text-secondary truncate">{notice.subtitle}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
