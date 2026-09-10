"use client";

import { useState, FormEvent, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Eye, EyeOff, LogIn, AlertCircle, Lock, Clock, Fingerprint, User } from "lucide-react";
import { useAuthContext } from "@/components/providers/auth-provider";
import {
  startAuthentication,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/browser";

// ═══════════════════════════════════════════════════════════════
// Login page with optional fingerprint panel (right side).
// Uses WebAuthn API (Windows Hello) for kiosk fingerprint clock-in.
// ═══════════════════════════════════════════════════════════════

interface FPResult {
  action?: string;
  message?: string;
  employee?: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    photoPath: string | null;
  };
  attendance?: {
    clockInAt?: string;
    clockOutAt?: string;
  };
  error?: string;
}

type PanelState = "idle" | "scanning" | "result" | "error";

export default function LoginPage() {
  const { login } = useAuthContext();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fingerprint panel state
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [fpResult, setFpResult] = useState<FPResult | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanCooldownRef = useRef(false);

  // Check biometrics setting
  useEffect(() => {
    async function checkBiometrics() {
      try {
        const res = await fetch("/api/settings/biometrics");
        const data = await res.json();
        setBiometricsEnabled(data.enabled);
      } catch {
        // Biometrics unavailable
      }
    }
    checkBiometrics();

    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleFPResult = useCallback((data: FPResult) => {
    if (scanCooldownRef.current) return;
    scanCooldownRef.current = true;

    setFpResult(data);
    setPanelState(data.error ? "error" : "result");

    // Auto-reset after 5 seconds
    resetTimerRef.current = setTimeout(() => {
      setPanelState("idle");
      setFpResult(null);
      scanCooldownRef.current = false;
    }, 5000);
  }, []);

  const handleFingerprintScan = async () => {
    if (scanCooldownRef.current) return;

    setPanelState("scanning");
    setFpResult(null);

    try {
      // Step 1: Get authentication options from server
      const optionsRes = await fetch("/api/biometric/webauthn/authenticate/options", {
        method: "POST",
      });

      if (!optionsRes.ok) {
        throw new Error("Failed to get authentication options");
      }

      const options = await optionsRes.json();

      // Step 2: Trigger browser's WebAuthn API (Windows Hello)
      const authResponse = await startAuthentication({
        optionsJSON: options,
      });

      // Step 3: Verify authentication with server
      const verifyRes = await fetch("/api/biometric/webauthn/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: authResponse }),
      });

      const result = await verifyRes.json();

      if (!verifyRes.ok) {
        handleFPResult({ error: result.error || "Authentication failed" });
      } else {
        handleFPResult(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scan failed";
      if (msg.includes("cancelled")) {
        handleFPResult({ error: "Scan cancelled" });
      } else if (msg.includes("not allowed")) {
        handleFPResult({ error: "Not allowed" });
      } else {
        handleFPResult({ error: msg });
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim() || !password.trim()) {
      setError("Please enter your Employee ID or Email and password.");
      return;
    }

    setIsLoading(true);

    try {
      await login(identifier.trim(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      if (msg.includes("locked") || msg.includes("Locked")) {
        setError("Your account has been locked. Please contact IT Support.");
      } else if (msg.includes("inactive") || msg.includes("Inactive")) {
        setError("Your account is inactive. Please contact HR.");
      } else {
        setError("Invalid Employee ID/Email or password.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getErrorIcon = () => {
    if (error?.includes("locked")) return <Lock className="h-4 w-4 shrink-0" />;
    if (error?.includes("expired")) return <Clock className="h-4 w-4 shrink-0" />;
    return <AlertCircle className="h-4 w-4 shrink-0" />;
  };

  const showFingerprintPanel = biometricsEnabled;

  // Fingerprint panel content
  const renderFingerprintPanel = () => {
    if (panelState === "result" && fpResult?.employee) {
      const emp = fpResult.employee;
      const photoUrl = emp.photoPath
        ? `/api/employees/${emp.id}/photo?t=${Date.now()}`
        : null;
      return (
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
          <div className="w-28 h-28 rounded-full overflow-hidden bg-rcc-bg border-2 border-rcc-accent">
            {photoUrl ? (
              <img src={photoUrl} alt={`${emp.firstName} ${emp.lastName}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-rcc-text-muted">
                <User className="h-14 w-14" />
              </div>
            )}
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-rcc-text-primary">{emp.firstName} {emp.lastName}</p>
            <p className="text-sm text-rcc-text-secondary">{emp.employeeId}</p>
          </div>
          <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
            fpResult.action === "clock_in"
              ? "bg-green-100 text-green-700"
              : fpResult.action === "clock_out"
                ? "bg-blue-100 text-blue-700"
                : "bg-amber-100 text-amber-700"
          }`}>
            {fpResult.message}
          </div>
        </div>
      );
    }

    if (panelState === "error") {
      return (
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
          <div className="w-28 h-28 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center">
            <AlertCircle className="h-14 w-14 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-rcc-text-primary">Fingerprint not recognized</p>
            <p className="text-sm text-rcc-text-secondary mt-1">{fpResult?.error || "Please try again"}</p>
          </div>
        </div>
      );
    }

    // Idle / scanning state
    return (
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={handleFingerprintScan}
          disabled={panelState === "scanning"}
          className={`w-28 h-28 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer hover:scale-105 ${
            panelState === "scanning"
              ? "border-rcc-accent bg-rcc-accent/10 animate-pulse"
              : "border-rcc-border bg-rcc-bg hover:border-rcc-accent"
          }`}
        >
          <Fingerprint className={`h-14 w-14 transition-colors ${
            panelState === "scanning" ? "text-rcc-accent" : "text-rcc-text-muted"
          }`} />
        </button>
        <div className="text-center">
          <p className="text-lg font-semibold text-rcc-text-primary">
            {panelState === "scanning" ? "Scanning..." : "Tap to scan"}
          </p>
          <p className="text-sm text-rcc-text-secondary mt-1">
            {panelState === "scanning"
              ? "Follow Windows Hello prompts"
              : "Place your finger on the reader"}
          </p>
        </div>
      </div>
    );
  };

  // ─── Single-column layout (no fingerprint) ───
  if (!showFingerprintPanel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-rcc-bg p-4 sm:p-6 relative overflow-hidden">
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(/rcc-bg-campus.png)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            opacity: 0.08,
          }}
        />
        <div className="w-full max-w-md relative z-10">
          <div className="bg-rcc-surface/95 backdrop-blur-sm rounded-lg shadow-lg p-8 sm:p-10">
            <LoginFormContent
              identifier={identifier}
              setIdentifier={setIdentifier}
              password={password}
              setPassword={setPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              error={error}
              setError={setError}
              getErrorIcon={getErrorIcon}
              isLoading={isLoading}
              handleSubmit={handleSubmit}
            />
          </div>
          <p className="text-xs font-medium text-rcc-text-muted text-center mt-6">
            Republic Central Colleges &middot; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    );
  }

  // ─── Two-column layout (with fingerprint panel) ───
  return (
    <div className="min-h-screen flex items-center justify-center bg-rcc-bg p-4 sm:p-6 relative overflow-hidden">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(/rcc-bg-campus.png)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: 0.08,
        }}
      />
      <div className="w-full max-w-4xl relative z-10 flex flex-col md:flex-row gap-6">
        {/* Left: Login Form */}
        <div className="flex-1">
          <div className="bg-rcc-surface/95 backdrop-blur-sm rounded-lg shadow-lg p-8 sm:p-10">
            <LoginFormContent
              identifier={identifier}
              setIdentifier={setIdentifier}
              password={password}
              setPassword={setPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              error={error}
              setError={setError}
              getErrorIcon={getErrorIcon}
              isLoading={isLoading}
              handleSubmit={handleSubmit}
            />
          </div>
        </div>

        {/* Right: Fingerprint Panel */}
        <div className="flex-1">
          <div className="bg-rcc-surface/95 backdrop-blur-sm rounded-lg shadow-lg p-8 sm:p-10 h-full flex flex-col items-center justify-center min-h-[420px]">
            {renderFingerprintPanel()}
          </div>
        </div>
      </div>

      <p className="text-xs font-medium text-rcc-text-muted text-center mt-6 absolute bottom-4 left-0 right-0">
        Republic Central Colleges &middot; {new Date().getFullYear()}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared login form content (used in both layouts)
// ═══════════════════════════════════════════════════════════════

function LoginFormContent({
  identifier, setIdentifier,
  password, setPassword,
  showPassword, setShowPassword,
  error, setError, getErrorIcon,
  isLoading, handleSubmit,
}: {
  identifier: string;
  setIdentifier: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
  getErrorIcon: () => React.ReactNode;
  isLoading: boolean;
  handleSubmit: (e: FormEvent) => void;
}) {
  return (
    <>
      {/* RCC HIROS Branding */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-40 h-40 mb-3">
          <Image
            src="/hiros-logo-login.png"
            alt="RCC-HIROS"
            width={160}
            height={160}
            className="object-contain w-full h-full"
            priority
          />
        </div>
        <p className="text-sm font-medium text-rcc-text-secondary">
          Human Integrated Resource Operations System
        </p>
        <p className="text-xs font-medium text-rcc-text-muted mt-0.5">
          Republic Central Colleges
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-md p-3">
          <div className="text-rcc-error mt-0.5">
            {getErrorIcon()}
          </div>
          <div>
            <p className="text-sm font-medium text-rcc-error">{error}</p>
            {error.includes("locked") && (
              <p className="text-xs text-rcc-error/70 mt-1">
                Contact IT Support at ext. 101 or visit the IT Department.
              </p>
            )}
            {error.includes("inactive") && (
              <p className="text-xs text-rcc-error/70 mt-1">
                Visit the HR Department to reactivate your account.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="identifier" className="text-xs font-semibold block text-rcc-text-secondary">
            Employee ID or Email
          </label>
          <input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              if (error) setError(null);
            }}
            placeholder="username@rcc.edu.ph"
            className="w-full px-4 py-2.5 rounded-md border-2 border-rcc-border bg-rcc-bg text-sm font-medium text-rcc-text-primary placeholder:text-rcc-text-muted focus:outline-none focus:ring-2 focus:ring-rcc-accent/40 transition-colors"
            autoComplete="username"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold block text-rcc-text-secondary">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter your password"
              className="w-full px-4 py-2.5 pr-11 rounded-md border-2 border-rcc-border bg-rcc-bg text-sm font-medium text-rcc-text-primary placeholder:text-rcc-text-muted focus:outline-none focus:ring-2 focus:ring-rcc-accent/40 transition-colors"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-rcc-text-muted hover:text-rcc-text-secondary transition-colors"
              tabIndex={0}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-11 bg-rcc-primary hover:bg-rcc-primary/90 text-rcc-primary-foreground text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Signing in...
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Sign In
            </>
          )}
        </button>
      </form>

      <p className="text-xs font-medium text-rcc-text-muted text-center mt-6">
        Access is restricted to RCC employees only.{" "}
        <br className="sm:hidden" />
        Role is assigned by system administrator.
      </p>
    </>
  );
}
