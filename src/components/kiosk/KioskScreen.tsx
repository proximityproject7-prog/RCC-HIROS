"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, Wifi, WifiOff, Clock, LogIn, LogOut, CircleAlert } from "lucide-react";
import { fingerprintServiceUrl } from "@/lib/biometric";

// ═══════════════════════════════════════════════════════════════
// KioskScreen — fingerprint attendance terminal.
// Styled on the RCC-HIROS rcc-* tokens (light theme) like the rest
// of the system. Identification-only: the Python service matches
// fingers and writes attendance rows; this screen renders live WS
// events.
// ═══════════════════════════════════════════════════════════════

interface ScanEvent {
  key: number;
  name: string;
  employeeCode: string;
  action: string;
  time: string;
}

interface Popup {
  key: number;
  title: string;
  subtitle: string;
  tone: "in" | "out" | "warn";
}

function manilaNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function KioskScreen() {
  const [connected, setConnected] = useState(false);
  const [readerReady, setReaderReady] = useState(false);
  const [readerMsg, setReaderMsg] = useState("Connecting to fingerprint service...");
  const [now, setNow] = useState<Date>(() => manilaNow());
  const [popup, setPopup] = useState<Popup | null>(null);
  const [activity, setActivity] = useState<ScanEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const keyRef = useRef(0);
  const popupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPopup = useCallback((p: Omit<Popup, "key">) => {
    const key = ++keyRef.current;
    setPopup({ ...p, key });
    if (popupTimer.current) clearTimeout(popupTimer.current);
    popupTimer.current = setTimeout(() => setPopup(null), 5000);
  }, []);

  const handleEvent = useCallback((msg: Record<string, unknown>) => {
    const type = msg.type as string;
    if (type === "reader_status") {
      setReaderReady(msg.connected === true);
      setReaderMsg(typeof msg.message === "string" ? msg.message : "");
    } else if (type === "attendance") {
      const action = msg.action as string;
      const name = String(msg.name ?? "Unknown");
      const code = String(msg.employeeCode ?? "");
      const time = String(msg.time ?? "");
      const key = ++keyRef.current;
      setActivity((prev) => [{ key, name, employeeCode: code, action, time }, ...prev].slice(0, 20));
      if (action === "clock_in") {
        showPopup({ title: `Welcome, ${name}`, subtitle: `${code} · Clocked in at ${time}`, tone: "in" });
      } else if (action === "clock_out") {
        showPopup({ title: `Goodbye, ${name}`, subtitle: `${code} · Clocked out at ${time}`, tone: "out" });
      } else {
        showPopup({ title: name, subtitle: `${code} · Already completed for today (${time})`, tone: "warn" });
      }
    } else if (type === "unknown") {
      showPopup({ title: "Fingerprint not recognized", subtitle: "Please try again or see HR to enroll.", tone: "warn" });
    } else if (type === "error") {
      setReaderMsg(typeof msg.message === "string" ? msg.message : "Service error");
    }
  }, [showPopup]);

  useEffect(() => {
    const tick = setInterval(() => setNow(manilaNow()), 1000);
    return () => clearInterval(tick);
  }, []);

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
        setConnected(true);
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
        setConnected(false);
        setReaderReady(false);
        scheduleRetry();
      };
      ws.onerror = () => {
        try { ws.close(); } catch { /* noop */ }
      };
    };

    const scheduleRetry = () => {
      if (closed) return;
      retryRef.current = Math.min(retryRef.current + 1, 5);
      const delay = Math.min(1000 * 2 ** retryRef.current, 10000);
      setReaderMsg(`Service offline — retrying in ${Math.round(delay / 1000)}s...`);
      timer = setTimeout(connect, delay);
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      if (popupTimer.current) clearTimeout(popupTimer.current);
      try { wsRef.current?.close(); } catch { /* noop */ }
    };
  }, [handleEvent]);

  return (
    <div className="min-h-screen bg-rcc-bg text-rcc-text-primary flex flex-col">
      {/* Header */}
      <header className="bg-rcc-surface border-b border-rcc-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rcc-primary/10 text-rcc-primary flex items-center justify-center">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">RCC-HIROS Attendance Kiosk</h1>
            <p className="text-xs text-rcc-text-muted">Scan your fingerprint to clock in / out</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{fmtClock(now)}</p>
          <p className="text-xs text-rcc-text-muted">{fmtDate(now)}</p>
        </div>
      </header>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-6 py-2 text-xs bg-rcc-surface border-b border-rcc-border">
        {connected
          ? <Wifi className="h-3.5 w-3.5 text-emerald-600" />
          : <WifiOff className="h-3.5 w-3.5 text-rcc-error" />}
        <span className={connected ? "text-emerald-700 font-medium" : "text-rcc-error font-medium"}>
          {connected ? "Service connected" : "Service offline"}
        </span>
        <span className="text-rcc-text-muted">·</span>
        <span className={readerReady ? "text-emerald-700" : "text-amber-700"}>{readerMsg}</span>
      </div>

      {/* Body */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 max-w-6xl w-full mx-auto">
        {/* Scan prompt */}
        <section className="flex flex-col items-center justify-center rounded-lg border border-rcc-border bg-rcc-surface p-10 min-h-[320px] relative overflow-hidden">
          <div className={`w-28 h-28 rounded-full flex items-center justify-center ${readerReady ? "bg-rcc-accent/15 text-rcc-primary animate-pulse" : "bg-rcc-bg text-rcc-text-muted"}`}>
            <Fingerprint className="h-14 w-14" />
          </div>
          <p className="mt-6 text-lg font-semibold">
            {readerReady ? "Place your finger on the reader" : "Reader unavailable"}
          </p>
          <p className="mt-1 text-sm text-rcc-text-muted text-center">
            {readerReady ? "First scan clocks you in, second scan clocks you out." : readerMsg}
          </p>

          {/* Result popup */}
          {popup && (
            <div key={popup.key} className={`absolute inset-x-6 bottom-6 rounded-md border p-4 flex items-center gap-3 shadow-lg ${
              popup.tone === "in" ? "border-emerald-300 bg-emerald-50"
              : popup.tone === "out" ? "border-sky-300 bg-sky-50"
              : "border-amber-300 bg-amber-50"
            }`}>
              {popup.tone === "in"
                ? <LogIn className="h-6 w-6 text-emerald-600 shrink-0" />
                : popup.tone === "out"
                  ? <LogOut className="h-6 w-6 text-sky-600 shrink-0" />
                  : <CircleAlert className="h-6 w-6 text-amber-600 shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-bold text-rcc-text-primary truncate">{popup.title}</p>
                <p className="text-xs text-rcc-text-secondary truncate">{popup.subtitle}</p>
              </div>
            </div>
          )}
        </section>

        {/* Recent activity (this session) */}
        <section className="rounded-lg border border-rcc-border bg-rcc-surface p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-rcc-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-rcc-text-primary">Recent scans — this session</h2>
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-rcc-text-muted py-8 text-center">No scans yet. Successful scans appear here.</p>
          ) : (
            <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {activity.map((a) => (
                <li key={a.key} className="flex items-center gap-3 rounded-md border border-rcc-border bg-rcc-bg/50 px-3 py-2">
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold ${
                    a.action === "clock_in" ? "bg-emerald-100 text-emerald-700"
                    : a.action === "clock_out" ? "bg-sky-100 text-sky-700"
                    : "bg-amber-100 text-amber-700"
                  }`}>
                    {a.action === "clock_in" ? "IN" : a.action === "clock_out" ? "OUT" : "DONE"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-rcc-text-primary truncate">{a.name}</p>
                    <p className="text-xs text-rcc-text-muted font-mono">{a.employeeCode}</p>
                  </div>
                  <span className="text-xs text-rcc-text-secondary tabular-nums shrink-0">{a.time}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
