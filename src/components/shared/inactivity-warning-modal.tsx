"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, LogOut, RefreshCw } from "lucide-react";

interface InactivityWarningModalProps {
  /** When true, the modal is visible and the 60-second countdown starts. */
  open: boolean;
  /** Called when user clicks "Stay logged in" — caller should reset the inactivity timer. */
  onStayLoggedIn: () => void;
  /** Called when user clicks "Log out now" — caller should immediately log the user out. */
  onLogoutNow: () => void;
  /** Called automatically when the countdown hits 0 — caller should log the user out. */
  onTimeout: () => void;
  /** Countdown duration in seconds (default 60). */
  countdownSeconds?: number;
}

/**
 * Modal shown 1 minute before the 10-minute inactivity auto-logout fires.
 * Gives the user a chance to extend their session with one click.
 */
export default function InactivityWarningModal({
  open,
  onStayLoggedIn,
  onLogoutNow,
  onTimeout,
  countdownSeconds = 60,
}: InactivityWarningModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);

  // Reset countdown when modal opens
  useEffect(() => {
    if (open) {
      setSecondsLeft(countdownSeconds);
    }
  }, [open, countdownSeconds]);

  // Tick down every second while modal is open
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [open, onTimeout]);

  const handleStayLoggedIn = useCallback(() => {
    onStayLoggedIn();
  }, [onStayLoggedIn]);

  const handleLogoutNow = useCallback(() => {
    onLogoutNow();
  }, [onLogoutNow]);

  if (!open) return null;

  // Progress ring: shows time remaining out of countdownSeconds
  const progress = secondsLeft / countdownSeconds;
  const circumference = 2 * Math.PI * 36; // radius=36 → circumference ≈ 226
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-warning-title"
    >
      <div className="bg-rcc-surface rounded-lg shadow-xl w-full max-w-sm p-6 sm:p-8">
        {/* Icon with countdown ring */}
        <div className="flex justify-center mb-5">
          <div className="relative h-20 w-20">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
              {/* Background circle */}
              <circle
                cx="40"
                cy="40"
                r="36"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-rcc-text-muted/20"
              />
              {/* Progress circle (counts down) */}
              <circle
                cx="40"
                cy="40"
                r="36"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className={
                  secondsLeft <= 10
                    ? "text-rcc-error transition-all duration-1000 ease-linear"
                    : "text-rcc-warning transition-all duration-1000 ease-linear"
                }
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Clock
                className={
                  secondsLeft <= 10
                    ? "h-7 w-7 text-rcc-error"
                    : "h-7 w-7 text-rcc-warning"
                }
              />
            </div>
          </div>
        </div>

        {/* Title and message */}
        <h2
          id="inactivity-warning-title"
          className="text-lg font-semibold text-rcc-text-primary text-center mb-2"
        >
          Are you still there?
        </h2>
        <p className="text-sm text-rcc-text-secondary text-center mb-1">
          For your security, you will be automatically logged out in
        </p>
        <p className="text-2xl font-bold text-center mb-1">
          <span
            className={
              secondsLeft <= 10 ? "text-rcc-error" : "text-rcc-warning"
            }
          >
            {Math.floor(secondsLeft / 60)}:
            {(secondsLeft % 60).toString().padStart(2, "0")}
          </span>
        </p>
        <p className="text-xs text-rcc-text-muted text-center mb-6">
          due to inactivity
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleStayLoggedIn}
            className="w-full flex items-center justify-center gap-2 bg-rcc-primary hover:bg-rcc-primary/90 text-rcc-primary-foreground font-medium px-4 py-2.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-rcc-primary/40"
            autoFocus
          >
            <RefreshCw className="h-4 w-4" />
            Stay logged in
          </button>
          <button
            onClick={handleLogoutNow}
            className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-red-50 text-rcc-error border border-rcc-error/30 font-medium px-4 py-2.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-rcc-error/30"
          >
            <LogOut className="h-4 w-4" />
            Log out now
          </button>
        </div>
      </div>
    </div>
  );
}
