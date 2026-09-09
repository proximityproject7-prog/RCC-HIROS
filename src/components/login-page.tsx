"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import { Eye, EyeOff, LogIn, AlertCircle, Lock, Clock } from "lucide-react";
import { useAuthContext } from "@/components/providers/auth-provider";

export default function LoginPage() {
  const { login } = useAuthContext();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      // AuthProvider will update the state automatically
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-rcc-bg p-4 sm:p-6 relative overflow-hidden">
      {/* Campus background image — subtle */}
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
        </div>

        <p className="text-xs font-medium text-rcc-text-muted text-center mt-6">
          Republic Central Colleges &middot; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
