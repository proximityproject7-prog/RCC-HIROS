import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: "file:./db/custom.db" });
const db = new PrismaClient({ adapter });

async function main() {
  const role = await db.role.create({
    data: {
      name: "System Administrator",
      description: "Full system access with all permissions",
      isSystem: true,
      scopeAllProfiling: true,
      scopeAllEvaluation: true,
      scopeAllLeave: true,
      scopeAllReports: true,
      scopeAllAttendance: true,
      canSelfApproveLeave: true,
    },
  });

  const allPerms = [
    "dashboard.view",
    "profiling.view","profiling.view_inactive","profiling.create","profiling.edit","profiling.delete","profile.selfEdit","profile.editAll",
    "attendance.view","attendance.clock_in","attendance.edit","attendance.edit_on_premise","attendance.view_all",
    "evaluation.view","evaluation.submit","evaluation.view_results","evaluation.manage_forms","evaluation.reset",
    "leave.request","leave.approve_l1","leave.approve_l2","leave.view_all","leave.manage_types",
    "reports.view","reports.export",
    "roles.view","roles.create","roles.edit","roles.delete",
    "groups.view","groups.manage",
    "fpass.fill","fpass.manage",
  ];

  await db.rolePermission.createMany({
    data: allPerms.map((identifier) => ({ roleId: role.id, identifier, granted: true })),
  });

  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash("RCC2026!", salt);

  const admin = await db.employee.create({
    data: {
      employeeId: "EMP-0000",
      firstName: "System",
      lastName: "Administrator",
      email: "admin@rcc.edu.ph",
      roleId: role.id,
      active: true,
      passwordHash: hash,
      mustChangePwd: false,
    },
  });

  console.log("Admin account created:");
  console.log("  Email:", admin.email);
  console.log("  Employee ID:", admin.employeeId);
  console.log("  Role:", role.name);
  console.log("  Permissions:", allPerms.length);
}

main().catch(console.error).finally(() => db.$disconnect());
