"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { MapPin, LogOut, AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

// ═══════════════════════════════════════════════════════════════
// GeofenceGuard — monitors user location and auto-logs out
// when they leave the configured premises radius.
// Off-premise state shows as a small collapsible floating
// widget at the bottom-right corner.
// ═══════════════════════════════════════════════════════════════

interface PremisesConfig {
  lat: number;
  lng: number;
  radiusMeters: number;
  label: string;
}

const DEFAULT_PREMISES: PremisesConfig = {
  lat: 15.1428,
  lng: 120.5886,
  radiusMeters: 200,
  label: "Republic Central Colleges",
};

const AUTO_LOGOUT_SECONDS = 300; // 5 minutes off-premise before auto-logout
const CHECK_INTERVAL_MS = 15_000; // check every 15 seconds

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

interface GeofenceGuardProps {
  onLogout: () => void;
  children: React.ReactNode;
}

export function GeofenceGuard({ onLogout, children }: GeofenceGuardProps) {
  const [premises, setPremises] = useState<PremisesConfig>(DEFAULT_PREMISES);
  const [offPremise, setOffPremise] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(AUTO_LOGOUT_SECONDS);
  const [expanded, setExpanded] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offSinceRef = useRef<number | null>(null);

  // Load premises config
  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ premises: PremisesConfig }>("/api/settings/premises");
        if (data.premises) setPremises(data.premises);
      } catch {
        // use default
      }
    })();
  }, []);

  // Process a position update
  const handlePosition = useCallback(
    (pos: GeolocationPosition) => {
      const { latitude, longitude } = pos.coords;
      const dist = haversineMeters(latitude, longitude, premises.lat, premises.lng);
      const isOff = dist > premises.radiusMeters;

      setDistance(dist);

      if (isOff) {
        if (!offSinceRef.current) {
          // Just went off-premise
          offSinceRef.current = Date.now();
          setCountdown(AUTO_LOGOUT_SECONDS);
          setExpanded(false);
        }
        setOffPremise(true);
      } else {
        // Back on premise — reset everything
        offSinceRef.current = null;
        setOffPremise(false);
        setExpanded(false);
        setCountdown(AUTO_LOGOUT_SECONDS);
      }
    },
    [premises]
  );

  // Start watching position
  useEffect(() => {
    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      () => {
        // Geolocation error — silently ignore (permission denied, etc.)
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [handlePosition]);

  // Countdown timer when off-premise (pure updater — no side effects)
  useEffect(() => {
    if (offPremise) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [offPremise]);

  // Fire auto-logout from an effect — never inside a state updater
  useEffect(() => {
    if (offPremise && countdown === 0) {
      onLogout();
    }
  }, [offPremise, countdown, onLogout]);

  // Also check periodically in case watchPosition doesn't fire
  useEffect(() => {
    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        handlePosition,
        () => {},
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 }
      );
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [handlePosition]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <>
      {children}

      {/* Off-premise floating widget (collapsed pill by default) */}
      {offPremise && (
        <div className="fixed bottom-4 right-4 z-[100]">
          {expanded ? (
            <div className="w-64 bg-rcc-surface border border-amber-300 rounded-lg shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200">
                <div className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">You are off premise</span>
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="p-1 rounded-md hover:bg-amber-100 text-amber-700 transition-colors"
                  aria-label="Collapse"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="px-3 py-2.5 space-y-2.5">
                <p className="text-xs text-rcc-text-secondary leading-relaxed">
                  {distance !== null && `${(distance / 1000).toFixed(1)} km away. `}
                  Auto-logout in{" "}
                  <span className="font-mono font-semibold text-amber-700">{formatTime(countdown)}</span>
                </p>
                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-md transition-colors"
                >
                  <LogOut className="h-3 w-3" /> Sign Out
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-lg text-xs font-semibold transition-colors animate-pulse"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              You are off premise
              <ChevronUp className="h-3 w-3 opacity-80" />
            </button>
          )}
        </div>
      )}

      {/* Subtle indicator when on-premise */}
      {distance !== null && !offPremise && (
        <div className="fixed bottom-3 right-3 z-[90]" title={`On premises (${distance}m from center)`}>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded-full text-[10px] text-green-700 font-medium">
            <MapPin className="h-3 w-3" />
            On Premises
          </div>
        </div>
      )}
    </>
  );
}
