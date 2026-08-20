"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { MapPin, LogOut, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

// ═══════════════════════════════════════════════════════════════
// GeofenceGuard — monitors user location and auto-logs out
// when they leave the configured premises radius.
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
  const [dismissed, setDismissed] = useState(false);
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
          setDismissed(false);
          setCountdown(AUTO_LOGOUT_SECONDS);
        }
        setOffPremise(true);
      } else {
        // Back on premise — reset everything
        offSinceRef.current = null;
        setOffPremise(false);
        setDismissed(false);
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

  // Countdown timer when off-premise
  useEffect(() => {
    if (offPremise && !dismissed) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // Time's up — auto-logout
            if (countdownRef.current) clearInterval(countdownRef.current);
            onLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [offPremise, dismissed, onLogout]);

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

  const handleDismiss = () => setDismissed(true);

  return (
    <>
      {children}

      {/* Off-premise warning banner */}
      {offPremise && !dismissed && (
        <div className="fixed bottom-0 left-0 right-0 z-[100] animate-slide-up">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-2xl">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  You are off premises — {premises.label}
                </p>
                <p className="text-xs opacity-90 mt-0.5">
                  {distance !== null && `${(distance / 1000).toFixed(1)} km away — `}
                  Please return within school premises. Auto-logout in{" "}
                  <span className="font-mono font-bold">{formatTime(countdown)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-md transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-orange-600 hover:bg-orange-50 rounded-md transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtle indicator when on-premise (optional — small dot in corner) */}
      {distance !== null && !offPremise && (
        <div className="fixed bottom-3 right-3 z-[90]" title={`On premises — ${distance}m from center`}>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded-full text-[10px] text-green-700 font-medium">
            <MapPin className="h-3 w-3" />
            On Premises
          </div>
        </div>
      )}
    </>
  );
}
