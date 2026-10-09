"use client";

// ═══════════════════════════════════════════════════════════════
// FPAS Export Hub — lives inside FPAS Configuration (fpas.manage
// only). Pick a school year + department, tick employees (badges
// show who submitted), Export builds one template-faithful print
// document per submitted member for Save-as-PDF.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, CheckSquare, Download, Printer, Search, Square,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { FpasPrintDocument } from "@/components/fpas/fpas-print";
import type { FpasFormData, GroupBrief } from "@/components/fpas/fpas-pages";

export interface ExportDoc {
  key: string;
  name: string;
  employeeCode: string;
  department: string;
  formData: FpasFormData;
  totalPoints: number;
}

interface StatusEmployee {
  employeeId: string;
  name: string;
  group: { id: string; name: string; code: string } | null;
  roleName: string | null;
  submission: { id: string; totalPoints: number } | null;
  hasSubmission: boolean;
}

function currentSY(): string {
  const y = new Date().getFullYear();
  return `${y}-${y + 1}`;
}

export function FpasExportHub({ groups, onPreviewChange }: { groups: GroupBrief[]; onPreviewChange?: (open: boolean) => void }) {
  const [schoolYear, setSchoolYear] = useState(currentSY());
  const [deptId, setDeptId] = useState<string>("ALL");
  const [employees, setEmployees] = useState<StatusEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"selected" | "submitted">("selected");
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<ExportDoc[] | null>(null);
  const [skipped, setSkipped] = useState(0);

  // Load per-employee submission status for the chosen school year.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<{ employees: StatusEmployee[] }>(
          `/api/fpas/status?schoolYear=${encodeURIComponent(schoolYear)}`
        );
        if (cancelled) return;
        setEmployees(data.employees ?? []);
        setChecked(new Set());
        setDocs(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load employees.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolYear]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (deptId !== "ALL" && e.group?.id !== deptId) return false;
      if (!q) return true;
      return `${e.name} ${e.employeeId}`.toLowerCase().includes(q);
    });
  }, [employees, deptId, search]);

  const submittedVisible = useMemo(
    () => visible.filter((e) => e.hasSubmission && e.submission),
    [visible]
  );

  const allChecked = visible.length > 0 && visible.every((e) => checked.has(e.employeeId));

  const toggleCheck = (code: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleCheckAll = () => {
    if (allChecked) {
      setChecked((prev) => {
        const next = new Set(prev);
        for (const e of visible) next.delete(e.employeeId);
        return next;
      });
    } else {
      setChecked((prev) => {
        const next = new Set(prev);
        for (const e of visible) next.add(e.employeeId);
        return next;
      });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const targets =
        scope === "submitted"
          ? submittedVisible
          : visible.filter((e) => checked.has(e.employeeId) && e.hasSubmission && e.submission);
      if (targets.length === 0) {
        setError(
          scope === "submitted"
            ? "No submitted FPAS forms in this department for the selected school year."
            : "Tick at least one employee with a submitted form."
        );
        return;
      }
      const pickedCount =
        scope === "submitted"
          ? targets.length
          : visible.filter((e) => checked.has(e.employeeId)).length;
      const built: ExportDoc[] = [];
      for (const e of targets) {
        const data = await apiFetch<{ submission: { formData: string; totalPoints: number } }>(
          `/api/fpas/${e.submission!.id}`
        );
        built.push({
          key: e.submission!.id,
          name: e.name,
          employeeCode: e.employeeId,
          department: e.group?.name ?? "Unassigned",
          formData: JSON.parse(data.submission.formData) as FpasFormData,
          totalPoints: data.submission.totalPoints,
        });
      }
      setSkipped(pickedCount - built.length);
      setDocs(built);
      onPreviewChange?.(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  // ── Preview mode: documents only (paper-clean) ──
  if (docs) {
    return (
      <div className="space-y-4">
        <div className="no-print flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => { setDocs(null); onPreviewChange?.(false); }}
            className="inline-flex items-center gap-1 text-sm text-rcc-text-secondary hover:text-rcc-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to export options
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-rcc-text-muted">
              {docs.length} document(s) · S.Y. {schoolYear}
              {skipped > 0 ? ` · ${skipped} ticked without a submission were skipped` : ""}
              {scope === "submitted" ? " · tip: use your browser's Save-as-PDF once per member for per-member files" : ""}
            </span>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors"
            >
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </button>
          </div>
        </div>
        {docs.map((d, i) => (
          <div
            key={d.key}
            className="bg-white rounded-lg border border-rcc-border p-6 print:border-0 print:rounded-none print:p-0"
            style={i < docs.length - 1 ? { breakAfter: "page" } : undefined}
          >
            <FpasPrintDocument formData={d.formData} schoolYear={schoolYear} />
          </div>
        ))}
      </div>
    );
  }

  // ── Picker mode ──
  return (
    <div className="bg-rcc-surface rounded-lg border border-rcc-border">
      <div className="px-4 py-3 border-b border-rcc-border flex items-center justify-between gap-4 flex-wrap">
        <span className="text-sm font-semibold text-rcc-text-primary">
          Submission Exports
          <span className="ml-2 text-xs font-normal text-rcc-text-muted">
            one printable form per submitted member
          </span>
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            placeholder="e.g., 2026-2027"
            title="School year"
            className="w-28 px-2 py-1.5 bg-rcc-bg border border-rcc-border rounded-md text-xs text-rcc-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
          />
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            title="Department"
            className="px-2 py-1.5 bg-rcc-bg border border-rcc-border rounded-md text-xs text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
          >
            <option value="ALL">All departments</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.code})</option>
            ))}
          </select>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "selected" | "submitted")}
            title="Export scope"
            className="px-2 py-1.5 bg-rcc-bg border border-rcc-border rounded-md text-xs text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
          >
            <option value="selected">Ticked employees</option>
            <option value="submitted">All submitted in department</option>
          </select>
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Building..." : "Export"}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-rcc-error">{error}</div>
        )}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-rcc-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="w-full pl-8 pr-3 py-1.5 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40"
            />
          </div>
          <button
            onClick={toggleCheckAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors"
          >
            {allChecked ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            {allChecked ? "Uncheck all" : "Check all"}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-rcc-text-muted py-4 text-center">Loading employees…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-rcc-text-muted py-4 text-center">No employees match.</p>
        ) : (
          <div className="max-h-72 overflow-auto divide-y divide-rcc-border border border-rcc-border rounded-md">
            {visible.map((e) => (
              <label
                key={e.employeeId}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-rcc-bg/30 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={checked.has(e.employeeId)}
                  onChange={() => toggleCheck(e.employeeId)}
                  className="h-4 w-4 rounded border-rcc-border text-rcc-accent focus:ring-rcc-accent/40"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-rcc-text-primary truncate">{e.name}</p>
                  <p className="text-xs text-rcc-text-muted font-mono truncate">
                    {e.employeeId} · {e.group?.code ?? "—"} · {e.roleName ?? "—"}
                  </p>
                </div>
                {e.hasSubmission ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">
                    Submitted{e.submission ? ` · ${Number(e.submission.totalPoints).toFixed(1)}` : ""}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rcc-bg text-rcc-text-muted border border-rcc-border whitespace-nowrap">
                    Not submitted
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-rcc-text-muted">
          {submittedVisible.length} of {visible.length} listed submitted for S.Y. {schoolYear}.
          Members without a submission are skipped at export.
        </p>
      </div>
    </div>
  );
}
