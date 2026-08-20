"use client";

// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Shared Loading Components
// Consistent loading states across the application.
// ═══════════════════════════════════════════════════════════════

// ─── Full Section Loading ────────────────────────────────────
export function LoadingSpinner({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-rcc-primary border-t-transparent" />
      <p className="text-sm text-rcc-text-muted">{message}</p>
    </div>
  );
}

// ─── Inline Table Loading ────────────────────────────────────
export function TableLoading({ colSpan, message = "Loading..." }: { colSpan: number; message?: string }) {
  return (
    <td colSpan={colSpan} className="px-4 py-10 text-center text-rcc-text-muted">
      <div className="flex items-center justify-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-rcc-primary border-t-transparent" />
        <span>{message}</span>
      </div>
    </td>
  );
}

// ─── Card Loading ────────────────────────────────────────────
export function CardLoading({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="bg-rcc-surface rounded-lg border border-rcc-border p-8 text-center text-sm text-rcc-text-muted">
      <div className="flex items-center justify-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-rcc-primary border-t-transparent" />
        <span>{message}</span>
      </div>
    </div>
  );
}
