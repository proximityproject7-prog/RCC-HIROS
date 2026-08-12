"use client";

import { useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import {
  Search, Download, ArrowLeft, ChevronRight, Users, Building2,
  TrendingUp, Calendar, FileSpreadsheet, Clock,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { usePermissions } from "@/hooks/use-permissions";
import {
  usePagination,
  PaginationControls,
} from "@/components/shared/table-pagination-v2";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface GroupBrief { id: string; name: string; code: string; }

interface HeadcountGroup {
  groupId: string;
  groupCode: string;
  groupName: string;
  total: number;
  byGender: { male: number; female: number; unspecified: number };
  byContractType: Record<string, number>;
  certificateCount: number;
  roles: { roleId: string; roleName: string; count: number }[];
}

interface HeadcountRole {
  roleId: string;
  roleName: string;
  count: number;
  male: number;
  female: number;
  unspecified: number;
  byContractType: Record<string, number>;
  certificateCount: number;
}

interface HeadcountEmployee {
  id: string;
  employeeId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  gender: string | null;
  contractType: string;
  hireDate: string | null;
  active: boolean;
  roleName: string | null;
  certificateCount: number;
}

interface AttendanceSummary {
  totalEmployees: number;
  totalRecords: number;
  avgPresentRate: number;
  totalManualEdits: number;
}

interface AttendanceByGroup {
  groupId: string;
  groupName: string;
  groupCode: string;
  total: number;
  clockedIn: number;
  clockedOut: number;
  noClockIn: number;
  manuallyEdited: number;
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
// ReportsPage — tabs for Headcount + Attendance
// ═══════════════════════════════════════════════════════════════

export function ReportsPage() {
  const { has } = usePermissions();
  const canExport = has("reports.export");
  const [tab, setTab] = useState<"headcount" | "attendance">("headcount");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-rcc-text-primary">Reports</h1>
        <p className="text-sm text-rcc-text-muted mt-0.5">
          Generate headcount and attendance reports. {canExport ? "CSV export available." : ""}
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-rcc-border">
        <button
          onClick={() => setTab("headcount")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "headcount" ? "border-rcc-accent text-rcc-accent" : "border-transparent text-rcc-text-muted hover:text-rcc-text-primary"
          }`}
        >
          Headcount
        </button>
        <button
          onClick={() => setTab("attendance")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "attendance" ? "border-rcc-accent text-rcc-accent" : "border-transparent text-rcc-text-muted hover:text-rcc-text-primary"
          }`}
        >
          Attendance
        </button>
      </div>

      {tab === "headcount" ? <HeadcountReport canExport={canExport} /> : <AttendanceReport canExport={canExport} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HeadcountReport — drill-down: groups → roles → employees
// ═══════════════════════════════════════════════════════════════

function HeadcountReport({ canExport }: { canExport: boolean }) {
  const [groups, setGroups] = useState<GroupBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drill-down state
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);

  // Data for each level
  const [groupsData, setGroupsData] = useState<HeadcountGroup[]>([]);
  const [rolesData, setRolesData] = useState<HeadcountRole[]>([]);
  const [employeesData, setEmployeesData] = useState<HeadcountEmployee[]>([]);
  const [loadingDrill, setLoadingDrill] = useState(false);

  // Department filter
  const [filterGroupCode, setFilterGroupCode] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ groups: GroupBrief[] }>("/api/groups");
        setGroups(data.groups ?? []);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filterGroupCode ? `?groupCode=${filterGroupCode}` : "";
      const data = await apiFetch<{ level: string; groups: HeadcountGroup[] }>(`/api/reports/headcount${qs}`);
      setGroupsData(data.groups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [filterGroupCode]);

  const loadRoles = useCallback(async (code: string) => {
    setLoadingDrill(true);
    setError(null);
    try {
      const data = await apiFetch<{ level: string; group: { id: string; code: string; name: string }; roles: HeadcountRole[] }>(
        `/api/reports/headcount?groupCode=${encodeURIComponent(code)}`
      );
      setRolesData(data.roles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roles.");
    } finally {
      setLoadingDrill(false);
    }
  }, []);

  const loadEmployees = useCallback(async (code: string, rid: string) => {
    setLoadingDrill(true);
    setError(null);
    try {
      const data = await apiFetch<{ level: string; employees: HeadcountEmployee[] }>(
        `/api/reports/headcount?groupCode=${encodeURIComponent(code)}&roleId=${encodeURIComponent(rid)}`
      );
      setEmployeesData(data.employees ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employees.");
    } finally {
      setLoadingDrill(false);
    }
  }, []);

  useEffect(() => {
    if (!groupCode && !roleId) {
      loadGroups();
    } else if (groupCode && !roleId) {
      loadRoles(groupCode);
    } else if (groupCode && roleId) {
      loadEmployees(groupCode, roleId);
    }
  }, [groupCode, roleId, loadGroups, loadRoles, loadEmployees]);

  // Pagination — only at employee level
  const { currentData: pagedEmployees, controls: empControls } = usePagination(employeesData, { defaultPageSize: 25 });

  // Summary cards
  const summary = useMemo(() => {
    if (groupCode && roleId) {
      return {
        total: employeesData.length,
        male: employeesData.filter((e) => e.gender === "Male").length,
        female: employeesData.filter((e) => e.gender === "Female").length,
        certs: employeesData.reduce((acc, e) => acc + e.certificateCount, 0),
      };
    }
    if (groupCode) {
      return {
        total: rolesData.reduce((acc, r) => acc + r.count, 0),
        male: rolesData.reduce((acc, r) => acc + r.male, 0),
        female: rolesData.reduce((acc, r) => acc + r.female, 0),
        certs: rolesData.reduce((acc, r) => acc + r.certificateCount, 0),
      };
    }
    return {
      total: groupsData.reduce((acc, g) => acc + g.total, 0),
      male: groupsData.reduce((acc, g) => acc + g.byGender.male, 0),
      female: groupsData.reduce((acc, g) => acc + g.byGender.female, 0),
      certs: groupsData.reduce((acc, g) => acc + g.certificateCount, 0),
    };
  }, [groupsData, rolesData, employeesData, groupCode, roleId]);

  const handleExportCSV = () => {
    let rows: string[][] = [];
    let filename = "headcount-report.csv";

    if (!groupCode) {
      rows.push(["Group Code", "Group Name", "Total", "Male", "Female", "Unspecified", "Regular", "Contractual", "Part-Time", "Certificates"]);
      for (const g of groupsData) {
        rows.push([
          g.groupCode, g.groupName, String(g.total),
          String(g.byGender.male), String(g.byGender.female), String(g.byGender.unspecified),
          String(g.byContractType["Regular"] ?? 0),
          String(g.byContractType["Contractual"] ?? 0),
          String(g.byContractType["Part-Time"] ?? 0),
          String(g.certificateCount),
        ]);
      }
      filename = "headcount-by-group.csv";
    } else if (!roleId) {
      rows.push(["Role", "Count", "Male", "Female", "Unspecified", "Certificates"]);
      for (const r of rolesData) {
        rows.push([r.roleName, String(r.count), String(r.male), String(r.female), String(r.unspecified), String(r.certificateCount)]);
      }
      filename = `headcount-${groupCode}-by-role.csv`;
    } else {
      rows.push(["Employee ID", "Name", "Email", "Gender", "Contract", "Role", "Certificates"]);
      for (const e of employeesData) {
        rows.push([
          e.employeeId,
          `${e.firstName} ${e.middleName ?? ""} ${e.lastName}`.trim(),
          e.email,
          e.gender ?? "",
          e.contractType,
          e.roleName ?? "",
          String(e.certificateCount),
        ]);
      }
      filename = `headcount-${groupCode}-employees.csv`;
    }

    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Breadcrumb
  const selectedGroup = groupsData.find((g) => g.groupCode === groupCode) ?? groups.find((g) => g.code === groupCode);
  const selectedRole = rolesData.find((r) => r.roleId === roleId);

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <button
          onClick={() => {
            setGroupCode(null);
            setRoleId(null);
          }}
          className={`font-medium ${!groupCode ? "text-rcc-text-primary" : "text-rcc-accent hover:underline"}`}
        >
          All Groups
        </button>
        {groupCode && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-rcc-text-muted" />
            <button
              onClick={() => setRoleId(null)}
              className={`font-medium ${!roleId ? "text-rcc-text-primary" : "text-rcc-accent hover:underline"}`}
            >
              {selectedGroup ? ("name" in selectedGroup ? selectedGroup.name : selectedGroup.groupName) : groupCode}
            </button>
          </>
        )}
        {roleId && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-rcc-text-muted" />
            <span className="font-medium text-rcc-text-primary">{selectedRole?.roleName ?? "Role"}</span>
          </>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon={Users} label="Total Employees" value={summary.total} />
        <SummaryCard icon={Users} label="Male" value={summary.male} />
        <SummaryCard icon={Users} label="Female" value={summary.female} />
        <SummaryCard icon={TrendingUp} label="Certificates" value={summary.certs} />
      </div>

      {/* Filters + Export */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        {!groupCode && (
          <div className="flex-1">
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">Department Filter</label>
            <select value={filterGroupCode} onChange={(e) => setFilterGroupCode(e.target.value)} className={inputClass}>
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.code}>{g.name}</option>
              ))}
            </select>
          </div>
        )}
        {canExport && (
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors sm:self-end"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
        <div className="overflow-x-auto">
          {!groupCode ? (
            /* Level 1: Groups */
            <table className="w-full text-sm">
              <thead className="bg-rcc-bg/50 border-b border-rcc-border">
                <tr>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Code</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Employees</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Male</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Female</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Regular</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Contractual</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Part-Time</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Certificates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rcc-border">
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-rcc-text-muted">Loading...</td></tr>
                ) : groupsData.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-rcc-text-muted">No groups found.</td></tr>
                ) : (
                  groupsData.map((g) => (
                    <tr
                      key={g.groupId}
                      onClick={() => setGroupCode(g.groupCode)}
                      className="cursor-pointer hover:bg-rcc-bg/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rcc-accent/10 text-rcc-accent border border-rcc-accent/20 font-mono">
                          {g.groupCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-rcc-text-primary">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-rcc-text-muted" />
                          {g.groupName}
                          <ChevronRight className="h-3 w-3 text-rcc-text-muted" />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums font-medium">{g.total}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{g.byGender.male}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{g.byGender.female}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{g.byContractType["Regular"] ?? 0}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{g.byContractType["Contractual"] ?? 0}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{g.byContractType["Part-Time"] ?? 0}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{g.certificateCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : !roleId ? (
            /* Level 2: Roles */
            <table className="w-full text-sm">
              <thead className="bg-rcc-bg/50 border-b border-rcc-border">
                <tr>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Role</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Count</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Male</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Female</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Regular</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Contractual</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Part-Time</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Certificates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rcc-border">
                {loadingDrill ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-rcc-text-muted">Loading...</td></tr>
                ) : rolesData.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-rcc-text-muted">No roles found in this group.</td></tr>
                ) : (
                  rolesData.map((r) => (
                    <tr
                      key={r.roleId}
                      onClick={() => setRoleId(r.roleId)}
                      className="cursor-pointer hover:bg-rcc-bg/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-rcc-text-primary">
                        <span className="inline-flex items-center gap-1.5">
                          {r.roleName}
                          <ChevronRight className="h-3 w-3 text-rcc-text-muted" />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums font-medium">{r.count}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{r.male}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{r.female}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{r.byContractType["Regular"] ?? 0}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{r.byContractType["Contractual"] ?? 0}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{r.byContractType["Part-Time"] ?? 0}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{r.certificateCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            /* Level 3: Employees */
            <table className="w-full text-sm">
              <thead className="bg-rcc-bg/50 border-b border-rcc-border">
                <tr>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Employee ID</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Gender</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Contract</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Hire Date</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Certificates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rcc-border">
                {loadingDrill ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-rcc-text-muted">Loading...</td></tr>
                ) : pagedEmployees.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-rcc-text-muted">No employees in this role.</td></tr>
                ) : (
                  pagedEmployees.map((e) => (
                    <tr key={e.id} className="hover:bg-rcc-bg/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-rcc-text-secondary">{e.employeeId}</td>
                      <td className="px-4 py-3 font-medium text-rcc-text-primary">
                        {e.firstName} {e.middleName ? e.middleName + " " : ""}{e.lastName}
                      </td>
                      <td className="px-4 py-3 text-rcc-text-secondary truncate max-w-xs">{e.email}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary">{e.gender ?? ""}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rcc-accent/10 text-rcc-accent border border-rcc-accent/20">
                          {e.contractType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-rcc-text-secondary">
                        {e.hireDate ? new Date(e.hireDate).toLocaleDateString() : ""}
                      </td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{e.certificateCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        {groupCode && roleId && <PaginationControls {...empControls} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AttendanceReport
// ═══════════════════════════════════════════════════════════════

interface AttendanceReportData {
  range: { from: string; to: string };
  group: { id: string; code: string; name: string } | null;
  summary: AttendanceSummary;
  byGroup: AttendanceByGroup[];
  byDate: { date: string; total: number; clockedIn: number; clockedOut: number; noClockIn: number; manuallyEdited: number }[];
  byEmployee?: { employeeId: string; name: string; total: number; clockedIn: number; clockedOut: number; noClockIn: number; manuallyEdited: number }[];
}

function AttendanceReport({ canExport }: { canExport: boolean }) {
  const [groups, setGroups] = useState<GroupBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AttendanceReportData | null>(null);

  const [dateFrom, setDateFrom] = useState(dateNDaysAgo(29));
  const [dateTo, setDateTo] = useState(todayISO());
  const [groupCode, setGroupCode] = useState("");

  // Drill-down state
  const [drillGroupId, setDrillGroupId] = useState<string | null>(null);
  const [drillGroupName, setDrillGroupName] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const gdata = await apiFetch<{ groups: GroupBrief[] }>("/api/groups");
        setGroups(gdata.groups ?? []);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("dateFrom", dateFrom);
      params.set("dateTo", dateTo);
      if (groupCode) params.set("groupCode", groupCode);
      const result = await apiFetch<AttendanceReportData>(`/api/reports/attendance?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, groupCode]);

  useEffect(() => {
    load();
  }, [load]);

  // Detailed records table: flatten byDate for table view with pagination
  const { currentData: pagedDates, controls: dateControls } = usePagination(data?.byDate ?? [], { defaultPageSize: 15 });

  // Employee attendance pagination (drill-down)
  const { currentData: pagedEmployees, controls: empControls } = usePagination(data?.byEmployee ?? [], { defaultPageSize: 25 });

  const handleExportCSV = () => {
    if (!data) return;
    const rows: string[][] = [];

    if (drillGroupId && data.byEmployee) {
      // Drill-down level: export employee attendance
      rows.push(["Employee ID", "Name", "Total Records", "Clocked In", "Clocked Out", "No Clock-In", "Manually Edited"]);
      for (const e of data.byEmployee) {
        rows.push([e.employeeId, e.name, String(e.total), String(e.clockedIn), String(e.clockedOut), String(e.noClockIn), String(e.manuallyEdited)]);
      }
    } else {
      // Top level: export by group + by date
      rows.push(["Group Code", "Group Name", "Total Records", "Clocked In", "Clocked Out", "No Clock-In", "Manually Edited"]);
      for (const g of data.byGroup) {
        rows.push([g.groupCode, g.groupName, String(g.total), String(g.clockedIn), String(g.clockedOut), String(g.noClockIn), String(g.manuallyEdited)]);
      }
      rows.push([]);
      rows.push(["Date", "Total Records", "Clocked In", "Clocked Out", "No Clock-In", "Manually Edited"]);
      for (const d of data.byDate) {
        rows.push([d.date, String(d.total), String(d.clockedIn), String(d.clockedOut), String(d.noClockIn), String(d.manuallyEdited)]);
      }
    }

    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = drillGroupName
      ? `attendance-${drillGroupName.replace(/\s+/g, "-")}-${dateFrom}-to-${dateTo}.csv`
      : `attendance-report-${dateFrom}-to-${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      {/* Filters */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">Date From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">Date To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">Department</label>
            <select
              value={groupCode}
              onChange={(e) => {
                setGroupCode(e.target.value);
                setDrillGroupId(null);
                setDrillGroupName("");
              }}
              className={inputClass}
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.code}>{g.name}</option>
              ))}
            </select>
          </div>
          {canExport && (
            <button
              onClick={handleExportCSV}
              disabled={!data}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon={Users} label="Employees in Scope" value={summary.totalEmployees} />
          <SummaryCard icon={Clock} label="Total Records" value={summary.totalRecords} />
          <SummaryCard icon={TrendingUp} label="Avg Present Rate" value={`${summary.avgPresentRate.toFixed(1)}%`} />
          <SummaryCard icon={FileSpreadsheet} label="Manual Edits" value={summary.totalManualEdits} />
        </div>
      )}

      {/* Breadcrumb */}
      {drillGroupId && (
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <button
            onClick={() => {
              setDrillGroupId(null);
              setDrillGroupName("");
              setGroupCode("");
            }}
            className="font-medium text-rcc-accent hover:underline"
          >
            All Departments
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-rcc-text-muted" />
          <span className="font-medium text-rcc-text-primary">{drillGroupName}</span>
        </div>
      )}

      {/* By Department table (hide when drilled down) */}
      {!drillGroupId && (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
          <div className="px-4 py-3 border-b border-rcc-border">
            <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">By Department</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-rcc-bg/50 border-b border-rcc-border">
                <tr>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Group</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Code</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Total</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Clocked In</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Clocked Out</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">No Clock-In</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Manual Edits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rcc-border">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-rcc-text-muted">Loading...</td></tr>
                ) : !data || data.byGroup.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-rcc-text-muted">No data for the selected range.</td></tr>
                ) : (
                  data.byGroup.map((g) => (
                    <tr
                      key={g.groupId}
                      onClick={() => {
                        setDrillGroupId(g.groupId);
                        setDrillGroupName(g.groupName);
                        setGroupCode(g.groupCode);
                      }}
                      className="cursor-pointer hover:bg-rcc-bg/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-rcc-text-primary">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-rcc-text-muted" />
                          {g.groupName}
                          <ChevronRight className="h-3 w-3 text-rcc-text-muted" />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rcc-accent/10 text-rcc-accent border border-rcc-accent/20 font-mono">
                          {g.groupCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums font-medium">{g.total}</td>
                      <td className="px-4 py-3 text-green-700 tabular-nums">{g.clockedIn}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{g.clockedOut}</td>
                      <td className="px-4 py-3 text-amber-700 tabular-nums">{g.noClockIn}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{g.manuallyEdited}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Employee attendance table (shown when drilled down) */}
      {drillGroupId && (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
          <div className="px-4 py-3 border-b border-rcc-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
              Employee Attendance — {drillGroupName}
            </h2>
            <span className="text-xs text-rcc-text-muted">
              {data?.byEmployee ? `${data.byEmployee.length} employee(s)` : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-rcc-bg/50 border-b border-rcc-border">
                <tr>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Employee ID</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Total</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Clocked In</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Clocked Out</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">No Clock-In</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Manual Edits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rcc-border">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-rcc-text-muted">Loading...</td></tr>
                ) : pagedEmployees.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-rcc-text-muted">No employee records found.</td></tr>
                ) : (
                  pagedEmployees.map((e) => (
                    <tr key={e.employeeId} className="hover:bg-rcc-bg/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-rcc-text-secondary">{e.employeeId}</td>
                      <td className="px-4 py-3 font-medium text-rcc-text-primary">{e.name}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums font-medium">{e.total}</td>
                      <td className="px-4 py-3 text-green-700 tabular-nums">{e.clockedIn}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{e.clockedOut}</td>
                      <td className="px-4 py-3 text-amber-700 tabular-nums">{e.noClockIn}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{e.manuallyEdited}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls {...empControls} />
        </div>
      )}

      {/* Detailed records (by date) — hide when drilled down */}
      {!drillGroupId && (
        <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
          <div className="px-4 py-3 border-b border-rcc-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">Detailed Records (by Date)</h2>
            <span className="text-xs text-rcc-text-muted">
              {data ? `${data.byDate.length} day(s)` : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-rcc-bg/50 border-b border-rcc-border">
                <tr>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Total</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Clocked In</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Clocked Out</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">No Clock-In</th>
                  <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Manual Edits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rcc-border">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-rcc-text-muted">Loading...</td></tr>
                ) : pagedDates.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-rcc-text-muted">No records.</td></tr>
                ) : (
                  pagedDates.map((d) => (
                    <tr key={d.date} className="hover:bg-rcc-bg/30 transition-colors">
                      <td className="px-4 py-3 text-rcc-text-primary font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-rcc-text-muted" />
                          {d.date}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums font-medium">{d.total}</td>
                      <td className="px-4 py-3 text-green-700 tabular-nums">{d.clockedIn}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{d.clockedOut}</td>
                      <td className="px-4 py-3 text-amber-700 tabular-nums">{d.noClockIn}</td>
                      <td className="px-4 py-3 text-rcc-text-secondary tabular-nums">{d.manuallyEdited}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls {...dateControls} />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Helpers
// ═══════════════════════════════════════════════════════════════

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
          <Icon className="h-4.5 w-4.5 text-rcc-accent" />
        </div>
      </div>
    </div>
  );
}

// Suppress unused-import warnings
void Search;
void ArrowLeft;
