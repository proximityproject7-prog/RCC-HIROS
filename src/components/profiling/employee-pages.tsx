"use client";

import { useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus, Search, Pencil, ArrowLeft, Save, Users as UsersIcon, Upload,
  FileText, Download, Trash2, Eye, X, Lock, Mail, Phone, MapPin, Calendar,
  IdCard, Briefcase, Award, Image as ImageIcon, AlertTriangle, Building2,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { usePermissions } from "@/hooks/use-permissions";
import {
  usePagination,
  PaginationControls,
} from "@/components/shared/table-pagination-v2";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  variant: "danger" | "warning";
  onConfirm: () => void;
}

interface GroupBrief { id: string; name: string; code: string; }
interface RoleBrief { id: string; name: string; }

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
  birthday: string | null;
  gender: string | null;
  contractType: string;
  hireDate: string | null;
  salary: number | null;
  active: boolean;
  groupId: string | null;
  groupName: string | null;
  groupCode: string | null;
  group?: GroupBrief | null;
  roleId: string | null;
  roleName: string | null;
  mustChangePwd?: boolean;
  lastLoginAt?: string | null;
  certificateCount?: number;
  createdAt?: string;
  updatedAt?: string;
  certificates?: Certificate[];
  files?: EmployeeFile[];
  counts?: Record<string, number>;
}

interface Certificate {
  id: string;
  title: string;
  issuer: string | null;
  certificateNo: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  createdAt: string;
}

interface EmployeeFile {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  description: string | null;
  uploadedBy: string | null;
  createdAt: string;
  uploadedAt: string;
}

const CONTRACT_TYPES = ["Regular", "Contractual", "Part-Time"];
const GENDER_OPTIONS = ["Male", "Female"];

const inputClass =
  "w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40";

// ═══════════════════════════════════════════════════════════════
// EmployeeListPage
// ═══════════════════════════════════════════════════════════════

