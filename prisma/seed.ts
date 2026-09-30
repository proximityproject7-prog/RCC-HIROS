// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Comprehensive Seed
// Creates groups, roles, employees, leave types/balances/requests,
// evaluation forms/criteria/periods/evaluations, attendance,
// employee certificates, system settings, and audit logs.
// ═══════════════════════════════════════════════════════════════

import { db as prisma } from "../src/lib/db";
import type { EvaluationCriterion } from "../src/generated/prisma/client";
import { hash } from "bcryptjs";

const DEFAULT_PASSWORD = "RCC2026!";
const YEAR = 2026;

// ───────────────────────────────────────────────────────────────
// Permission sets per role — single source of truth lives in
// prisma/permission-sets.ts (shared with scripts/sync-permissions.ts)
// ───────────────────────────────────────────────────────────────
import {
  ALL_PERMISSIONS,
  ACCOUNTANT_PERMS,
  HR_PERMS,
  DEAN_PERMS,
  IT_STAFF_PERMS,
  PROFESSOR_PERMS,
  HR_ASSISTANT_PERMS,
} from "./permission-sets";

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

async function upsertRole(
  name: string,
  description: string,
  opts: {
    scopeAllProfiling?: boolean;
    scopeAllEvaluation?: boolean;
    scopeAllLeave?: boolean;
    scopeAllReports?: boolean;
    scopeAllAttendance?: boolean;
    scopeGroupAttendance?: boolean;
    canSelfApproveLeave?: boolean;
    canChangePassword?: boolean;
    canManageBiometrics?: boolean;
    isSystem?: boolean;
  },
  permissions: string[]
) {
  const role = await prisma.role.upsert({
    where: { name },
    update: {
      description,
      scopeAllProfiling: opts.scopeAllProfiling ?? false,
      scopeAllEvaluation: opts.scopeAllEvaluation ?? false,
      scopeAllLeave: opts.scopeAllLeave ?? false,
      scopeAllReports: opts.scopeAllReports ?? false,
      scopeAllAttendance: opts.scopeAllAttendance ?? false,
      scopeGroupAttendance: opts.scopeGroupAttendance ?? false,
      canSelfApproveLeave: opts.canSelfApproveLeave ?? false,
      canChangePassword: opts.canChangePassword ?? false,
      canManageBiometrics: opts.canManageBiometrics ?? false,
      isSystem: opts.isSystem ?? false,
      active: true,
    },
    create: {
      name,
      description,
      scopeAllProfiling: opts.scopeAllProfiling ?? false,
      scopeAllEvaluation: opts.scopeAllEvaluation ?? false,
      scopeAllLeave: opts.scopeAllLeave ?? false,
      scopeAllReports: opts.scopeAllReports ?? false,
      scopeAllAttendance: opts.scopeAllAttendance ?? false,
      scopeGroupAttendance: opts.scopeGroupAttendance ?? false,
      canSelfApproveLeave: opts.canSelfApproveLeave ?? false,
      canChangePassword: opts.canChangePassword ?? false,
      canManageBiometrics: opts.canManageBiometrics ?? false,
      isSystem: opts.isSystem ?? false,
      active: true,
    },
  });

  // Wipe & rebuild permissions
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: permissions.map((identifier) => ({
      roleId: role.id,
      identifier,
      granted: true,
    })),
  });

  return role;
}

