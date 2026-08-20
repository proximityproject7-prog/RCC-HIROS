import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: "file:./db/custom.db" });
const db = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = "RCC2026!";

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

async function upsertRole(
  name: string, description: string,
  opts: Record<string, boolean>,
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

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayTime(daysOffset: number, hours: number, minutes = 0): Date {
  const d = daysAgo(-daysOffset);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function main() {
  console.log("=== FULL RESEED ===\n");

  // Wipe all data
  console.log("Wiping data...");
  await db.auditLog.deleteMany({});
  await db.evaluationResponse.deleteMany({});
  await db.evaluation.deleteMany({});
  await db.evaluationPeriod.deleteMany({});
  await db.evaluationCriterion.deleteMany({});
  await db.evaluationForm.deleteMany({});
  await db.leaveApproval.deleteMany({});
  await db.leaveRequest.deleteMany({});
  await db.leaveBalance.deleteMany({});
  await db.leaveType.deleteMany({});
  await db.attendance.deleteMany({});
  await db.employeeCertificate.deleteMany({});
  await db.employeeFile.deleteMany({});
  await db.employee.deleteMany({});
  await db.rolePermission.deleteMany({});
  await db.role.deleteMany({});
  await db.group.deleteMany({});
  await db.systemSetting.deleteMany({});
  console.log("  Done.\n");

  // ── Groups ──
  console.log("Creating groups...");
  const hrGroup = await db.group.create({ data: { name: "Human Resources", code: "HR", description: "HR Office", active: true } });
  const ccsGroup = await db.group.create({ data: { name: "College of Computer Studies", code: "CCS", description: "CCS faculty & staff", active: true } });
  const cbaGroup = await db.group.create({ data: { name: "College of Business Administration", code: "CBA", description: "CBA faculty & staff", active: true } });
  const coeGroup = await db.group.create({ data: { name: "College of Engineering", code: "COE", description: "COE faculty & staff", active: true } });
  console.log("  HR, CCS, CBA, COE\n");

  // ── Roles ──
  console.log("Creating roles...");
  const adminRole = await upsertRole("System Administrator", "Full system access", {
    isSystem: true, scopeAllProfiling: true, scopeAllEvaluation: true, scopeAllLeave: true, scopeAllReports: true, scopeAllAttendance: true, canSelfApproveLeave: true,
  }, [
    "dashboard.view",
    "profiling.view","profiling.view_inactive","profiling.create","profiling.edit","profiling.delete","profile.selfEdit","profile.editAll",
    "attendance.view","attendance.clock_in","attendance.edit","attendance.edit_on_premise","attendance.view_all",
    "evaluation.view","evaluation.submit","evaluation.view_results","evaluation.manage_forms","evaluation.reset",
    "leave.request","leave.approve_l1","leave.approve_l2","leave.view_all","leave.manage_types",
    "reports.view","reports.export",
    "roles.view","roles.create","roles.edit","roles.delete",
    "groups.view","groups.manage",
    "fpass.fill","fpass.manage",
  ]);

  const hrRole = await upsertRole("HR Personnel", "HR office - manages employees, leaves, evaluations config", {
    scopeAllProfiling: true, scopeAllEvaluation: true, scopeAllLeave: true, scopeAllReports: true, scopeAllAttendance: true,
  }, HR_PERMS);

  const deanRole = await upsertRole("Dean", "College Dean - L1 leave approver, evaluates faculty", {}, DEAN_PERMS);

  const profRole = await upsertRole("Professor", "Teaching faculty - basic access", {}, PROFESSOR_PERMS);

  const staffRole = await upsertRole("Staff", "Non-teaching staff", {}, [
    "dashboard.view",
    "attendance.clock_in", "attendance.view",
    "leave.request",
    "profile.selfEdit",
  ]);
  console.log("  5 roles created\n");

  // ── Employees ──
  console.log("Creating employees...");
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const admin = await db.employee.create({
    data: {
      employeeId: "EMP-0000", firstName: "System", lastName: "Administrator",
      email: "admin@rcc.edu.ph", roleId: adminRole.id, contractType: "Regular",
      hireDate: new Date("2021-01-01"), gender: "Male", active: true, passwordHash: hash,
    },
  });

  const jeremiah = await db.employee.create({
    data: {
      employeeId: "EMP-0001", firstName: "Jeremiah", lastName: "Sawal", middleName: "D.",
      email: "jeremiah.sawal@rcc.edu.ph", phone: "+63 917 000 0001", gender: "Male",
      groupId: hrGroup.id, roleId: hrRole.id, contractType: "Regular",
      hireDate: new Date("2023-06-15"), active: true, passwordHash: hash,
    },
  });

  const neil = await db.employee.create({
    data: {
      employeeId: "EMP-0003", firstName: "Neil", lastName: "Datu", middleName: "P.",
      email: "neil.datu@rcc.edu.ph", phone: "+63 917 000 0003", gender: "Male",
      groupId: ccsGroup.id, roleId: deanRole.id, contractType: "Regular",
      hireDate: new Date("2022-08-01"), active: true, passwordHash: hash,
    },
  });

  const asgar = await db.employee.create({
    data: {
      employeeId: "EMP-0009", firstName: "Asgar", lastName: "Batuaan",
      email: "asgar.batuaan@rcc.edu.ph", phone: "+63 917 000 0009", gender: "Male",
      groupId: ccsGroup.id, roleId: profRole.id, contractType: "Contractual",
      hireDate: new Date("2024-01-10"), active: true, passwordHash: hash,
    },
  });

  // Extra employees for richer reports
  const maria = await db.employee.create({
    data: {
      employeeId: "EMP-0010", firstName: "Maria", lastName: "Cruz", middleName: "L.",
      email: "maria.cruz@rcc.edu.ph", phone: "+63 917 000 0010", gender: "Female",
      groupId: ccsGroup.id, roleId: profRole.id, contractType: "Part-Time",
      hireDate: new Date("2025-02-01"), active: true, passwordHash: hash,
    },
  });

  const juan = await db.employee.create({
    data: {
      employeeId: "EMP-0011", firstName: "Juan", lastName: "Dela Cruz",
      email: "juan.delacruz@rcc.edu.ph", phone: "+63 917 000 0011", gender: "Male",
      groupId: cbaGroup.id, roleId: deanRole.id, contractType: "Regular",
      hireDate: new Date("2021-07-15"), active: true, passwordHash: hash,
    },
  });

  const ana = await db.employee.create({
    data: {
      employeeId: "EMP-0012", firstName: "Ana", lastName: "Santos", middleName: "R.",
      email: "ana.santos@rcc.edu.ph", phone: "+63 917 000 0012", gender: "Female",
      groupId: cbaGroup.id, roleId: profRole.id, contractType: "Regular",
      hireDate: new Date("2023-09-01"), active: true, passwordHash: hash,
    },
  });

  const carlos = await db.employee.create({
    data: {
      employeeId: "EMP-0013", firstName: "Carlos", lastName: "Reyes",
      email: "carlos.reyes@rcc.edu.ph", phone: "+63 917 000 0013", gender: "Male",
      groupId: coeGroup.id, roleId: profRole.id, contractType: "Contractual",
      hireDate: new Date("2025-06-01"), active: true, passwordHash: hash,
    },
  });

  const allEmps = [admin, jeremiah, neil, asgar, maria, juan, ana, carlos];
  console.log(`  ${allEmps.length} employees created\n`);

  // ── Leave Types ──
  console.log("Creating leave types...");
  const sickLeave = await db.leaveType.create({ data: { name: "Sick Leave", code: "SL", defaultDays: 10, active: true } });
  const vacationLeave = await db.leaveType.create({ data: { name: "Vacation Leave", code: "VL", defaultDays: 15, active: true } });
  const emergencyLeave = await db.leaveType.create({ data: { name: "Emergency Leave", code: "EL", defaultDays: 5, active: true } });
  const leaveTypes = [sickLeave, vacationLeave, emergencyLeave];
  console.log("  Sick, Vacation, Emergency\n");

  // ── Leave Balances ──
  console.log("Creating leave balances...");
  const usedDays: Record<string, Record<string, number>> = {
    "EMP-0000": { SL: 0, VL: 0, EL: 0 },
    "EMP-0001": { SL: 2, VL: 3, EL: 0 },
    "EMP-0003": { SL: 1, VL: 5, EL: 0 },
    "EMP-0009": { SL: 4, VL: 2, EL: 1 },
    "EMP-0010": { SL: 0, VL: 1, EL: 0 },
    "EMP-0011": { SL: 3, VL: 0, EL: 2 },
    "EMP-0012": { SL: 1, VL: 4, EL: 0 },
    "EMP-0013": { SL: 0, VL: 0, EL: 0 },
  };
  for (const emp of allEmps) {
    for (const lt of leaveTypes) {
      await db.leaveBalance.create({
        data: { employeeId: emp.id, leaveTypeId: lt.id, year: 2026, totalDays: lt.defaultDays, usedDays: usedDays[emp.employeeId]?.[lt.code] ?? 0 },
      });
    }
  }
  console.log("  Balances for all 8 employees\n");

  // ── Leave Requests ──
  console.log("Creating leave requests...");
  const lr1 = await db.leaveRequest.create({
    data: { requestNo: "LR-0001", employeeId: asgar.id, leaveTypeId: vacationLeave.id, startDate: daysAgo(-7), endDate: daysAgo(-9), workdays: 3, reason: "Family reunion in the province.", status: "pending_l1" },
  });
  await db.leaveApproval.create({ data: { leaveRequestId: lr1.id, level: 1, approverId: neil.id, status: "pending" } });

  const lr2 = await db.leaveRequest.create({
    data: { requestNo: "LR-0002", employeeId: asgar.id, leaveTypeId: sickLeave.id, startDate: daysAgo(10), endDate: daysAgo(9), workdays: 2, reason: "Doctor advised bed rest.", status: "approved" },
  });
  await db.leaveApproval.create({ data: { leaveRequestId: lr2.id, level: 1, approverId: neil.id, status: "approved", remarks: "Approved.", actedAt: dayTime(10, 10) } });
  await db.leaveApproval.create({ data: { leaveRequestId: lr2.id, level: 2, approverId: jeremiah.id, status: "approved", remarks: "Noted.", actedAt: dayTime(10, 14, 30) } });

  const lr3 = await db.leaveRequest.create({
    data: { requestNo: "LR-0003", employeeId: neil.id, leaveTypeId: vacationLeave.id, startDate: daysAgo(20), endDate: daysAgo(18), workdays: 3, reason: "Education conference in Manila.", status: "approved" },
  });
  await db.leaveApproval.create({ data: { leaveRequestId: lr3.id, level: 2, approverId: jeremiah.id, status: "approved", remarks: "Approved.", actedAt: dayTime(20, 9) } });

  console.log("  3 leave requests\n");

  // ── Attendance (5 days × all active employees) ──
  console.log("Creating attendance records...");
  const campusLat = 15.1428;
  const campusLng = 120.5886;

  const attData: Array<[number, string, number, number, boolean, number, number]> = [
    [0, "EMP-0001", 7, 55, true, 17, 5],
    [0, "EMP-0003", 8, 10, false, 0, 0],
    [0, "EMP-0009", 8, 30, true, 17, 0],
    [0, "EMP-0010", 9, 0, true, 16, 0],
    [0, "EMP-0011", 7, 45, true, 17, 15],
    [0, "EMP-0012", 8, 5, true, 17, 0],
    [-1, "EMP-0001", 7, 50, true, 17, 8],
    [-1, "EMP-0003", 8, 5, true, 17, 5],
    [-1, "EMP-0009", 8, 45, true, 16, 55],
    [-1, "EMP-0010", 9, 10, false, 0, 0],
    [-1, "EMP-0011", 8, 0, true, 17, 10],
    [-2, "EMP-0001", 7, 55, true, 17, 2],
    [-2, "EMP-0003", 8, 15, true, 17, 10],
    [-2, "EMP-0009", 9, 0, false, 0, 0],
    [-2, "EMP-0012", 7, 58, true, 17, 3],
    [-3, "EMP-0001", 8, 0, true, 17, 5],
    [-3, "EMP-0003", 8, 20, true, 17, 15],
    [-3, "EMP-0009", 8, 50, true, 17, 0],
    [-3, "EMP-0011", 7, 55, true, 17, 20],
    [-4, "EMP-0001", 7, 45, true, 17, 10],
    [-4, "EMP-0003", 8, 0, true, 17, 0],
    [-4, "EMP-0009", 8, 40, true, 16, 50],
    [-4, "EMP-0010", 8, 55, true, 16, 0],
    [-4, "EMP-0012", 8, 10, true, 17, 5],
  ];

  for (const [offset, empId, ciH, ciM, clockedOut, coH, coM] of attData) {
    const emp = allEmps.find(e => e.employeeId === empId);
    if (!emp) continue;
    const recordDate = daysAgo(offset);
    const clockInAt = new Date(recordDate);
    clockInAt.setHours(ciH, ciM, 0, 0);
    const record: Record<string, unknown> = {
      employeeId: emp.id, date: recordDate, clockInAt,
      clockInLat: campusLat, clockInLng: campusLng, clockInOnPremise: true, clockInDistance: 0,
      biometricVerified: true, manuallyEdited: false,
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
    await db.attendance.create({ data: record as never });
  }
  console.log(`  ${attData.length} attendance records\n`);

  // ── Certificates ──
  console.log("Creating certificates...");
  const certs = [
    { empId: "EMP-0001", title: "Certified HR Professional", issuer: "Philippines HR Society", certNo: "PHRS-CHRP-2024-101", issueDate: new Date("2024-06-15") },
    { empId: "EMP-0001", title: "Labor Law Compliance Seminar", issuer: "DOLE Region III", certNo: "DOLE-LLC-2025-055", issueDate: new Date("2025-03-10") },
    { empId: "EMP-0003", title: "Educational Leadership Certificate", issuer: "CHED", certNo: "CHED-ELC-2024-032", issueDate: new Date("2024-09-20") },
    { empId: "EMP-0009", title: "Certified Java Developer", issuer: "Oracle University", certNo: "ORA-JAVA-2024-456", issueDate: new Date("2024-04-10") },
    { empId: "EMP-0009", title: "Web Development Bootcamp", issuer: "Coursera / Google", certNo: "COU-WDB-2025-789", issueDate: new Date("2025-08-05") },
    { empId: "EMP-0010", title: "TESOL Certification", issuer: "TESOL International", certNo: "TESOL-2025-042", issueDate: new Date("2025-01-20") },
    { empId: "EMP-0011", title: "Business Administration Certification", issuer: "PMA", certNo: "PMA-BAC-2024-078", issueDate: new Date("2024-11-05") },
    { empId: "EMP-0012", title: "Marketing Analytics Certificate", issuer: "Google", certNo: "GOOG-MA-2025-321", issueDate: new Date("2025-05-15") },
    { empId: "EMP-0013", title: "Engineering Board License", issuer: "PRC", certNo: "PRC-EBL-2024-567", issueDate: new Date("2024-08-01") },
  ];
  for (const cert of certs) {
    const emp = allEmps.find(e => e.employeeId === cert.empId);
    if (!emp) continue;
    await db.employeeCertificate.create({
      data: { employeeId: emp.id, title: cert.title, issuer: cert.issuer, certificateNo: cert.certNo, issueDate: cert.issueDate },
    });
  }
  console.log(`  ${certs.length} certificates\n`);

  // ── System Settings ──
  console.log("Creating system settings...");
  await db.systemSetting.create({
    data: {
      key: "premises_config",
      value: JSON.stringify({ lat: 15.1428, lng: 120.5886, radiusMeters: 200, label: "Republic Central Colleges — Angeles" }),
      category: "attendance",
    },
  });
  console.log("  Premises geofence config set\n");

  // ── Summary ──
  console.log("========================================");
  console.log("  FULL RESEED COMPLETE");
  console.log("========================================\n");
  console.log("Users (all passwords: RCC2026!):");
  console.log("  EMP-0000 | System Administrator | admin@rcc.edu.ph | Regular | 2021-01-01");
  console.log("  EMP-0001 | Jeremiah Sawal      | jeremiah.sawal@rcc.edu.ph | Regular (HR) | 2023-06-15");
  console.log("  EMP-0003 | Neil Datu           | neil.datu@rcc.edu.ph | Regular (CCS/Dean) | 2022-08-01");
  console.log("  EMP-0009 | Asgar Batuaan       | asgar.batuaan@rcc.edu.ph | Contractual (CCS) | 2024-01-10");
  console.log("  EMP-0010 | Maria Cruz          | maria.cruz@rcc.edu.ph | Part-Time (CCS) | 2025-02-01");
  console.log("  EMP-0011 | Juan Dela Cruz      | juan.delacruz@rcc.edu.ph | Regular (CBA/Dean) | 2021-07-15");
  console.log("  EMP-0012 | Ana Santos          | ana.santos@rcc.edu.ph | Regular (CBA) | 2023-09-01");
  console.log("  EMP-0013 | Carlos Reyes        | carlos.reyes@rcc.edu.ph | Contractual (COE) | 2025-06-01");
  console.log("\nGroups: HR, CCS, CBA, COE");
  console.log("Roles: System Admin, HR Personnel, Dean, Professor, Staff");
  console.log(`Attendance: ${attData.length} records, Certificates: ${certs.length}`);
}

main().catch(console.error).finally(() => db.$disconnect());
