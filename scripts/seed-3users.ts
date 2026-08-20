import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { hash } from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: "file:./db/custom.db" });
const db = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = "RCC2026!";

// ── Permission sets ──

const HR_PERMS = [
  "dashboard.view",
  "profiling.view", "profiling.view_inactive", "profiling.create", "profiling.edit", "profile.selfEdit", "profile.editAll",
  "attendance.view", "attendance.clock_in", "attendance.edit", "attendance.edit_on_premise",
  "evaluation.view", "evaluation.submit", "evaluation.manage_forms", "evaluation.reset",
  "leave.request", "leave.approve_l2", "leave.view_all", "leave.manage_types",
  "reports.view", "reports.export",
  "groups.view", "groups.manage", "roles.view",
];

const DEAN_PERMS = [
  "dashboard.view",
  "profiling.view", "profile.selfEdit",
  "attendance.view", "attendance.clock_in",
  "evaluation.view", "evaluation.submit",
  "leave.approve_l1", "leave.request",
  "reports.view", "groups.view",
];

const PROFESSOR_PERMS = [
  "dashboard.view",
  "attendance.clock_in", "attendance.view",
  "leave.request",
  "evaluation.view_results",
  "profile.selfEdit",
];

// ── Helpers ──

async function upsertRole(
  name: string,
  description: string,
  opts: {
    scopeAllProfiling?: boolean;
    scopeAllEvaluation?: boolean;
    scopeAllLeave?: boolean;
    scopeAllReports?: boolean;
    scopeAllAttendance?: boolean;
    canSelfApproveLeave?: boolean;
    isSystem?: boolean;
  },
  permissions: string[]
) {
  const role = await db.role.upsert({
    where: { name },
    update: { description, ...opts },
    create: { name, description, ...opts },
  });

  await db.rolePermission.deleteMany({ where: { roleId: role.id } });
  await db.rolePermission.createMany({
    data: permissions.map((identifier) => ({ roleId: role.id, identifier, granted: true })),
  });

  return role;
}

// ── Main ──

async function main() {
  console.log("Seeding RCC-HIROS database (3 users)...");

  // 1. Groups
  console.log("Creating groups...");
  const hrGroup = await db.group.upsert({
    where: { code: "HR" },
    update: {},
    create: { name: "Human Resources", code: "HR", description: "HR Office", active: true },
  });

  const ccsGroup = await db.group.upsert({
    where: { code: "CCS" },
    update: {},
    create: { name: "College of Computer Studies", code: "CCS", description: "CCS faculty & staff", active: true },
  });

  // 2. Roles
  console.log("Creating roles...");
  const hrRole = await upsertRole("HR Personnel", "HR office - manages employees, leaves, evaluations config", {
    scopeAllProfiling: true, scopeAllEvaluation: true, scopeAllLeave: true, scopeAllReports: true, scopeAllAttendance: true,
  }, HR_PERMS);

  const deanRole = await upsertRole("Dean", "College Dean - L1 leave approver, evaluates faculty", {
    scopeAllProfiling: false, scopeAllEvaluation: false, scopeAllLeave: false, scopeAllReports: false, scopeAllAttendance: false,
  }, DEAN_PERMS);

  const profRole = await upsertRole("Professor", "Teaching faculty - basic access", {
    scopeAllProfiling: false, scopeAllEvaluation: false, scopeAllLeave: false, scopeAllReports: false, scopeAllAttendance: false,
  }, PROFESSOR_PERMS);

  // 3. Employees
  console.log("Creating employees...");
  const passwordHash = await hash(DEFAULT_PASSWORD, 10);

  const jeremiah = await db.employee.upsert({
    where: { email: "jeremiah.sawal@rcc.edu.ph" },
    update: {},
    create: {
      employeeId: "EMP-0001",
      firstName: "Jeremiah",
      lastName: "Sawal",
      middleName: "D.",
      email: "jeremiah.sawal@rcc.edu.ph",
      phone: "+63 917 000 0001",
      gender: "Male",
      groupId: hrGroup.id,
      roleId: hrRole.id,
      contractType: "Regular",
      active: true,
      passwordHash,
    },
  });

  const neil = await db.employee.upsert({
    where: { email: "neil.datu@rcc.edu.ph" },
    update: {},
    create: {
      employeeId: "EMP-0003",
      firstName: "Neil",
      lastName: "Datu",
      middleName: "P.",
      email: "neil.datu@rcc.edu.ph",
      phone: "+63 917 000 0003",
      gender: "Male",
      groupId: ccsGroup.id,
      roleId: deanRole.id,
      contractType: "Regular",
      active: true,
      passwordHash,
    },
  });

  const asgar = await db.employee.upsert({
    where: { email: "asgar.batuaan@rcc.edu.ph" },
    update: {},
    create: {
      employeeId: "EMP-0009",
      firstName: "Asgar",
      lastName: "Batuaan",
      middleName: null,
      email: "asgar.batuaan@rcc.edu.ph",
      phone: "+63 917 000 0009",
      gender: "Male",
      groupId: ccsGroup.id,
      roleId: profRole.id,
      contractType: "Regular",
      active: true,
      passwordHash,
    },
  });

  console.log("\nSeeded successfully:");
  console.log(`  ${jeremiah.employeeId} | ${jeremiah.firstName} ${jeremiah.lastName} | HR Personnel | Human Resources`);
  console.log(`  ${neil.employeeId} | ${neil.firstName} ${neil.lastName} | Dean | College of Computer Studies`);
  console.log(`  ${asgar.employeeId} | ${asgar.firstName} ${asgar.lastName} | Professor | College of Computer Studies`);
  console.log(`\n  All passwords: ${DEFAULT_PASSWORD}`);
}

main().catch(console.error).finally(() => db.$disconnect());