/** Build a Date relative to today for realistic demo data. */
function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Build a Date with specific time on a day relative to today. */
function dayTime(daysFromNowVal: number, hours: number, minutes = 0): Date {
  const d = daysFromNow(daysFromNowVal);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// ───────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding RCC-HIROS database...");

  // ═════════════════════════════════════════════════════════════
  // 1. Groups
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating groups...");
  const accounting = await prisma.group.upsert({
    where: { code: "ACCT" },
    update: { name: "Accounting", description: "Finance & Accounting Office", active: true },
    create: {
      name: "Accounting",
      code: "ACCT",
      description: "Finance & Accounting Office",
      active: true,
    },
  });
  const ccs = await prisma.group.upsert({
    where: { code: "CCS" },
    update: { name: "College of Computer Studies", description: "CCS faculty & staff", active: true },
    create: {
      name: "College of Computer Studies",
      code: "CCS",
      description: "CCS faculty & staff",
      active: true,
    },
  });
  const hr = await prisma.group.upsert({
    where: { code: "HR" },
    update: { name: "Human Resources", description: "HR Office", active: true },
    create: {
      name: "Human Resources",
      code: "HR",
      description: "HR Office",
      active: true,
    },
  });
  const ce = await prisma.group.upsert({
    where: { code: "CE" },
    update: { name: "Civil Engineering", description: "CE faculty & staff", active: true },
    create: {
      name: "Civil Engineering",
      code: "CE",
      description: "CE faculty & staff",
      active: true,
    },
  });

  // ═════════════════════════════════════════════════════════════
  // 2. Roles
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating roles...");
  const systemAdmin = await upsertRole(
    "System Admin",
    "Full system access — bypasses all permission checks",
    {
      scopeAllProfiling: true,
      scopeAllEvaluation: true,
      scopeAllLeave: true,
      scopeAllReports: true,
      scopeAllAttendance: true,
      canSelfApproveLeave: false,
      canChangePassword: true,
      canManageBiometrics: true,
      isSystem: true,
    },
    ALL_PERMISSIONS
  );

  const accountant = await upsertRole(
    "Accountant",
    "Finance office — accounting & payroll, L2 leave approver",
    {
      scopeAllProfiling: true,
      scopeAllEvaluation: true,
      scopeAllLeave: true,
      scopeAllReports: true,
      scopeAllAttendance: true,
      canSelfApproveLeave: true,
      canChangePassword: false,
      isSystem: false,
    },
    ACCOUNTANT_PERMS
  );

  const hrPersonnel = await upsertRole(
    "HR Personnel",
    "HR office — manages employees, leaves, evaluations config",
    {
      scopeAllProfiling: true,
      scopeAllEvaluation: true,
      scopeAllLeave: true,
      scopeAllReports: true,
      scopeAllAttendance: true,
      canSelfApproveLeave: false,
      canChangePassword: true,
      isSystem: false,
    },
    HR_PERMS
  );

  const dean = await upsertRole(
    "Dean",
    "College Dean — L1 leave approver, evaluates faculty",
    {
      scopeAllProfiling: false,
      scopeAllEvaluation: false,
      scopeAllLeave: false,
      scopeAllReports: false,
      scopeAllAttendance: false,
      scopeGroupAttendance: true,
      canSelfApproveLeave: false,
      canChangePassword: false,
      isSystem: false,
    },
    DEAN_PERMS
  );

  const itStaff = await upsertRole(
    "IT Staff",
    "IT office — manages roles, system config, leave types",
    {
      scopeAllProfiling: true,
      scopeAllEvaluation: true,
      scopeAllLeave: true,
      scopeAllReports: true,
      scopeAllAttendance: true,
      canSelfApproveLeave: false,
      canChangePassword: true,
      isSystem: false,
    },
    IT_STAFF_PERMS
  );

  const professor = await upsertRole(
    "Professor",
    "Faculty — clocks in/out, requests leave, views own evaluations",
    {
      scopeAllProfiling: false,
      scopeAllEvaluation: false,
      scopeAllLeave: false,
      scopeAllReports: false,
      scopeAllAttendance: false,
      canSelfApproveLeave: false,
      canChangePassword: false,
      isSystem: false,
    },
    PROFESSOR_PERMS
  );

  const hrAssistant = await upsertRole(
    "HR Assistant",
    "HR support staff — handles basic HR tasks, cannot submit evaluations",
    {
      scopeAllProfiling: false,
      scopeAllEvaluation: false,
      scopeAllLeave: false,
      scopeAllReports: false,
      scopeAllAttendance: false,
      canSelfApproveLeave: false,
      canChangePassword: false,
      isSystem: false,
    },
    HR_ASSISTANT_PERMS
  );

  // ═════════════════════════════════════════════════════════════
  // 3. Employees (password = RCC2026!)
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating employees (password: RCC2026!)...");
  const passwordHash = await hash(DEFAULT_PASSWORD, 10);

  const employees = [
    {
      employeeId: "EMP-0000",
      firstName: "System",
      lastName: "Administrator",
      middleName: null,
      email: "admin@rcc.edu.ph",
      phone: "+63 917 000 0000",
      gender: "Male",
      groupId: null,
      roleId: systemAdmin.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0001",
      firstName: "Jeremiah",
      lastName: "Sawal",
      middleName: "D.",
      email: "jeremiah.sawal@rcc.edu.ph",
      phone: "+63 917 000 0001",
      gender: "Male",
      groupId: hr.id,
      roleId: hrPersonnel.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0002",
      firstName: "Cristina",
      lastName: "Reyes",
      middleName: null,
      email: "cristina.reyes@rcc.edu.ph",
      phone: "+63 917 000 0002",
      gender: "Female",
      groupId: accounting.id,
      roleId: accountant.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0003",
      firstName: "Neil",
      lastName: "Datu",
      middleName: "P.",
      email: "neil.datu@rcc.edu.ph",
      phone: "+63 917 000 0003",
      gender: "Male",
      groupId: ccs.id,
      roleId: dean.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0004",
      firstName: "Leander",
      lastName: "Pamintuan",
      middleName: null,
      email: "leander.pamintuan@rcc.edu.ph",
      phone: "+63 917 000 0004",
      gender: "Male",
      groupId: ccs.id,
      roleId: itStaff.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0005",
      firstName: "Darwin",
      lastName: "Medina",
      middleName: "G.",
      email: "darwin.medina@rcc.edu.ph",
      phone: "+63 917 000 0005",
      gender: "Male",
      groupId: ccs.id,
      roleId: professor.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0006",
      firstName: "Maria",
      lastName: "Santos",
      middleName: "L.",
      email: "maria.santos@rcc.edu.ph",
      phone: "+63 917 000 0006",
      gender: "Female",
      groupId: ccs.id,
      roleId: professor.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0007",
      firstName: "John",
      lastName: "Dela Cruz",
      middleName: null,
      email: "john.delacruz@rcc.edu.ph",
      phone: "+63 917 000 0007",
      gender: "Male",
      groupId: hr.id,
      roleId: hrAssistant.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0008",
      firstName: "Ana",
      lastName: "Gonzales",
      middleName: "R.",
      email: "ana.gonzales@rcc.edu.ph",
      phone: "+63 917 000 0008",
      gender: "Female",
      groupId: accounting.id,
      roleId: accountant.id,
      contractType: "Regular",
    },
    // ── Session-14 expansion: 11 new hires (EMP-0009…EMP-0019) ──
    // Roles for EMP-0009…EMP-0013 assigned by random draw (2026-10-01).
    {
      employeeId: "EMP-0009",
      firstName: "Russel",
      lastName: "Guntang",
      middleName: null,
      email: "russel.guntang@rcc.edu.ph",
      phone: "+63 917 000 0009",
      gender: "Male",
      groupId: hr.id,
      roleId: hrPersonnel.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0010",
      firstName: "Raven",
      lastName: "Pangilinan",
      middleName: null,
      email: "raven.pangilinan@rcc.edu.ph",
      phone: "+63 917 000 0010",
      gender: "Male",
      groupId: ccs.id,
      roleId: itStaff.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0011",
      firstName: "Lattrel",
      lastName: "Reyes",
      middleName: "J.",
      email: "lattrel.reyes@rcc.edu.ph",
      phone: "+63 917 000 0011",
      gender: "Male",
      groupId: ccs.id,
      roleId: professor.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0012",
      firstName: "Jerome",
      lastName: "De Leon",
      middleName: null,
      email: "jerome.deleon@rcc.edu.ph",
      phone: "+63 917 000 0012",
      gender: "Male",
      groupId: accounting.id,
      roleId: accountant.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0013",
      firstName: "Daenielle",
      lastName: "Toribio",
      middleName: null,
      email: "daenielle.toribio@rcc.edu.ph",
      phone: "+63 917 000 0013",
      gender: "Male",
      groupId: hr.id,
      roleId: hrAssistant.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0014",
      firstName: "Marco",
      lastName: "Villanueva",
      middleName: "S.",
      email: "marco.villanueva@rcc.edu.ph",
      phone: "+63 917 000 0014",
      gender: "Male",
      groupId: ce.id,
      roleId: dean.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0015",
      firstName: "Sofia",
      lastName: "Ramos",
      middleName: "M.",
      email: "sofia.ramos@rcc.edu.ph",
      phone: "+63 917 000 0015",
      gender: "Female",
      groupId: ce.id,
      roleId: professor.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0016",
      firstName: "Elena",
      lastName: "Cruz",
      middleName: "D.",
      email: "elena.cruz@rcc.edu.ph",
      phone: "+63 917 000 0016",
      gender: "Female",
      groupId: ce.id,
      roleId: professor.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0017",
      firstName: "Paolo",
      lastName: "Aquino",
      middleName: "R.",
      email: "paolo.aquino@rcc.edu.ph",
      phone: "+63 917 000 0017",
      gender: "Male",
      groupId: ccs.id,
      roleId: professor.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0018",
      firstName: "Grace",
      lastName: "Lim",
      middleName: "T.",
      email: "grace.lim@rcc.edu.ph",
      phone: "+63 917 000 0018",
      gender: "Female",
      groupId: accounting.id,
      roleId: accountant.id,
      contractType: "Regular",
    },
    {
      employeeId: "EMP-0019",
      firstName: "Isabel",
      lastName: "Navarro",
      middleName: "C.",
      email: "isabel.navarro@rcc.edu.ph",
      phone: "+63 917 000 0019",
      gender: "Female",
      groupId: ccs.id,
      roleId: professor.id,
      contractType: "Regular",
    },
  ];

  const createdEmployees: Record<string, string> = {}; // employeeId -> db id
  for (const emp of employees) {
    const created = await prisma.employee.upsert({
      where: { employeeId: emp.employeeId },
      update: {
        firstName: emp.firstName,
        lastName: emp.lastName,
        middleName: emp.middleName,
        email: emp.email,
        phone: emp.phone,
        gender: emp.gender,
        groupId: emp.groupId,
        roleId: emp.roleId,
        contractType: emp.contractType,
        active: true,
        passwordHash,
        mustChangePwd: false,
      },
      create: {
        employeeId: emp.employeeId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        middleName: emp.middleName,
        email: emp.email,
        phone: emp.phone,
        gender: emp.gender,
        groupId: emp.groupId,
        roleId: emp.roleId,
        contractType: emp.contractType,
        active: true,
        passwordHash,
        mustChangePwd: false,
        hireDate: new Date(`${YEAR}-01-01T00:00:00.000Z`),
      },
    });
    createdEmployees[emp.employeeId] = created.id;
  }

  // ═════════════════════════════════════════════════════════════
  // 4. Contract types
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating contract types...");
  const regularCT = await prisma.contractType.upsert({
    where: { code: "REG" },
    update: { name: "Regular", active: true },
    create: { name: "Regular", code: "REG", active: true },
  });
  const contractualCT = await prisma.contractType.upsert({
    where: { code: "CTR" },
    update: { name: "Contractual", active: true },
    create: { name: "Contractual", code: "CTR", active: true },
  });
  const partTimeCT = await prisma.contractType.upsert({
    where: { code: "PT" },
    update: { name: "Part-Time", active: true },
    create: { name: "Part-Time", code: "PT", active: true },
  });
  console.log("  ✓ Contract types seeded: REG, CTR, PT");

  // ═════════════════════════════════════════════════════════════
  // 5. Leave types
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating leave types...");
  const sickLeave = await prisma.leaveType.upsert({
    where: { code: "SL" },
    update: { name: "Sick Leave", defaultDays: 10, active: true },
    create: { name: "Sick Leave", code: "SL", defaultDays: 10, active: true },
  });
  const vacationLeave = await prisma.leaveType.upsert({
    where: { code: "VL" },
    update: { name: "Vacation Leave", defaultDays: 15, active: true },
    create: { name: "Vacation Leave", code: "VL", defaultDays: 15, active: true },
  });
  const emergencyLeave = await prisma.leaveType.upsert({
    where: { code: "EL" },
    update: { name: "Emergency Leave", defaultDays: 5, active: true },
    create: { name: "Emergency Leave", code: "EL", defaultDays: 5, active: true },
  });
  const leaveTypes = [sickLeave, vacationLeave, emergencyLeave];

  // ═════════════════════════════════════════════════════════════
  // 5. Leave balances — all 20 employees × 3 types × 2026
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating leave balances...");
  await prisma.leaveBalance.deleteMany({});

  const leaveUsedDays: Record<string, Record<string, number>> = {
    // employeeId -> { leaveTypeCode -> usedDays }
    "EMP-0001": { SL: 2, VL: 3, EL: 0 },
    "EMP-0002": { SL: 0, VL: 2, EL: 1 },
    "EMP-0003": { SL: 1, VL: 5, EL: 0 },
    "EMP-0004": { SL: 0, VL: 1, EL: 0 },
    "EMP-0005": { SL: 4, VL: 5, EL: 1 },
    "EMP-0006": { SL: 1, VL: 0, EL: 0 },
    "EMP-0007": { SL: 0, VL: 2, EL: 1 },
    "EMP-0008": { SL: 2, VL: 0, EL: 0 },
    "EMP-0009": { SL: 1, VL: 2, EL: 0 },
    "EMP-0010": { SL: 0, VL: 0, EL: 0 },
    "EMP-0011": { SL: 3, VL: 1, EL: 0 },
    "EMP-0012": { SL: 0, VL: 4, EL: 2 },
    "EMP-0013": { SL: 1, VL: 0, EL: 0 },
    "EMP-0014": { SL: 2, VL: 6, EL: 1 },
    "EMP-0015": { SL: 0, VL: 3, EL: 0 },
    "EMP-0016": { SL: 1, VL: 1, EL: 0 },
    "EMP-0017": { SL: 0, VL: 0, EL: 1 },
    "EMP-0018": { SL: 2, VL: 2, EL: 0 },
    "EMP-0019": { SL: 0, VL: 1, EL: 0 },
  };

  for (const emp of employees) {
    for (const lt of leaveTypes) {
      const used = leaveUsedDays[emp.employeeId]?.[lt.code] ?? 0;
      await prisma.leaveBalance.create({
        data: {
          employeeId: createdEmployees[emp.employeeId],
          leaveTypeId: lt.id,
          year: YEAR,
          totalDays: lt.defaultDays,
          usedDays: used,
        },
      });
    }
  }

  // ═════════════════════════════════════════════════════════════
  // 6. Leave requests — showcase ALL workflow states
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating leave requests (all workflow states)...");
  await prisma.leaveApproval.deleteMany({});
  await prisma.leaveRequest.deleteMany({});

  const profId = createdEmployees["EMP-0005"]; // Darwin (Professor)
  const prof2Id = createdEmployees["EMP-0006"]; // Maria (Professor)
  const deanId = createdEmployees["EMP-0003"]; // Neil (Dean)
  const hrId = createdEmployees["EMP-0001"]; // Jeremiah (HR)
  const acctId = createdEmployees["EMP-0002"]; // Cristina (Accountant)
  const hrStaffId = createdEmployees["EMP-0007"]; // John (HR Staff)
  const acctStaffId = createdEmployees["EMP-0008"]; // Ana (Accounting Staff)
  const itStaffId = createdEmployees["EMP-0004"]; // Leander (IT Staff)
  const ceDeanId = createdEmployees["EMP-0014"]; // Marco (Dean, CE)
  const lattrelId = createdEmployees["EMP-0011"]; // Lattrel (Professor, CCS)
  const sofiaId = createdEmployees["EMP-0015"]; // Sofia (Professor, CE)
  const elenaId = createdEmployees["EMP-0016"]; // Elena (Professor, CE)
  const paoloId = createdEmployees["EMP-0017"]; // Paolo (Professor, CCS)
  const daenielleId = createdEmployees["EMP-0013"]; // Daenielle (HR Assistant)
  const jeromeId = createdEmployees["EMP-0012"]; // Jerome (Accountant, self-approve)

  // ── (1) Draft — Ana, Vacation Leave, 3 days, not yet submitted ──
  await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0001",
      employeeId: acctStaffId,
      leaveTypeId: vacationLeave.id,
      startDate: daysFromNow(14),
      endDate: daysFromNow(16),
      workdays: 3,
      reason: "Planning a weekend trip to Baguio with family.",
      status: "draft",
    },
  });

  // ── (2) Pending L1 — Darwin, Sick Leave, 2 days, awaiting Dean ──
  const lr2 = await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0002",
      employeeId: profId,
      leaveTypeId: sickLeave.id,
      startDate: daysFromNow(3),
      endDate: daysFromNow(4),
      workdays: 2,
      reason: "Flu symptoms — advised bed rest by physician.",
      status: "pending_l1",
    },
  });

  // ── (3) Pending L2 — Maria, Vacation Leave, 5 days, Dean approved, awaiting HR ──
  const lr3 = await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0003",
      employeeId: prof2Id,
      leaveTypeId: vacationLeave.id,
      startDate: daysFromNow(10),
      endDate: daysFromNow(14),
      workdays: 5,
      reason: "Family vacation — planned since December.",
      status: "pending_l2",
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr3.id,
      level: 1,
      approverId: deanId,
      status: "approved",
      remarks: "Approved — coverage arranged with other faculty.",
      actedAt: dayTime(-5, 10, 0),
    },
  });

  // ── (4) Approved — Cristina, Emergency Leave, 1 day (self-approved via Accountant role) ──
  const lr4 = await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0004",
      employeeId: acctId,
      leaveTypeId: emergencyLeave.id,
      startDate: daysFromNow(-30),
      endDate: daysFromNow(-30),
      workdays: 1,
      reason: "Family emergency — urgent household matter.",
      status: "approved",
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr4.id,
      level: 1,
      approverId: acctId,
      status: "approved",
      remarks: "Self-approved (Accountant role).",
      actedAt: dayTime(-31, 9, 0),
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr4.id,
      level: 2,
      approverId: acctId,
      status: "approved",
      remarks: "Self-approved (Accountant role).",
      actedAt: dayTime(-31, 9, 0),
    },
  });

  // ── (5) Rejected — Darwin, Emergency Leave, 1 day, rejected by Dean ──
  const lr5 = await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0005",
      employeeId: profId,
      leaveTypeId: emergencyLeave.id,
      startDate: daysFromNow(-60),
      endDate: daysFromNow(-60),
      workdays: 1,
      reason: "Personal matter.",
      status: "rejected",
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr5.id,
      level: 1,
      approverId: deanId,
      status: "rejected",
      remarks: "Insufficient detail. Please resubmit with documentation.",
      actedAt: dayTime(-61, 14, 0),
    },
  });

  // ── (6) Cancelled — John, Vacation Leave, 2 days, withdrawn by requester ──
  await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0006",
      employeeId: hrStaffId,
      leaveTypeId: vacationLeave.id,
      startDate: daysFromNow(-45),
      endDate: daysFromNow(-44),
      workdays: 2,
      reason: "Planned staycation — no longer pushing through.",
      status: "cancelled",
    },
  });

  // ── (7) Approved — Leander, Vacation Leave, 3 days (standard approval) ──
  const lr7 = await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0007",
      employeeId: itStaffId,
      leaveTypeId: vacationLeave.id,
      startDate: daysFromNow(20),
      endDate: daysFromNow(22),
      workdays: 3,
      reason: "Attending a tech conference in Manila.",
      status: "approved",
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr7.id,
      level: 1,
      approverId: deanId,
      status: "approved",
      remarks: "Approved — no conflict with schedule.",
      actedAt: dayTime(-2, 11, 30),
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr7.id,
      level: 2,
      approverId: hrId,
      status: "approved",
      remarks: "Approved — ensure proper handoff.",
      actedAt: dayTime(-1, 9, 15),
    },
  });

  // ── (8) Pending L1 — John, Sick Leave, 1 day, awaiting Dean (cross-group) ──
  const lr8 = await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0008",
      employeeId: hrStaffId,
      leaveTypeId: sickLeave.id,
      startDate: daysFromNow(1),
      endDate: daysFromNow(1),
      workdays: 1,
      reason: "Medical check-up scheduled.",
      status: "pending_l1",
    },
  });

  // ── Session-14 expansion: requests from the new hires ──

  // ── (9) Pending L1 — Lattrel, Sick Leave, 2 days, awaiting Dean (CCS) ──
  await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0009",
      employeeId: lattrelId,
      leaveTypeId: sickLeave.id,
      startDate: daysFromNow(2),
      endDate: daysFromNow(3),
      workdays: 2,
      reason: "Down with the flu — resting at home per doctor's advice.",
      status: "pending_l1",
    },
  });

  // ── (10) Pending L2 — Sofia, Vacation Leave, 4 days, CE Dean approved ──
  const lr10 = await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0010",
      employeeId: sofiaId,
      leaveTypeId: vacationLeave.id,
      startDate: daysFromNow(21),
      endDate: daysFromNow(24),
      workdays: 4,
      reason: "Family trip to El Nido — bookings already made.",
      status: "pending_l2",
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr10.id,
      level: 1,
      approverId: ceDeanId,
      status: "approved",
      remarks: "Approved — lab sessions covered by Elena.",
      actedAt: dayTime(-3, 10, 30),
    },
  });

  // ── (11) Approved — Elena, Emergency Leave, 2 days (CE Dean + HR) ──
  const lr11 = await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0011",
      employeeId: elenaId,
      leaveTypeId: emergencyLeave.id,
      startDate: daysFromNow(-20),
      endDate: daysFromNow(-19),
      workdays: 2,
      reason: "Typhoon damage at home — needed to oversee repairs.",
      status: "approved",
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr11.id,
      level: 1,
      approverId: ceDeanId,
      status: "approved",
      remarks: "Approved — calamity-related.",
      actedAt: dayTime(-21, 9, 0),
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr11.id,
      level: 2,
      approverId: hrId,
      status: "approved",
      remarks: "Approved.",
      actedAt: dayTime(-20, 13, 45),
    },
  });

  // ── (12) Pending L1 — Daenielle, Sick Leave, 1 day, awaiting HR head ──
  await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0012",
      employeeId: daenielleId,
      leaveTypeId: sickLeave.id,
      startDate: daysFromNow(5),
      endDate: daysFromNow(5),
      workdays: 1,
      reason: "Dental surgery scheduled — one day recovery.",
      status: "pending_l1",
    },
  });

  // ── (13) Rejected — Paolo, Emergency Leave, 1 day, rejected by Dean ──
  const lr13 = await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0013",
      employeeId: paoloId,
      leaveTypeId: emergencyLeave.id,
      startDate: daysFromNow(-50),
      endDate: daysFromNow(-50),
      workdays: 1,
      reason: "Attending a friend's wedding out of town.",
      status: "rejected",
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr13.id,
      level: 1,
      approverId: deanId,
      status: "rejected",
      remarks: "Emergency leave is for genuine emergencies — please file VL instead.",
      actedAt: dayTime(-51, 15, 20),
    },
  });

  // ── (14) Approved — Jerome, Vacation Leave, 3 days (self-approved via Accountant role) ──
  const lr14 = await prisma.leaveRequest.create({
    data: {
      requestNo: "LR-0014",
      employeeId: jeromeId,
      leaveTypeId: vacationLeave.id,
      startDate: daysFromNow(-40),
      endDate: daysFromNow(-38),
      workdays: 3,
      reason: "Year-end inventory break — short family outing.",
      status: "approved",
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr14.id,
      level: 1,
      approverId: jeromeId,
      status: "approved",
      remarks: "Self-approved (Accountant role).",
      actedAt: dayTime(-41, 8, 30),
    },
  });
  await prisma.leaveApproval.create({
    data: {
      leaveRequestId: lr14.id,
      level: 2,
      approverId: jeromeId,
      status: "approved",
      remarks: "Self-approved (Accountant role).",
      actedAt: dayTime(-41, 8, 30),
    },
  });

  // ═════════════════════════════════════════════════════════════
  // 7. Evaluation form + 10 default criteria (5 categories × 2)
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating evaluation form + criteria...");
  const evalForm = await prisma.evaluationForm.upsert({
    where: { id: "eval-form-faculty-2026" },
    update: { name: "Faculty Evaluation 2026", version: 1, active: true },
    create: {
      id: "eval-form-faculty-2026",
      name: "Faculty Evaluation 2026",
      version: 1,
      active: true,
    },
  });

  const defaultCriteria: Array<{
    category: string;
    description: string;
    weight: number;
    sortOrder: number;
  }> = [
    // I. Communication Skills (4 items)
    {
      category: "I. Communication Skills",
      description: "Pronounces words clearly and distinctly.",
      weight: 1.0,
      sortOrder: 1,
    },
    {
      category: "I. Communication Skills",
      description: "Speaks clearly enough to be understood easily.",
      weight: 1.0,
      sortOrder: 2,
    },
    {
      category: "I. Communication Skills",
      description: "Has good command of English or Filipino.",
      weight: 1.0,
      sortOrder: 3,
    },
    {
      category: "I. Communication Skills",
      description: "Has a well-modulated voice.",
      weight: 1.0,
      sortOrder: 4,
    },
    // II. Instructional Skills (7 items)
    {
      category: "II. Instructional Skills",
      description: "Uses a variety of methods and techniques to facilitate learning.",
      weight: 1.0,
      sortOrder: 5,
    },
    {
      category: "II. Instructional Skills",
      description: "Presents the subject matter clearly and systematically.",
      weight: 1.0,
      sortOrder: 6,
    },
    {
      category: "II. Instructional Skills",
      description: "Adjusts to the students' learning pace without sacrificing completeness of the course.",
      weight: 1.0,
      sortOrder: 7,
    },
    {
      category: "II. Instructional Skills",
      description: "Provokes critical, creative, and reflective thinking.",
      weight: 1.0,
      sortOrder: 8,
    },
    {
      category: "II. Instructional Skills",
      description: "Encourages students' active participation in the discussions.",
      weight: 1.0,
      sortOrder: 9,
    },
    {
      category: "II. Instructional Skills",
      description: "Uses teaching aids/devices like illustrations, diagrams, etc.",
      weight: 1.0,
      sortOrder: 10,
    },
    {
      category: "II. Instructional Skills",
      description: "Elicits correct responses through skillful questioning.",
      weight: 1.0,
      sortOrder: 11,
    },
    // III. Knowledge of the Subject-Matter (5 items)
    {
      category: "III. Knowledge of the Subject-Matter",
      description: "Discusses the lesson with mastery.",
      weight: 1.0,
      sortOrder: 12,
    },
    {
      category: "III. Knowledge of the Subject-Matter",
      description: "Follows the course syllabus.",
      weight: 1.0,
      sortOrder: 13,
    },
    {
      category: "III. Knowledge of the Subject-Matter",
      description: "Relates subject matter to other subjects and to previous knowledge and experiences.",
      weight: 1.0,
      sortOrder: 14,
    },
    {
      category: "III. Knowledge of the Subject-Matter",
      description: "Relates subject matter to the vision, mission, and objectives of the college.",
      weight: 1.0,
      sortOrder: 15,
    },
    {
      category: "III. Knowledge of the Subject-Matter",
      description: "Integrates values in the lessons.",
      weight: 1.0,
      sortOrder: 16,
    },
    // IV. Classroom Management (6 items)
    {
      category: "IV. Classroom Management",
      description: "Maintains class discipline.",
      weight: 1.0,
      sortOrder: 17,
    },
    {
      category: "IV. Classroom Management",
      description: "Sees to it that the room is clean and orderly.",
      weight: 1.0,
      sortOrder: 18,
    },
    {
      category: "IV. Classroom Management",
      description: "Comes to class on time.",
      weight: 1.0,
      sortOrder: 19,
    },
    {
      category: "IV. Classroom Management",
      description: "Dismisses class on time.",
      weight: 1.0,
      sortOrder: 20,
    },
    {
      category: "IV. Classroom Management",
      description: "Is always present in class.",
      weight: 1.0,
      sortOrder: 21,
    },
    {
      category: "IV. Classroom Management",
      description: "Enforces school rules and regulations consistently.",
      weight: 1.0,
      sortOrder: 22,
    },
    // V. Professional Qualities (5 items)
    {
      category: "V. Professional Qualities",
      description: "Respects students' opinions.",
      weight: 1.0,
      sortOrder: 23,
    },
    {
      category: "V. Professional Qualities",
      description: "Maintains good working relations with students.",
      weight: 1.0,
      sortOrder: 24,
    },
    {
      category: "V. Professional Qualities",
      description: "Is fair in giving grades.",
      weight: 1.0,
      sortOrder: 25,
    },
    {
      category: "V. Professional Qualities",
      description: "Is firm and consistent — strict but reasonable in dealing with students.",
      weight: 1.0,
      sortOrder: 26,
    },
    {
      category: "V. Professional Qualities",
      description: "Returns corrected test papers and projects promptly.",
      weight: 1.0,
      sortOrder: 27,
    },
    // VI. Personal Qualities (3 items)
    {
      category: "VI. Personal Qualities",
      description: "Dresses neatly and appropriately.",
      weight: 1.0,
      sortOrder: 28,
    },
    {
      category: "VI. Personal Qualities",
      description: "Demonstrates calmness and poise.",
      weight: 1.0,
      sortOrder: 29,
    },
    {
      category: "VI. Personal Qualities",
      description: "Is physically and mentally fit to teach.",
      weight: 1.0,
      sortOrder: 30,
    },
    // VII. Classwork Design (For Online Classroom) (4 items)
    {
      category: "VII. Classwork Design (For Online Classroom)",
      description: "Presents an instructional plan/syllabus geared towards the attainment of learning outcomes.",
      weight: 1.0,
      sortOrder: 31,
    },
    {
      category: "VII. Classwork Design (For Online Classroom)",
      description: "Uses modules to organize classwork content.",
      weight: 1.0,
      sortOrder: 32,
    },
    {
      category: "VII. Classwork Design (For Online Classroom)",
      description: "Provides equal access of learning materials to all students.",
      weight: 1.0,
      sortOrder: 33,
    },
    {
      category: "VII. Classwork Design (For Online Classroom)",
      description: "Organizes assignments, activities and related due dates.",
      weight: 1.0,
      sortOrder: 34,
    },
  ];

  // Replace existing criteria
  await prisma.evaluationResponse.deleteMany({});
  await prisma.evaluation.deleteMany({});
  await prisma.evaluationCriterion.deleteMany({ where: { formId: evalForm.id } });
  const createdCriteria: EvaluationCriterion[] = [];
  for (const c of defaultCriteria) {
    const criterion = await prisma.evaluationCriterion.create({
      data: {
        formId: evalForm.id,
        category: c.category,
        description: c.description,
        maxScore: 5,
        weight: c.weight,
        sortOrder: c.sortOrder,
      },
    });
    createdCriteria.push(criterion);
  }

  // ═════════════════════════════════════════════════════════════
  // 8. Evaluation periods — open (current) + closed (archived)
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating evaluation periods...");
  await prisma.evaluationPeriod.deleteMany({});

  // Closed period: 2nd Semester 2025 (Nov 2025 - Mar 2026)
  const closedPeriod = await prisma.evaluationPeriod.create({
    data: {
      id: "eval-period-2s-2025",
      formId: evalForm.id,
      name: "2nd Semester 2025",
      startDate: new Date("2025-11-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
      status: "closed",
    },
  });

  // Open period: 1st Semester 2026 (Jun 2026 - Oct 2026)
  const openPeriod = await prisma.evaluationPeriod.create({
    data: {
      id: "eval-period-1s-2026",
      formId: evalForm.id,
      name: "1st Semester 2026",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-10-31T00:00:00.000Z"),
      status: "open",
    },
  });

  // ═════════════════════════════════════════════════════════════
  // 9. Evaluation submissions
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating evaluation submissions...");

  /** Helper: create an evaluation with responses giving a target average score. */
  async function createEvaluation(
    periodId: string,
    employeeId: string,
    evaluatorId: string,
    targetAvg: number,
    remarks: string | null,
    submitted: boolean,
    submittedDate?: Date
  ) {
    // Generate whole number scores (1-5) averaging to targetAvg
    const count = createdCriteria.length;
    const targetSum = Math.round(targetAvg * count);
    const scores: number[] = Array(count).fill(Math.floor(targetAvg));
    let currentSum = Math.floor(targetAvg) * count;
    while (currentSum < targetSum) {
      const idx = Math.floor(Math.random() * count);
      if (scores[idx] < 5) { scores[idx]++; currentSum++; }
    }
    while (currentSum > targetSum) {
      const idx = Math.floor(Math.random() * count);
      if (scores[idx] > 1) { scores[idx]--; currentSum--; }
    }
    // Shuffle to avoid first criteria always being the same value
    for (let i = scores.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [scores[i], scores[j]] = [scores[j], scores[i]];
    }

    const totalWeight = createdCriteria.reduce((sum, c) => sum + c.weight, 0);
    const weightedSum = createdCriteria.reduce(
      (sum, c, i) => sum + c.weight * scores[i],
      0
    );
    const totalScore = Number((weightedSum / totalWeight).toFixed(2));

    const ev = await prisma.evaluation.create({
      data: {
        periodId,
        formId: evalForm.id,
        evaluatorId,
        employeeId,
        status: submitted ? "submitted" : "draft",
        totalScore: submitted ? totalScore : null,
        remarks,
        submittedAt: submitted ? submittedDate ?? new Date() : null,
        responses: {
          create: createdCriteria.map((c, i) => ({
            criterionId: c.id,
            score: scores[i],
            comments: i % 3 === 0 ? "Consistently performs well in this area." : null,
          })),
        },
      },
    });
    return ev;
  }

  // ── Closed period evaluations (archived) ──

  // Dean → Darwin (4.20) — submitted last semester
  await createEvaluation(
    closedPeriod.id,
    profId,
    deanId,
    4.2,
    "I have observed consistent improvement in classroom management and teaching delivery. The use of visual aids has made complex topics more accessible.\n\n---\n\nRecommend that the school invest in more modern teaching equipment such as projectors and smart boards to further enhance learning.",
    true,
    new Date("2026-03-20T14:30:00.000Z")
  );

  // Dean → Maria (4.50) — submitted last semester
  await createEvaluation(
    closedPeriod.id,
    prof2Id,
    deanId,
    4.5,
    "Excellent teaching skills. Students are highly engaged and perform well. Maria goes above and beyond in preparing lesson materials.\n\n---\n\nThe faculty room could use better ventilation and more comfortable seating for collaborative work.",
    true,
    new Date("2026-03-25T11:00:00.000Z")
  );

  // ── Open period evaluations (current) ──

  // Dean → Darwin (4.50) — submitted this semester
  await createEvaluation(
    openPeriod.id,
    profId,
    deanId,
    4.5,
    "Darwin continues to demonstrate strong instructional skills. Student feedback has been consistently positive this semester.\n\n---\n\nSuggest allocating more budget for faculty development seminars and workshops.",
    true,
    dayTime(-15, 14, 30)
  );

  // Dean → Maria — still draft (not yet submitted)
  await createEvaluation(
    openPeriod.id,
    prof2Id,
    deanId,
    4.0,
    null,
    false
  );

  // ── Session-14 expansion: CE evaluations (Marco evaluates CE faculty) ──

  // Marco → Sofia (4.30) — submitted last semester
  await createEvaluation(
    closedPeriod.id,
    sofiaId,
    ceDeanId,
    4.3,
    "Sofia handles the CE laboratory subjects with admirable patience. Students consistently praise her step-by-step demonstrations.\n\n---\n\nThe hydraulics lab equipment needs calibration before the next semester.",
    true,
    new Date("2026-03-22T10:00:00.000Z")
  );

  // Marco → Elena (4.60) — submitted this semester
  await createEvaluation(
    openPeriod.id,
    elenaId,
    ceDeanId,
    4.6,
    "Elena's structural analysis classes have the highest passing rate in the department. Her board-exam review sessions are well attended.",
    true,
    dayTime(-10, 15, 0)
  );

  // Dean → Lattrel — still draft (not yet submitted)
  await createEvaluation(
    openPeriod.id,
    lattrelId,
    deanId,
    4.0,
    null,
    false
  );

  // ═════════════════════════════════════════════════════════════
  // 10. Attendance records — multiple days with various states
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating attendance records...");
  await prisma.attendance.deleteMany({});

  // Premises coordinates (Angeles campus)
  const campusLat = 15.1428;
  const campusLng = 120.5886;

  // Attendance data: employeeIds with clock patterns for different days
  // Each entry: [dayOffset, empId, clockInHour, clockInMin, clockedOut, clockOutHour, clockOutMin]
  const attendanceData: Array<[number, string, number, number, boolean, number, number]> = [
    // Today
    [0, "EMP-0001", 7, 55, true, 17, 5],
    [0, "EMP-0002", 8, 2, true, 17, 10],
    [0, "EMP-0003", 8, 15, false, 0, 0],
    [0, "EMP-0005", 9, 5, false, 0, 0],
    [0, "EMP-0007", 8, 30, true, 17, 30],
    [0, "EMP-0008", 8, 45, true, 17, 15],
    // Yesterday
    [-1, "EMP-0001", 7, 50, true, 17, 8],
    [-1, "EMP-0002", 8, 5, true, 17, 12],
    [-1, "EMP-0003", 8, 10, true, 17, 5],
    [-1, "EMP-0004", 8, 0, true, 17, 0],
    [-1, "EMP-0005", 9, 10, true, 16, 55],
    // 2 days ago
    [-2, "EMP-0001", 7, 55, true, 17, 2],
    [-2, "EMP-0002", 8, 0, true, 17, 15],
    [-2, "EMP-0005", 9, 0, false, 0, 0],
    // 3 days ago (some people didn't clock in)
    [-3, "EMP-0001", 8, 0, true, 17, 5],
    [-3, "EMP-0002", 8, 15, true, 17, 10],
    [-3, "EMP-0003", 8, 30, true, 17, 30],
    // ── Session-14 expansion: new hires ──
    // Today
    [0, "EMP-0009", 7, 58, true, 17, 3],
    [0, "EMP-0010", 8, 5, false, 0, 0],
    [0, "EMP-0011", 8, 20, true, 17, 10],
    [0, "EMP-0014", 8, 0, true, 17, 30],
    [0, "EMP-0015", 8, 12, false, 0, 0],
    [0, "EMP-0018", 8, 40, true, 17, 20],
    // Yesterday
    [-1, "EMP-0009", 8, 1, true, 17, 5],
    [-1, "EMP-0011", 8, 25, true, 17, 0],
    [-1, "EMP-0012", 8, 10, true, 17, 15],
    [-1, "EMP-0014", 7, 55, true, 17, 5],
    [-1, "EMP-0015", 8, 8, true, 17, 12],
    [-1, "EMP-0016", 8, 35, true, 16, 50],
    [-1, "EMP-0019", 9, 0, true, 17, 0],
    // 2 days ago
    [-2, "EMP-0009", 7, 57, true, 17, 0],
    [-2, "EMP-0013", 8, 22, true, 17, 8],
    [-2, "EMP-0014", 8, 5, true, 17, 20],
    [-2, "EMP-0017", 8, 45, true, 17, 5],
  ];

  // Track which employees have records for which days
  const employeesWithRecords = new Set<string>();

  for (const [offset, empId, ciH, ciM, clockedOut, coH, coM] of attendanceData) {
    const empDbId = createdEmployees[empId];
    if (!empDbId) continue;

    const recordDate = daysFromNow(offset);

    const clockInAt = new Date(recordDate);
    clockInAt.setHours(ciH, ciM, 0, 0);

    const record: Record<string, unknown> = {
      employeeId: empDbId,
      date: recordDate,
      clockInAt,
      clockInLat: campusLat,
      clockInLng: campusLng,
      clockInOnPremise: true,
      clockInDistance: 0,
      biometricVerified: true,
      manuallyEdited: false,
    };

    if (clockedOut) {
      const clockOutAt = new Date(recordDate);
      clockOutAt.setHours(coH, coM, 0, 0);
      record.clockOutAt = clockOutAt;
      record.clockOutLat = campusLat;
      record.clockOutLng = campusLng;
      record.clockOutOnPremise = true;
      record.clockOutDistance = 0;
    }

    await prisma.attendance.create({ data: record as never });
    employeesWithRecords.add(empId);
  }

  // ═════════════════════════════════════════════════════════════
  // 11. Employee certificates
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating employee certificates...");
  await prisma.employeeCertificate.deleteMany({});

  const certData = [
    // Darwin (Professor)
    { empId: "EMP-0005", title: "Certified Java Developer", issuer: "Oracle University", certNo: "ORA-JAVA-2024-001", issueDate: new Date("2024-03-15") },
    { empId: "EMP-0005", title: "Teaching Excellence Award", issuer: "RCC Academic Council", certNo: "RCC-TEA-2025-042", issueDate: new Date("2025-06-20") },
    { empId: "EMP-0005", title: "Data Science Fundamentals", issuer: "Coursera / IBM", certNo: "COU-DS-2025-889", issueDate: new Date("2025-01-10") },
    // John (HR Assistant)
    { empId: "EMP-0007", title: "Certified HR Associate", issuer: "HR Philippines", certNo: "HRP-CHRA-2024-556", issueDate: new Date("2024-08-01") },
    { empId: "EMP-0007", title: "Labor Law Seminar 2025", issuer: "DOLE Regional Office", certNo: "DOLE-LLS-2025-112", issueDate: new Date("2025-11-05") },
    // Maria (Professor)
    { empId: "EMP-0006", title: "TESDA Trainers Methodology", issuer: "TESDA", certNo: "TESDA-TM-2024-789", issueDate: new Date("2024-05-22") },
    // Marco (Dean, CE)
    { empId: "EMP-0014", title: "Professional Civil Engineer License", issuer: "PRC", certNo: "PRC-CE-2018-334", issueDate: new Date("2018-05-10") },
    // Sofia (Professor, CE)
    { empId: "EMP-0015", title: "AutoCAD Certified Professional", issuer: "Autodesk", certNo: "ADS-ACAD-2023-221", issueDate: new Date("2023-09-01") },
    // Russel (HR Personnel)
    { empId: "EMP-0009", title: "Certified HR Professional", issuer: "HR Philippines", certNo: "HRP-CHRP-2023-781", issueDate: new Date("2023-06-15") },
  ];

  for (const cert of certData) {
    await prisma.employeeCertificate.create({
      data: {
        employeeId: createdEmployees[cert.empId],
        title: cert.title,
        issuer: cert.issuer,
        certificateNo: cert.certNo,
        issueDate: cert.issueDate,
      },
    });
  }

  // ═════════════════════════════════════════════════════════════
  // 12. System settings — premises config
  // ═════════════════════════════════════════════════════════════
  console.log("• Creating system settings...");
  const premisesValue = JSON.stringify({
    lat: 15.1428,
    lng: 120.5886,
    radiusMeters: 200,
    label: "Republic Central Colleges - Angeles",
  });
  await prisma.systemSetting.upsert({
    where: { key: "premises_config" },
    update: { value: premisesValue, category: "attendance" },
    create: {
      key: "premises_config",
      value: premisesValue,
      category: "attendance",
    },
  });

  // Biometric (fingerprint) login panel — create-if-missing only,
  // so an admin's toggle choice survives reseeds.
  await prisma.systemSetting.upsert({
    where: { key: "biometrics_enabled" },
    update: {},
    create: {
      key: "biometrics_enabled",
      value: "true",
      category: "biometrics",
    },
  });

  // ═════════════════════════════════════════════════════════════
  // Done
  // ═════════════════════════════════════════════════════════════
  console.log("");
  console.log("✅ Seed complete!");
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔑 LOGIN CREDENTIALS (password: RCC2026!)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("EMP-0000 / admin@rcc.edu.ph              → System Admin");
  console.log("EMP-0001 / jeremiah.sawal@rcc.edu.ph     → HR Personnel");
  console.log("EMP-0002 / cristina.reyes@rcc.edu.ph     → Accountant");
  console.log("EMP-0003 / neil.datu@rcc.edu.ph          → Dean (CCS)");
  console.log("EMP-0004 / leander.pamintuan@rcc.edu.ph  → IT Staff");
  console.log("EMP-0005 / darwin.medina@rcc.edu.ph      → Professor");
  console.log("EMP-0006 / maria.santos@rcc.edu.ph       → Professor");
  console.log("EMP-0007 / john.delacruz@rcc.edu.ph      → HR Assistant");
  console.log("EMP-0008 / ana.gonzales@rcc.edu.ph       → Accountant");
  console.log("EMP-0009 / russel.guntang@rcc.edu.ph     → HR Personnel");
  console.log("EMP-0010 / raven.pangilinan@rcc.edu.ph   → IT Staff");
  console.log("EMP-0011 / lattrel.reyes@rcc.edu.ph      → Professor");
  console.log("EMP-0012 / jerome.deleon@rcc.edu.ph      → Accountant");
  console.log("EMP-0013 / daenielle.toribio@rcc.edu.ph  → HR Assistant");
  console.log("EMP-0014 / marco.villanueva@rcc.edu.ph   → Dean (CE)");
  console.log("EMP-0015 / sofia.ramos@rcc.edu.ph        → Professor");
  console.log("EMP-0016 / elena.cruz@rcc.edu.ph         → Professor");
  console.log("EMP-0017 / paolo.aquino@rcc.edu.ph       → Professor");
  console.log("EMP-0018 / grace.lim@rcc.edu.ph          → Accountant");
  console.log("EMP-0019 / isabel.navarro@rcc.edu.ph     → Professor");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("📋 Leave workflow showcase:");
  console.log("  LR-0001 (Ana)          → Draft");
  console.log("  LR-0002 (Darwin)       → Pending L1 (awaiting Dean)");
  console.log("  LR-0003 (Maria)        → Pending L2 (Dean OK'd, awaiting HR)");
  console.log("  LR-0004 (Cristina)     → Approved (self-approved)");
  console.log("  LR-0005 (Darwin)       → Rejected (by Dean)");
  console.log("  LR-0006 (John)         → Cancelled (withdrawn)");
  console.log("  LR-0007 (Leander)      → Approved (standard 2-level)");
  console.log("  LR-0008 (John)         → Pending L1 (awaiting HR head)");
  console.log("  LR-0009 (Lattrel)      → Pending L1 (awaiting CCS Dean)");
  console.log("  LR-0010 (Sofia)        → Pending L2 (CE Dean OK'd, awaiting HR)");
  console.log("  LR-0011 (Elena)        → Approved (CE Dean + HR)");
  console.log("  LR-0012 (Daenielle)    → Pending L1 (awaiting HR head)");
  console.log("  LR-0013 (Paolo)        → Rejected (by CCS Dean)");
  console.log("  LR-0014 (Jerome)       → Approved (self-approved)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("❌ Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
