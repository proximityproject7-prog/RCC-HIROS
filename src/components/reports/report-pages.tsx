"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Search, Download, Users, Building2, TrendingUp, Calendar,
  Clock, ChevronDown, ChevronRight, Check, X, Filter, Mail, Phone,
  MapPin, Briefcase,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { usePermissions } from "@/hooks/use-permissions";
import {
  usePagination,
  PaginationControls,
} from "@/components/shared/table-pagination-v2";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface GroupBrief { id: string; name: string; code: string; employeeCount?: number; }

interface RoleBrief { id: string; name: string; }

type ReportType = "all" | "headcount" | "attendance";
type TimeOfDay = "all" | "morning" | "afternoon";

interface UnifiedRow {
  employeeId: string;
  name: string;
  groupName: string;
  groupCode: string;
  roleName: string;
  email: string;
  gender: string | null;
  contractType: string;
  hireDate: string | null;
  certificates: number;
  clockedIn: number;
  clockedOut: number;
  noClockIn: number;
  manuallyEdited: number;
  totalRecords: number;
}

const inputClass =
  "w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════════
// Multi-Select Groups Popover
// ═══════════════════════════════════════════════════════════════

function MultiSelectGroups({
  groups,
  selected,
  onChange,
}: {
  groups: GroupBrief[];
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.code.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (code: string) => {
    onChange(
      selected.includes(code)
        ? selected.filter((c) => c !== code)
        : [...selected, code]
    );
  };

  const selectAll = () => onChange(filtered.map((g) => g.code));
  const clearAll = () => onChange([]);

  const selectedNames = groups
    .filter((g) => selected.includes(g.code))
    .map((g) => g.name);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-left focus:outline-none focus:ring-2 focus:ring-rcc-accent/40 ${
          selected.length === 0 ? "text-rcc-text-muted" : "text-rcc-text-primary"
        }`}
      >
        <span className="truncate">
          {selected.length === 0
            ? "Select groups..."
            : selected.length === groups.length
              ? "All groups"
              : `${selected.length} group(s) selected`}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[260px] bg-rcc-surface border border-rcc-border rounded-lg shadow-lg">
          <div className="p-2 border-b border-rcc-border">
            <input
              type="text"
              placeholder="Search groups..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-rcc-border">
            <button onClick={selectAll} className="text-xs text-rcc-accent hover:underline">
              Select all
            </button>
            <button onClick={clearAll} className="text-xs text-rcc-text-muted hover:underline">
              Clear
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-sm text-rcc-text-muted text-center">No groups found.</p>
            ) : (
              filtered.map((g) => (
                <label
                  key={g.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-rcc-bg/50 transition-colors"
                >
                  <Checkbox
                    checked={selected.includes(g.code)}
                    onCheckedChange={() => toggle(g.code)}
                  />
                  <span className="text-sm text-rcc-text-primary flex-1 truncate">{g.name}</span>
                  <span className="text-[10px] font-mono text-rcc-text-muted">{g.code}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {selected.length > 0 && selected.length < groups.length && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selectedNames.map((name) => (
            <Badge key={name} variant="secondary" className="text-[10px] gap-1 pr-1">
              {name}
              <button
                type="button"
                onClick={() => {
                  const code = groups.find((g) => g.name === name)?.code;
                  if (code) toggle(code);
                }}
                className="ml-0.5 hover:text-rcc-error"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ReportsPage — Unified table with required filters
// ═══════════════════════════════════════════════════════════════

export function ReportsPage() {
  const { has } = usePermissions();
  const canExport = has("reports.export");

  // ─── Required filters ───
  const [reportType, setReportType] = useState<ReportType | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | "">("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  // ─── Additive filters ───
  const [selectedRole, setSelectedRole] = useState("");
  const [searchName, setSearchName] = useState("");

  // ─── Data ───
  const [groups, setGroups] = useState<GroupBrief[]>([]);
  const [roles, setRoles] = useState<RoleBrief[]>([]);
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Load groups and roles once
  useEffect(() => {
    (async () => {
      try {
        const [g, r] = await Promise.all([
          apiFetch<{ groups: GroupBrief[] }>("/api/groups"),
          apiFetch<{ roles: RoleBrief[] }>("/api/roles/active"),
        ]);
        setGroups(g.groups ?? []);
        setRoles(r.roles ?? []);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  const allRequiredFilled =
    reportType !== "" &&
    dateFrom !== "" &&
    dateTo !== "" &&
    timeOfDay !== "" &&
    selectedGroups.length > 0;

  // ─── Fetch & merge data when all required filters are filled ───
  const fetchReport = useCallback(async () => {
    if (!allRequiredFilled) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const merged = new Map<string, UnifiedRow>();

      const fetchHeadcount = async (groupCode: string, rid?: string) => {
        const grp = groups.find((g) => g.code === groupCode);

        if (rid) {
          const params = new URLSearchParams({ groupCode, roleId: rid });
          const data = await apiFetch<{ employees: { id: string; employeeId: string; firstName: string; middleName: string | null; lastName: string; email: string; gender: string | null; contractType: string; hireDate: string | null; active: boolean; roleName: string | null; certificateCount: number }[] }>(
            `/api/reports/headcount?${params.toString()}`
          );
          for (const e of data.employees ?? []) {
            const hcFields = {
              employeeId: e.employeeId,
              name: `${e.firstName} ${e.middleName ? e.middleName + " " : ""}${e.lastName}`,
              groupName: grp?.name ?? groupCode,
              groupCode,
              roleName: e.roleName ?? "",
              email: e.email,
              gender: e.gender,
              contractType: e.contractType,
              hireDate: e.hireDate,
              certificates: e.certificateCount,
            };
            const existing = merged.get(e.employeeId);
            if (existing) {
              Object.assign(existing, hcFields);
            } else {
              merged.set(e.employeeId, { ...hcFields, clockedIn: 0, clockedOut: 0, noClockIn: 0, manuallyEdited: 0, totalRecords: 0 });
            }
          }
        } else {
          const rolesData = await apiFetch<{ roles: { roleId: string; roleName: string }[] }>(
            `/api/reports/headcount?groupCode=${encodeURIComponent(groupCode)}`
          );
          const roleFetches = (rolesData.roles ?? []).map(async (r) => {
            const empParams = new URLSearchParams({ groupCode, roleId: r.roleId });
            const empData = await apiFetch<{ employees: { id: string; employeeId: string; firstName: string; middleName: string | null; lastName: string; email: string; gender: string | null; contractType: string; hireDate: string | null; active: boolean; roleName: string | null; certificateCount: number }[] }>(
              `/api/reports/headcount?${empParams.toString()}`
            );
            for (const e of empData.employees ?? []) {
              const hcFields = {
                employeeId: e.employeeId,
                name: `${e.firstName} ${e.middleName ? e.middleName + " " : ""}${e.lastName}`,
                groupName: grp?.name ?? groupCode,
                groupCode,
                roleName: e.roleName ?? r.roleName ?? "",
                email: e.email,
                gender: e.gender,
                contractType: e.contractType,
                hireDate: e.hireDate,
                certificates: e.certificateCount,
              };
              const existing = merged.get(e.employeeId);
              if (existing) {
                Object.assign(existing, hcFields);
              } else {
                merged.set(e.employeeId, { ...hcFields, clockedIn: 0, clockedOut: 0, noClockIn: 0, manuallyEdited: 0, totalRecords: 0 });
              }
            }
          });
          await Promise.all(roleFetches);
        }
      };

      const fetchAttendance = async (groupCode: string) => {
        const params = new URLSearchParams({ dateFrom, dateTo, groupCode });
        const data = await apiFetch<{ byEmployee?: { employeeId: string; name: string; total: number; clockedIn: number; clockedOut: number; noClockIn: number; manuallyEdited: number }[] }>(
          `/api/reports/attendance?${params.toString()}`
        );
        const grp = groups.find((g) => g.code === groupCode);
        for (const e of data.byEmployee ?? []) {
          const existing = merged.get(e.employeeId);
          if (existing) {
            existing.clockedIn = e.clockedIn;
            existing.clockedOut = e.clockedOut;
            existing.noClockIn = e.noClockIn;
            existing.manuallyEdited = e.manuallyEdited;
            existing.totalRecords = e.total;
          } else {
            merged.set(e.employeeId, {
              employeeId: e.employeeId,
              name: e.name,
              groupName: grp?.name ?? groupCode,
              groupCode,
              roleName: "",
              email: "",
              gender: null,
              contractType: "",
              hireDate: null,
              certificates: 0,
              clockedIn: e.clockedIn,
              clockedOut: e.clockedOut,
              noClockIn: e.noClockIn,
              manuallyEdited: e.manuallyEdited,
              totalRecords: e.total,
            });
          }
        }
      };

      // Always fetch headcount (for role/profile data) + attendance in parallel
      await Promise.all(
        selectedGroups.map(async (gc) => {
          await Promise.all([
            fetchHeadcount(gc, selectedRole || undefined),
            fetchAttendance(gc),
          ]);
        })
      );

      setRows(Array.from(merged.values()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [allRequiredFilled, dateFrom, dateTo, timeOfDay, selectedGroups, selectedRole, groups]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // ─── Apply additive filters (search by name, role) ───
  const filteredRows = useMemo(() => {
    let result = rows;
    if (selectedRole) {
      const role = roles.find((r) => r.id === selectedRole);
      if (role) {
        result = result.filter((r) => r.roleName === role.name);
      }
    }
    if (searchName.trim()) {
      const q = searchName.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.employeeId.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, selectedRole, searchName, roles]);

  // ─── Pagination ───
  const { currentData: pagedRows, controls } = usePagination(filteredRows, { defaultPageSize: 25 });

  // ─── Column visibility based on report type ───
  const showAttendance = reportType === "all" || reportType === "attendance";
  const showHeadcount = reportType === "all" || reportType === "headcount";

  // ─── CSV Export ───
  const handleExportCSV = () => {
    const headers: string[] = ["Employee ID", "Name", "Group", "Role"];
    if (showHeadcount) headers.push("Gender", "Contract", "Hire Date", "Certificates");
    if (showAttendance) headers.push("Total Records", "Clocked In", "Clocked Out", "No Clock-In", "Manual Edits");

    const csvRows = [headers];
    for (const r of filteredRows) {
      const row: string[] = [r.employeeId, r.name, r.groupName, r.roleName];
      if (showHeadcount) row.push(r.gender ?? "", r.contractType, r.hireDate ?? "", String(r.certificates));
      if (showAttendance) row.push(String(r.totalRecords), String(r.clockedIn), String(r.clockedOut), String(r.noClockIn), String(r.manuallyEdited));
      csvRows.push(row);
    }

    const csv = csvRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${reportType}-${dateFrom}-to-${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ─── Summary cards ───
  const summary = useMemo(() => {
    const total = filteredRows.length;
    const male = filteredRows.filter((r) => r.gender === "Male").length;
    const female = filteredRows.filter((r) => r.gender === "Female").length;
    const totalCerts = filteredRows.reduce((acc, r) => acc + r.certificates, 0);
    const totalPresent = filteredRows.reduce((acc, r) => acc + r.clockedIn, 0);
    return { total, male, female, totalCerts, totalPresent };
  }, [filteredRows]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-rcc-text-primary">Reports</h1>
        <p className="text-sm text-rcc-text-muted mt-0.5">
          Generate unified headcount and attendance reports.
        </p>
      </div>

      {/* ─── Required Filters ─── */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="h-4 w-4 text-rcc-accent" />
          <span className="text-xs font-semibold text-rcc-text-secondary uppercase tracking-wide">Required Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Report Type */}
          <div>
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">
              Report Type <span className="text-rcc-error">*</span>
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType | "")}
              className={inputClass}
            >
              <option value="">Select type...</option>
              <option value="headcount">Headcount</option>
              <option value="attendance">Attendance</option>
              <option value="all">All (Headcount + Attendance)</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">
              Date From <span className="text-rcc-error">*</span>
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">
              Date To <span className="text-rcc-error">*</span>
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Time of Day */}
          <div>
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">
              Time <span className="text-rcc-error">*</span>
            </label>
            <select
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay | "")}
              className={inputClass}
            >
              <option value="">Select time...</option>
              <option value="all">All Day</option>
              <option value="morning">Morning (6AM – 12PM)</option>
              <option value="afternoon">Afternoon (12PM – 6PM)</option>
            </select>
          </div>

          {/* Groups (multi-select) */}
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">
              Groups <span className="text-rcc-error">*</span>
            </label>
            <MultiSelectGroups
              groups={groups}
              selected={selectedGroups}
              onChange={setSelectedGroups}
            />
          </div>
        </div>
      </div>

      {/* ─── Additive Filters ─── */}
      {allRequiredFilled && (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="h-4 w-4 text-rcc-text-muted" />
            <span className="text-xs font-semibold text-rcc-text-secondary uppercase tracking-wide">Additional Filters</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Role filter */}
            <div>
              <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className={inputClass}
              >
                <option value="">All roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Search by name */}
            <div>
              <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">Search by Name or ID</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-rcc-text-muted" />
                <input
                  type="text"
                  placeholder="Type a name or employee ID..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Error ─── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      {/* ─── Table (only visible when all required filters filled) ─── */}
      {allRequiredFilled && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard icon={Users} label="Total Employees" value={summary.total} />
            {showHeadcount && (
              <>
                <SummaryCard icon={Users} label="Male" value={summary.male} />
                <SummaryCard icon={Users} label="Female" value={summary.female} />
                <SummaryCard icon={TrendingUp} label="Certificates" value={summary.totalCerts} />
              </>
            )}
            {showAttendance && !showHeadcount && (
              <>
                <SummaryCard icon={Clock} label="Clocked In" value={summary.totalPresent} />
                <SummaryCard icon={TrendingUp} label="Total Records" value={filteredRows.reduce((a, r) => a + r.totalRecords, 0)} />
                <SummaryCard icon={Calendar} label="Groups Selected" value={selectedGroups.length} />
              </>
            )}
          </div>

          {/* Table */}
          <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
            <div className="px-4 py-3 border-b border-rcc-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
                {reportType === "headcount" && "Headcount Report"}
                {reportType === "attendance" && "Attendance Report"}
                {reportType === "all" && "Combined Report"}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-rcc-text-muted">
                  {filteredRows.length} record(s)
                </span>
                {canExport && (
                  <button
                    onClick={handleExportCSV}
                    disabled={filteredRows.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-rcc-bg/50 border-b border-rcc-border">
                  <tr>
                    <Th>Employee ID</Th>
                    <Th>Name</Th>
                    <Th>Group</Th>
                    <Th>Role</Th>
                    {showHeadcount && (
                      <>
                        <Th>Gender</Th>
                        <Th>Contract</Th>
                        <Th>Hire Date</Th>
                        <Th className="text-right">Certs</Th>
                      </>
                    )}
                    {showAttendance && (
                      <>
                        <Th className="text-right">Total</Th>
                        <Th className="text-right">In</Th>
                        <Th className="text-right">Out</Th>
                        <Th className="text-right">No Clock-In</Th>
                        <Th className="text-right">Manual</Th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-rcc-border">
                  {loading ? (
                    <tr>
                      <Td colSpan={5 + (showHeadcount ? 4 : 0) + (showAttendance ? 5 : 0)}>
                        Loading report data...
                      </Td>
                    </tr>
                  ) : pagedRows.length === 0 ? (
                    <tr>
                      <Td colSpan={5 + (showHeadcount ? 4 : 0) + (showAttendance ? 5 : 0)}>
                        No records found for the selected filters.
                      </Td>
                    </tr>
                  ) : (
                    pagedRows.flatMap((r) => {
                      const isExpanded = expandedRow === r.employeeId;
                      const totalCols = 5 + (showHeadcount ? 4 : 0) + (showAttendance ? 5 : 0);
                      const rows: React.ReactNode[] = [];

                      // Main row
                      rows.push(
                        <tr
                          key={r.employeeId}
                          onClick={() => setExpandedRow(isExpanded ? null : r.employeeId)}
                          className="hover:bg-rcc-bg/30 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5">
                              <ChevronRight className={`h-3.5 w-3.5 text-rcc-text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                              <span className="font-mono text-xs text-rcc-text-secondary">{r.employeeId}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-rcc-text-primary">{r.name}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rcc-accent/10 text-rcc-accent border border-rcc-accent/20 font-mono">
                              {r.groupCode}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-rcc-text-secondary text-xs">{r.roleName}</td>
                          {showHeadcount && (
                            <>
                              <td className="px-4 py-3 text-rcc-text-secondary">{r.gender ?? ""}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rcc-accent/10 text-rcc-accent border border-rcc-accent/20">
                                  {r.contractType}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-rcc-text-secondary">
                                {r.hireDate ? new Date(r.hireDate).toLocaleDateString() : ""}
                              </td>
                              <td className="px-4 py-3 text-rcc-text-secondary tabular-nums text-right">{r.certificates}</td>
                            </>
                          )}
                          {showAttendance && (
                            <>
                              <td className="px-4 py-3 text-rcc-text-secondary tabular-nums font-medium text-right">{r.totalRecords}</td>
                              <td className="px-4 py-3 text-green-700 tabular-nums text-right">{r.clockedIn}</td>
                              <td className="px-4 py-3 text-rcc-text-secondary tabular-nums text-right">{r.clockedOut}</td>
                              <td className="px-4 py-3 text-amber-700 tabular-nums text-right">{r.noClockIn}</td>
                              <td className="px-4 py-3 text-rcc-text-secondary tabular-nums text-right">{r.manuallyEdited}</td>
                            </>
                          )}
                        </tr>
                      );

                      // Expanded detail row
                      if (isExpanded) {
                        rows.push(
                          <tr key={`${r.employeeId}-detail`} className="bg-rcc-bg/40">
                            <td colSpan={totalCols} className="px-6 py-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                                {/* Profile section */}
                                <div className="space-y-2">
                                  <h4 className="text-xs font-semibold text-rcc-text-secondary uppercase tracking-wide">Profile</h4>
                                  <div className="flex items-center gap-2 text-rcc-text-primary">
                                    <Mail className="h-3.5 w-3.5 text-rcc-text-muted" />
                                    <span>{r.email || "—"}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-rcc-text-primary">
                                    <Users className="h-3.5 w-3.5 text-rcc-text-muted" />
                                    <span>{r.gender ?? "—"}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-rcc-text-primary">
                                    <Briefcase className="h-3.5 w-3.5 text-rcc-text-muted" />
                                    <span>{r.contractType || "—"}</span>
                                  </div>
                                </div>

                                {/* Employment section */}
                                <div className="space-y-2">
                                  <h4 className="text-xs font-semibold text-rcc-text-secondary uppercase tracking-wide">Employment</h4>
                                  <div className="flex items-center gap-2 text-rcc-text-primary">
                                    <Building2 className="h-3.5 w-3.5 text-rcc-text-muted" />
                                    <span>{r.groupName} ({r.groupCode})</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-rcc-text-primary">
                                    <Users className="h-3.5 w-3.5 text-rcc-text-muted" />
                                    <span>{r.roleName || "—"}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-rcc-text-primary">
                                    <Calendar className="h-3.5 w-3.5 text-rcc-text-muted" />
                                    <span>{r.hireDate ? new Date(r.hireDate).toLocaleDateString() : "—"}</span>
                                  </div>
                                </div>

                                {/* Attendance summary section */}
                                {showAttendance && (
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-semibold text-rcc-text-secondary uppercase tracking-wide">Attendance Summary</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="bg-rcc-surface rounded px-3 py-2 border border-rcc-border">
                                        <p className="text-[10px] text-rcc-text-muted uppercase">Total Records</p>
                                        <p className="text-lg font-bold text-rcc-text-primary tabular-nums">{r.totalRecords}</p>
                                      </div>
                                      <div className="bg-rcc-surface rounded px-3 py-2 border border-rcc-border">
                                        <p className="text-[10px] text-rcc-text-muted uppercase">Clocked In</p>
                                        <p className="text-lg font-bold text-green-700 tabular-nums">{r.clockedIn}</p>
                                      </div>
                                      <div className="bg-rcc-surface rounded px-3 py-2 border border-rcc-border">
                                        <p className="text-[10px] text-rcc-text-muted uppercase">Clocked Out</p>
                                        <p className="text-lg font-bold text-rcc-text-primary tabular-nums">{r.clockedOut}</p>
                                      </div>
                                      <div className="bg-rcc-surface rounded px-3 py-2 border border-rcc-border">
                                        <p className="text-[10px] text-rcc-text-muted uppercase">No Clock-In</p>
                                        <p className="text-lg font-bold text-amber-700 tabular-nums">{r.noClockIn}</p>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return rows;
                    })
                  )}
                </tbody>
              </table>
            </div>

            <PaginationControls {...controls} />
          </div>
        </>
      )}

      {/* ─── Placeholder when filters not filled ─── */}
      {!allRequiredFilled && (
        <div className="bg-rcc-surface rounded-lg border border-dashed border-rcc-border p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-rcc-accent/10 flex items-center justify-center mx-auto mb-3">
            <Filter className="h-6 w-6 text-rcc-accent" />
          </div>
          <p className="text-sm font-medium text-rcc-text-primary mb-1">Fill all required filters to view the report</p>
          <p className="text-xs text-rcc-text-muted">
            Report Type, Date Range, Time, and at least one Group are required.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3 ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  colSpan,
  className = "",
}: {
  children: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td colSpan={colSpan} className={`px-4 py-10 text-center text-rcc-text-muted ${className}`}>
      {children}
    </td>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
}) {
  return (
    <div className="bg-rcc-surface rounded-lg border border-rcc-border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-rcc-text-muted uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-rcc-text-primary mt-1 tabular-nums">{value}</p>
        </div>
        <div className="w-9 h-9 rounded-lg bg-rcc-accent/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-rcc-accent" />
        </div>
      </div>
    </div>
  );
}