export function EmployeeListPage() {
  const { setCurrentPage } = useAuthStore();
  const { has } = usePermissions();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [groups, setGroups] = useState<GroupBrief[]>([]);
  const [roles, setRoles] = useState<RoleBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [contractType, setContractType] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  // Load groups & roles once for filters
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

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (groupId) params.set("groupId", groupId);
      if (roleId) params.set("roleId", roleId);
      if (contractType) params.set("contractType", contractType);
      if (activeFilter) params.set("active", activeFilter);
      const qs = params.toString();
      const data = await apiFetch<{ employees: Employee[] }>(
        `/api/employees${qs ? `?${qs}` : ""}`
      );
      setEmployees(data.employees ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }, [search, groupId, roleId, contractType, activeFilter]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const { currentData, controls } = usePagination(employees, { defaultPageSize: 15 });

  const canViewInactive = has("profiling.view_inactive");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-rcc-text-primary">Employee Records</h1>
          <p className="text-sm text-rcc-text-muted mt-0.5">
            Click a row to view the full employee profile.
          </p>
        </div>
        {has("profiling.create") && (
          <button
            onClick={() => setCurrentPage("profiling", "create")}
            className="inline-flex items-center gap-2 bg-rcc-primary text-rcc-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-rcc-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Employee
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-rcc-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or employee ID..."
              className={`${inputClass} pl-10`}
            />
          </div>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass}>
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className={inputClass}>
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <select value={contractType} onChange={(e) => setContractType(e.target.value)} className={inputClass}>
            <option value="">All contracts</option>
            {CONTRACT_TYPES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        {canViewInactive && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-rcc-text-muted">Status:</span>
            {["", "true", "false"].map((v) => (
              <button
                key={v}
                onClick={() => setActiveFilter(v)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  activeFilter === v
                    ? "bg-rcc-primary text-rcc-primary-foreground border-rcc-primary"
                    : "border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg"
                }`}
              >
                {v === "" ? "All" : v === "true" ? "Active" : "Inactive"}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-rcc-bg/50 border-b border-rcc-border">
              <tr>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Employee</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Group</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Role</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Contract</th>
                <th className="text-left text-xs font-semibold text-rcc-text-muted uppercase tracking-wide px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rcc-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-rcc-text-muted">
                    Loading employees...
                  </td>
                </tr>
              ) : currentData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-rcc-text-muted">
                    No employees found. Adjust filters or create a new record.
                  </td>
                </tr>
              ) : (
                currentData.map((emp) => (
                  <tr
                    key={emp.id}
                    onClick={() => setCurrentPage("profiling", `view:${emp.id}`)}
                    className="cursor-pointer hover:bg-rcc-bg/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-rcc-primary/10 text-rcc-primary flex items-center justify-center shrink-0 text-xs font-bold">
                          {(emp.firstName.charAt(0) + emp.lastName.charAt(0)).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-rcc-text-primary truncate">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-xs text-rcc-text-muted truncate">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-rcc-text-secondary font-mono text-xs">
                      {emp.employeeId}
                    </td>
                    <td className="px-4 py-3 text-rcc-text-secondary">
                      {emp.groupName ?? <span className="text-rcc-text-muted">-</span>}
                    </td>
                    <td className="px-4 py-3 text-rcc-text-secondary">
                      {emp.roleName ?? <span className="text-rcc-text-muted">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rcc-accent/10 text-rcc-accent border border-rcc-accent/20">
                        {emp.contractType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {emp.active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-rcc-error">
                          <span className="w-1.5 h-1.5 rounded-full bg-rcc-error" /> Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls {...controls} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EmployeeFormPage
// ═══════════════════════════════════════════════════════════════

export function EmployeeFormPage({ mode, employeeId }: { mode: "create" | "edit"; employeeId?: string }) {
  const { setCurrentPage } = useAuthStore();

  const [groups, setGroups] = useState<GroupBrief[]>([]);
  const [roles, setRoles] = useState<RoleBrief[]>([]);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [employeeIdField, setEmployeeIdField] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [birthday, setBirthday] = useState("");
  const [gender, setGender] = useState("");
  const [groupId, setGroupId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [contractType, setContractType] = useState("Regular");
  const [hireDate, setHireDate] = useState("");
  const [salary, setSalary] = useState("");
  const [active, setActive] = useState(true);

  // Login credentials (create-only)
  const [password, setPassword] = useState("");
  const [mustChangePwd, setMustChangePwd] = useState(true);

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

  useEffect(() => {
    if (mode !== "edit" || !employeeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch<{ employee: Employee }>(`/api/employees/${employeeId}`);
        if (cancelled) return;
        const e = data.employee;
        setEmployeeIdField(e.employeeId);
        setFirstName(e.firstName);
        setMiddleName(e.middleName ?? "");
        setLastName(e.lastName);
        setEmail(e.email);
        setPhone(e.phone ?? "");
        setAddress(e.address ?? "");
        setBirthday(e.birthday ? e.birthday.slice(0, 10) : "");
        setGender(e.gender ?? "");
        setGroupId(e.groupId ?? "");
        setRoleId(e.roleId ?? "");
        setContractType(e.contractType ?? "Regular");
        setHireDate(e.hireDate ? e.hireDate.slice(0, 10) : "");
        setSalary(e.salary != null ? String(e.salary) : "");
        setActive(e.active);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load employee.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, employeeId]);

  const handleSave = async () => {
    setError(null);
    if (!employeeIdField.trim()) return setError("Employee ID is required.");
    if (!firstName.trim()) return setError("First name is required.");
    if (!lastName.trim()) return setError("Last name is required.");
    if (!email.trim()) return setError("Email is required.");
    if (mode === "create" && (!password || password.length < 8)) {
      return setError("Password must be at least 8 characters.");
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        employeeId: employeeIdField.trim(),
        firstName: firstName.trim(),
        middleName: middleName.trim() || null,
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        birthday: birthday || null,
        gender: gender || null,
        groupId: groupId || null,
        roleId: roleId || null,
        contractType,
        hireDate: hireDate || null,
        salary: salary ? parseFloat(salary) : 0,
        active,
      };
      if (mode === "create") {
        payload.password = password;
        payload.mustChangePwd = mustChangePwd;
        await apiFetch("/api/employees", { method: "POST", body: JSON.stringify(payload) });
      } else if (employeeId) {
        // password is optional on edit
        if (password) payload.password = password;
        await apiFetch(`/api/employees/${employeeId}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      setCurrentPage("profiling");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-rcc-primary border-t-transparent" />
        <span className="ml-2 text-sm text-rcc-text-muted">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCurrentPage("profiling")}
          className="inline-flex items-center gap-1 text-sm text-rcc-text-secondary hover:text-rcc-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to employees
        </button>
      </div>
      <div>
        <h1 className="text-xl font-bold text-rcc-text-primary">
          {mode === "create" ? "Create Employee" : `Edit: ${firstName} ${lastName}`}
        </h1>
        <p className="text-sm text-rcc-text-muted mt-0.5">
          Fill in all required fields. Login credentials are set on create; password is optional on edit.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">
          {error}
        </div>
      )}

      <section className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
        <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
          Personal Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Employee ID" required>
            <input type="text" value={employeeIdField} onChange={(e) => setEmployeeIdField(e.target.value)} placeholder="EMP-0001" className={`${inputClass} font-mono`} />
          </Field>
          <Field label="First Name" required>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Middle Name">
            <input type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Last Name" required>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Phone">
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Birthday">
            <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Gender">
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputClass}>
              <option value="">-</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Address" hint="Full home address.">
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
        <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
          Work Assignment
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Group">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass}>
              <option value="">Unassigned</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.code})</option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className={inputClass}>
              <option value="">Unassigned</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Contract Type">
            <select value={contractType} onChange={(e) => setContractType(e.target.value)} className={inputClass}>
              {CONTRACT_TYPES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Hire Date">
            <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Monthly Salary" hint="₱ PHP">
            <input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} min="0" step="0.01" className={inputClass} />
          </Field>
          <label
            className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors md:col-span-2 ${
              active ? "border-rcc-accent/40 bg-rcc-accent/5" : "border-rcc-border hover:bg-rcc-bg/40"
            }`}
          >
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-rcc-border text-rcc-accent focus:ring-rcc-accent/40" />
            <div>
              <p className="text-sm font-semibold text-rcc-text-primary">Active Employee</p>
              <p className="text-xs text-rcc-text-muted mt-0.5">Inactive employees cannot sign in.</p>
            </div>
          </label>
        </div>
      </section>

      {mode === "create" && (
        <section className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-rcc-text-secondary" />
            <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
              Login Credentials
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Password" required hint="Minimum 8 characters.">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
                autoComplete="new-password"
              />
            </Field>
            <label
              className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                mustChangePwd ? "border-rcc-accent/40 bg-rcc-accent/5" : "border-rcc-border hover:bg-rcc-bg/40"
              }`}
            >
              <input type="checkbox" checked={mustChangePwd} onChange={(e) => setMustChangePwd(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-rcc-border text-rcc-accent focus:ring-rcc-accent/40" />
              <div>
                <p className="text-sm font-semibold text-rcc-text-primary">Must Change Password on First Login</p>
                <p className="text-xs text-rcc-text-muted mt-0.5">Force the user to choose a new password.</p>
              </div>
            </label>
          </div>
        </section>
      )}

      {mode === "edit" && (
        <section className="bg-rcc-surface rounded-lg border border-rcc-border p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-rcc-text-secondary" />
            <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
              Reset Password (Optional)
            </h2>
          </div>
          <Field label="New Password" hint="Leave blank to keep the current password. Min 8 chars.">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputClass}
              autoComplete="new-password"
            />
          </Field>
        </section>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={() => setCurrentPage("profiling")}
          disabled={saving}
          className="px-4 py-2 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : mode === "create" ? "Create Employee" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EmployeeProfilePage
// ═══════════════════════════════════════════════════════════════

export function EmployeeProfilePage({ employeeId }: { employeeId: string }) {
  const { setCurrentPage } = useAuthStore();
  const { has } = usePermissions();
  const { user } = useAuth();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // File viewer modal
  const [viewing, setViewing] = useState<{ url: string; mime: string; name: string } | null>(null);

  // Certificate add modal
  const [certOpen, setCertOpen] = useState(false);
  const [certForm, setCertForm] = useState({ title: "", issuer: "", certificateNo: "", issueDate: "", expiryDate: "" });

  // File upload state
  const [uploading, setUploading] = useState(false);
  const [fileDesc, setFileDesc] = useState("");

  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

  // FPASS enabled state
  const [fpassEnabled, setFpassEnabled] = useState(false);

  // Inline edit mode
  const canSelfEdit = employeeId === user?.id && has("profile.selfEdit");
  const canInlineEdit = canSelfEdit;
  const canManageFiles = has("profiling.edit") || has("profile.editAll") || canSelfEdit;
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ email: "", phone: "", address: "", birthday: "", gender: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const loadEmployee = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ employee: Employee }>(`/api/employees/${employeeId}`);
      setEmployee(data.employee);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employee.");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadEmployee();
  }, [loadEmployee]);

  // Check FPASS enabled for employee's group
  useEffect(() => {
    if (!employee?.groupId) return;
    (async () => {
      try {
        const data = await apiFetch<{ enabledGroupIds: string[] }>("/api/fpass/settings");
        setFpassEnabled(data.enabledGroupIds?.includes(employee.groupId!) ?? false);
      } catch {
        // non-fatal
      }
    })();
  }, [employee?.groupId]);

  // Revoke blob URLs when viewer closes
  useEffect(() => {
    if (!viewing) return;
    const url = viewing.url;
    return () => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [viewing]);

  const fetchFileBlob = async (fileId: string): Promise<{ blob: Blob; mime: string }> => {
    const token = localStorage.getItem("hiros_token");
    const res = await fetch(`/api/employees/${employeeId}/files/${fileId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`);
    const blob = await res.blob();
    const mime = res.headers.get("content-type") || "application/octet-stream";
    return { blob, mime };
  };

  const handleViewFile = async (file: EmployeeFile) => {
    try {
      const { blob, mime } = await fetchFileBlob(file.id);
      const url = URL.createObjectURL(blob);
      setViewing({ url, mime, name: file.originalName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load file.");
    }
  };

  const handleDownloadFile = async (file: EmployeeFile) => {
    try {
      const { blob } = await fetchFileBlob(file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    }
  };

  const handleDeleteFile = (file: EmployeeFile) => {
    setConfirmState({
      open: true,
      title: `Delete "${file.originalName}"?`,
      message: "This file will be permanently removed. This action cannot be undone.",
      variant: "danger",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await apiFetch(`/api/employees/${employeeId}/files/${file.id}`, { method: "DELETE" });
          loadEmployee();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Delete failed.");
        }
      },
    });
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { setError("Only PDF files are allowed."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("File exceeds 10MB limit."); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (fileDesc.trim()) fd.append("description", fileDesc.trim());
      await apiFetch(`/api/employees/${employeeId}/files`, {
        method: "POST",
        body: fd,
        skipJsonHeader: true,
      });
      setFileDesc("");
      (e.target as HTMLInputElement).value = "";
      loadEmployee();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleAddCert = async () => {
    if (!certForm.title.trim()) return;
    try {
      await apiFetch(`/api/employees/${employeeId}/certificates`, {
        method: "POST",
        body: JSON.stringify({
          title: certForm.title.trim(),
          issuer: certForm.issuer.trim() || null,
          certificateNo: certForm.certificateNo.trim() || null,
          issueDate: certForm.issueDate || null,
          expiryDate: certForm.expiryDate || null,
        }),
      });
      setCertForm({ title: "", issuer: "", certificateNo: "", issueDate: "", expiryDate: "" });
      setCertOpen(false);
      loadEmployee();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add certificate.");
    }
  };

  const handleDeleteCert = (certId: string, title: string) => {
    setConfirmState({
      open: true,
      title: `Delete certificate "${title}"?`,
      message: "This certificate will be permanently removed. This action cannot be undone.",
      variant: "danger",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await apiFetch(`/api/employees/${employeeId}/certificates/${certId}`, { method: "DELETE" });
          loadEmployee();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Delete failed.");
        }
      },
    });
  };

  // ── Inline edit ──────────────────────────────────────────────
  const startEditing = () => {
    setEditForm({
      email: employee?.email ?? "",
      phone: employee?.phone ?? "",
      address: employee?.address ?? "",
      birthday: employee?.birthday ? employee.birthday.slice(0, 10) : "",
      gender: employee?.gender ?? "",
    });
    setEditError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditError(null);
  };

  const saveEditing = async () => {
    setEditError(null);
    setEditSaving(true);
    try {
      const body: Record<string, string | null> = {};
      // Email cannot be changed via self-edit — only admins with profiling.edit can change it
      if (!canSelfEdit && editForm.email.trim()) body.email = editForm.email.trim();
      if (editForm.phone !== employee?.phone) body.phone = editForm.phone.trim() || null;
      if (editForm.address !== employee?.address) body.address = editForm.address.trim() || null;
      if (editForm.birthday !== (employee?.birthday ? employee.birthday.slice(0, 10) : "")) body.birthday = editForm.birthday || null;
      if (editForm.gender !== employee?.gender) body.gender = editForm.gender || null;
      await apiFetch(`/api/employees/${employeeId}`, { method: "PATCH", body: JSON.stringify(body) });
      setEditing(false);
      loadEmployee();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setEditSaving(false);
    }
  };

  // ── Reupload file ────────────────────────────────────────────
  const [reuploading, setReuploading] = useState<string | null>(null);

  const handleReupload = async (fileId: string, oldName: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.type !== "application/pdf") { setError("Only PDF files are allowed."); return; }
      if (f.size > 10 * 1024 * 1024) { setError("File exceeds 10MB limit."); return; }
      setReuploading(fileId);
      try {
        const fd = new FormData();
        fd.append("file", f);
        await apiFetch(`/api/employees/${employeeId}/files/${fileId}`, { method: "PUT", body: fd, skipJsonHeader: true });
        loadEmployee();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reupload failed.");
      } finally {
        setReuploading(null);
      }
    };
    input.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-rcc-primary border-t-transparent" />
        <span className="ml-2 text-sm text-rcc-text-muted">Loading...</span>
      </div>
    );
  }

  if (error && !employee) {
    return (
      <div className="space-y-4">
      {employeeId !== user?.id && (
        <button
          onClick={() => setCurrentPage("profiling")}
          className="inline-flex items-center gap-1 text-sm text-rcc-text-secondary hover:text-rcc-primary transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to employees
        </button>
      )}
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      </div>
    );
  }

  if (!employee) return null;

  const initials = (employee.firstName.charAt(0) + employee.lastName.charAt(0)).toUpperCase();
  const fullName = `${employee.firstName} ${employee.middleName ? employee.middleName + " " : ""}${employee.lastName}`;

  return (
    <div className="space-y-6">

      {employeeId !== user?.id && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentPage("profiling")}
            className="inline-flex items-center gap-1 text-sm text-rcc-text-secondary hover:text-rcc-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to employees
          </button>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{error}</div>
      )}

      {/* Header card — clean white, NO brown gradient */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-rcc-primary/10 text-rcc-primary flex items-center justify-center shrink-0 text-2xl font-bold">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-rcc-text-primary">{fullName}</h1>
              {employee.active ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> ACTIVE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-rcc-error border border-red-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-rcc-error" /> INACTIVE
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 flex-wrap text-sm text-rcc-text-secondary">
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> {employee.roleName ?? "Unassigned"}
              </span>
              <span className="inline-flex items-center gap-1">
                <IdCard className="h-3.5 w-3.5" /> <span className="font-mono">{employee.employeeId}</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {has("profiling.edit") && (
              <button
                onClick={() => setCurrentPage("profiling", `edit:${employee.id}`)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
            {canInlineEdit && !editing && (
              <button
                onClick={startEditing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors"
              >
                <Pencil className="h-4 w-4" /> Edit Profile
              </button>
            )}
            {/* FPASS button: visible if own profile + group enabled, or if admin with fpass.manage */}
            {((employeeId === user?.id && fpassEnabled) || has("fpass.manage")) && (
              <button
                onClick={() => setCurrentPage("fpass", `emp:${employee.id}`)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold border border-rcc-accent/30 text-rcc-accent hover:bg-rcc-accent/5 transition-colors"
              >
                <FileText className="h-4 w-4" /> FPASS
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal Info (2/3) */}
        <div className="lg:col-span-2 bg-rcc-surface rounded-lg border border-rcc-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
              Personal Information
            </h2>
            {editing && (
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelEditing}
                  className="px-3 py-1.5 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEditing}
                  disabled={editSaving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" /> {editSaving ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>
          {editError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-rcc-error">{editError}</div>
          )}
          {editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
              <EditField icon={Mail} label="Email" type="email" value={editForm.email} onChange={(v) => setEditForm(f => ({ ...f, email: v }))} disabled={canSelfEdit} />
              <EditField icon={Phone} label="Phone" type="text" value={editForm.phone} onChange={(v) => setEditForm(f => ({ ...f, phone: v }))} />
              <EditField icon={MapPin} label="Address" type="text" value={editForm.address} onChange={(v) => setEditForm(f => ({ ...f, address: v }))} />
              <EditField icon={Calendar} label="Birthday" type="date" value={editForm.birthday} onChange={(v) => setEditForm(f => ({ ...f, birthday: v }))} />
              <SelectField icon={UsersIcon} label="Gender" value={editForm.gender} options={["", "Male", "Female"]} onChange={(v) => setEditForm(f => ({ ...f, gender: v }))} />
              <InfoItem icon={Briefcase} label="Contract" value={employee.contractType} />
              <InfoItem icon={Calendar} label="Hire Date" value={employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : null} />
              <InfoItem icon={Building2} label="Group" value={employee.group ? `${employee.group.name} (${employee.group.code})` : null} />
              <InfoItem icon={Briefcase} label="Monthly Salary" value={employee.salary != null ? `₱${Number(employee.salary).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null} />
            </div>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
              <InfoItem icon={Mail} label="Email" value={employee.email} />
              <InfoItem icon={Phone} label="Phone" value={employee.phone} />
              <InfoItem icon={MapPin} label="Address" value={employee.address} />
              <InfoItem icon={Calendar} label="Birthday" value={employee.birthday ? new Date(employee.birthday).toLocaleDateString() : null} />
              <InfoItem icon={UsersIcon} label="Gender" value={employee.gender} />
              <InfoItem icon={Briefcase} label="Contract" value={employee.contractType} />
              <InfoItem icon={Calendar} label="Hire Date" value={employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : null} />
              <InfoItem icon={Building2} label="Group" value={employee.group ? `${employee.group.name} (${employee.group.code})` : null} />
              <InfoItem icon={Briefcase} label="Monthly Salary" value={employee.salary != null ? `₱${Number(employee.salary).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null} />
            </dl>
          )}
        </div>

        {/* Certificates (1/3) */}
        <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
              Certificates
            </h2>
            {(has("profiling.edit") || canSelfEdit) && (
              <button
                onClick={() => setCertOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            )}
          </div>
          <div className="flex-1 max-h-96 overflow-y-auto custom-scrollbar -mr-2 pr-2">
            {(!employee.certificates || employee.certificates.length === 0) ? (
              <p className="text-xs text-rcc-text-muted text-center py-6">No certificates yet.</p>
            ) : (
              <ul className="space-y-2">
                {employee.certificates.map((c) => (
                  <li key={c.id} className="border border-rcc-border rounded-md p-3 hover:bg-rcc-bg/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-rcc-text-primary truncate flex items-center gap-1">
                          <Award className="h-3.5 w-3.5 text-rcc-accent shrink-0" />
                          {c.title}
                        </p>
                        {c.issuer && <p className="text-xs text-rcc-text-muted mt-0.5">{c.issuer}</p>}
                        <div className="text-xs text-rcc-text-muted mt-1 space-y-0.5">
                          {c.certificateNo && <p>No: <span className="font-mono">{c.certificateNo}</span></p>}
                          {c.issueDate && <p>Issued: {new Date(c.issueDate).toLocaleDateString()}</p>}
                          {c.expiryDate && <p>Expires: {new Date(c.expiryDate).toLocaleDateString()}</p>}
                        </div>
                      </div>
                      {(has("profiling.edit") || canSelfEdit) && (
                        <button
                          onClick={() => handleDeleteCert(c.id, c.title)}
                          className="p-1.5 rounded-md text-rcc-text-muted hover:text-rcc-error hover:bg-red-50 transition-colors"
                          title="Delete certificate"
                          aria-label="Delete certificate"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Files & Documents */}
      <div className="bg-rcc-surface rounded-lg border border-rcc-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
            Files &amp; Documents
          </h2>
        </div>

        {canManageFiles && (
          <div className="mb-4 border border-dashed border-rcc-border rounded-md p-4 bg-rcc-bg/30">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors cursor-pointer">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading..." : "Choose File"}
                <input
                  type="file"
                  className="hidden"
                  onChange={handleUploadFile}
                  disabled={uploading}
                  accept=".pdf"
                />
              </label>
              <input
                type="text"
                value={fileDesc}
                onChange={(e) => setFileDesc(e.target.value)}
                placeholder="Optional description..."
                className={inputClass}
              />
            </div>
            <p className="text-xs text-rcc-text-muted mt-2">
              Max 10MB. PDF only.
            </p>
          </div>
        )}

        {(!employee.files || employee.files.length === 0) ? (
          <p className="text-sm text-rcc-text-muted text-center py-6">No files uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {employee.files.map((f) => {
              const Icon = FileText;
              return (
                <div key={f.id} className="border border-rcc-border rounded-md p-3 hover:bg-rcc-bg/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-md bg-rcc-primary/10 text-rcc-primary flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-rcc-text-primary truncate" title={f.originalName}>
                        {f.originalName}
                      </p>
                      <p className="text-xs text-rcc-text-muted">
                        {(f.fileSize / 1024).toFixed(1)} KB{f.uploadedBy ? ` · ${f.uploadedBy}` : ""}
                      </p>
                      <p className="text-xs text-rcc-text-muted">
                        Uploaded: {new Date(f.uploadedAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                      </p>
                      {f.description && (
                        <p className="text-xs text-rcc-text-secondary mt-1 line-clamp-2">{f.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1">
                    <button
                      onClick={() => handleViewFile(f)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-rcc-text-secondary hover:bg-rcc-bg hover:text-rcc-primary transition-colors"
                      title="View"
                    >
                      <Eye className="h-3 w-3" /> View
                    </button>
                    <button
                      onClick={() => handleDownloadFile(f)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-rcc-text-secondary hover:bg-rcc-bg hover:text-rcc-primary transition-colors"
                      title="Download"
                    >
                      <Download className="h-3 w-3" /> Download
                    </button>
                    {canManageFiles && (
                      <>
                        <button
                          onClick={() => handleReupload(f.id, f.originalName)}
                          disabled={reuploading === f.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-rcc-text-secondary hover:bg-rcc-bg hover:text-rcc-primary transition-colors disabled:opacity-50"
                          title="Reupload"
                        >
                          <Upload className="h-3 w-3" /> {reuploading === f.id ? "..." : "Reupload"}
                        </button>
                        <button
                          onClick={() => handleDeleteFile(f)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-rcc-text-secondary hover:bg-red-50 hover:text-rcc-error transition-colors ml-auto"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* File Viewer Modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-rcc-surface rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-rcc-border">
              <p className="text-sm font-semibold text-rcc-text-primary truncate">{viewing.name}</p>
              <button
                onClick={() => setViewing(null)}
                className="p-1.5 rounded-md text-rcc-text-muted hover:bg-rcc-bg hover:text-rcc-text-primary transition-colors"
                aria-label="Close viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-rcc-bg/30">
              {viewing.mime.startsWith("image/") ? (
                <div className="flex items-center justify-center p-4">
                  {/* blob URL — no Next/Image optimization needed */}
                  <img src={viewing.url} alt={viewing.name} className="max-w-full max-h-[80vh] object-contain" />
                </div>
              ) : viewing.mime === "application/pdf" ? (
                <iframe src={viewing.url} title={viewing.name} className="w-full h-[80vh] border-0" />
              ) : (
                <div className="p-8 text-center">
                  <FileText className="h-12 w-12 text-rcc-text-muted mx-auto mb-3" />
                  <p className="text-sm text-rcc-text-secondary mb-3">
                    Preview not available for this file type.
                  </p>
                  <a
                    href={viewing.url}
                    download={viewing.name}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors"
                  >
                    <Download className="h-4 w-4" /> Download
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Certificate Modal */}
      {certOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-rcc-surface rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-rcc-text-primary">Add Certificate</h3>
              <button
                onClick={() => setCertOpen(false)}
                className="p-1.5 rounded-md text-rcc-text-muted hover:bg-rcc-bg hover:text-rcc-text-primary transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Title" required>
                <input type="text" value={certForm.title} onChange={(e) => setCertForm({ ...certForm, title: e.target.value })} className={inputClass} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Issuer">
                  <input type="text" value={certForm.issuer} onChange={(e) => setCertForm({ ...certForm, issuer: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Certificate No.">
                  <input type="text" value={certForm.certificateNo} onChange={(e) => setCertForm({ ...certForm, certificateNo: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Issue Date">
                  <input type="date" value={certForm.issueDate} onChange={(e) => setCertForm({ ...certForm, issueDate: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Expiry Date">
                  <input type="date" value={certForm.expiryDate} onChange={(e) => setCertForm({ ...certForm, expiryDate: e.target.value })} className={inputClass} />
                </Field>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setCertOpen(false)}
                className="px-4 py-2 rounded-md text-sm font-medium border border-rcc-border text-rcc-text-secondary hover:bg-rcc-bg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCert}
                className="px-4 py-2 rounded-md text-sm font-semibold bg-rcc-primary text-rcc-primary-foreground hover:bg-rcc-primary/90 transition-colors"
              >
                Add Certificate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmState && (
        <ConfirmDialog
          open={confirmState.open}
          title={confirmState.title}
          message={confirmState.message}
          variant={confirmState.variant}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

function Building2Icon({ className }: { className?: string }) {
  return <Briefcase className={className} />;
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-rcc-text-muted mt-0.5 shrink-0" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-rcc-text-muted uppercase tracking-wide">{label}</dt>
        <dd className="text-sm text-rcc-text-primary mt-0.5 break-words">{value || <span className="text-rcc-text-muted">-</span>}</dd>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-rcc-text-secondary mb-1.5">
        {label}
        {required && <span className="text-rcc-error ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-rcc-text-muted mt-1">{hint}</p>}
    </div>
  );
}

function EditField({
  icon: Icon,
  label,
  type,
  value,
  onChange,
  disabled,
}: {
  icon: typeof Mail;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-rcc-text-muted mt-2 shrink-0" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-semibold text-rcc-text-muted uppercase tracking-wide mb-1">{label}</dt>
        {type === "select" ? (
          <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40 disabled:opacity-50 disabled:cursor-not-allowed">
            {["", "Male", "Female"].map((o) => (
              <option key={o} value={o}>{o || "-"}</option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        )}
        {disabled && (
          <p className="text-[10px] text-rcc-text-muted mt-1">Only administrators can change this field.</p>
        )}
      </div>
    </div>
  );
}

function SelectField({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-rcc-text-muted mt-2 shrink-0" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-semibold text-rcc-text-muted uppercase tracking-wide mb-1">{label}</dt>
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 bg-rcc-bg border border-rcc-border rounded-md text-sm text-rcc-text-primary focus:outline-none focus:ring-2 focus:ring-rcc-accent/40">
          {options.map((o) => (
            <option key={o} value={o}>{o || "-"}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Suppress unused-import warnings
void AlertTriangle;
