"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import { Eye, EyeOff, KeyRound, AlertCircle, Check } from "lucide-react";
import { useAuthContext } from "@/components/providers/auth-provider";

export default function ChangePasswordModal() {
  const { logout } = useAuthContext();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(pw)) return "Password must contain at least 1 uppercase letter.";
    if (!/[0-9]/.test(pw)) return "Password must contain at least 1 number.";
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    const pwError = validatePassword(newPassword);
    if (pwError) {
      setError(pwError);
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from current password.");
      return;
    }

    setIsLoading(true);

    try {
      const token = localStorage.getItem("hiros_token");
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to change password.");
        return;
      }

      setSuccess(true);
      // After 2 seconds, log out
      setTimeout(() => {
        logout();
      }, 2000);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-rcc-bg p-4">
        <div className="w-full max-w-md bg-rcc-surface rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-rcc-text-primary mb-2">Password Changed!</h2>
          <p className="text-sm text-rcc-text-muted">You will be redirected to the login page shortly...</p>
        </div>
      </div>
    );
  }

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
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 mb-3">
              <Image
                src="/hiros-logo-login.png"
                alt="RCC-HIROS"
                width={80}
                height={80}
                className="object-contain w-full h-full"
                priority
              />
            </div>
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-2">
              <KeyRound className="h-6 w-6 text-amber-600" />
            </div>
            <h1 className="text-lg font-semibold text-rcc-text-primary">Change Your Password</h1>
            <p className="text-sm text-rcc-text-muted mt-1">
              This is your first login. Please set a new password.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 rounded-md p-3">
              <AlertCircle className="h-4 w-4 text-rcc-error shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-rcc-error">{error}</p>
            </div>
          )}

          {/* Password Requirements */}
          <div className="mb-5 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs font-medium text-blue-800 mb-1">Password Requirements:</p>
            <ul className="text-xs text-blue-700 space-y-0.5">
              <li>• At least 8 characters</li>
              <li>• At least 1 uppercase letter</li>
              <li>• At least 1 number</li>
            </ul>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold block text-rcc-text-secondary">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); if (error) setError(null); }}
                  className="w-full px-3 pr-10 rounded-md border border-rcc-border bg-rcc-bg text-sm text-rcc-text-primary placeholder:text-rcc-text-muted focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
                  placeholder="Enter current password"
                  required
                />
                <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-rcc-text-muted hover:text-rcc-text-secondary">
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold block text-rcc-text-secondary">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); if (error) setError(null); }}
                  className="w-full px-3 pr-10 rounded-md border border-rcc-border bg-rcc-bg text-sm text-rcc-text-primary placeholder:text-rcc-text-muted focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
                  placeholder="Enter new password"
                  required
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-rcc-text-muted hover:text-rcc-text-secondary">
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold block text-rcc-text-secondary">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (error) setError(null); }}
                  className="w-full px-3 pr-10 rounded-md border border-rcc-border bg-rcc-bg text-sm text-rcc-text-primary placeholder:text-rcc-text-muted focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
                  placeholder="Confirm new password"
                  required
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-rcc-text-muted hover:text-rcc-text-secondary">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-rcc-primary hover:bg-rcc-primary/90 text-rcc-primary-foreground text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Changing Password...
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" />
                  Change Password
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
