import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET /api/reports/headcount  reports.view
// Drill-down report:
//   no params                  → groups summary (gender, contract, certs)
//   ?groupCode=XYZ             → roles breakdown within that group
//   ?groupCode=XYZ&roleId=RID  → individual employees
// Group scoping based on scopeAllReports.
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "reports.view");
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { searchParams } = new URL(request.url);
    const groupCode = searchParams.get("groupCode") || undefined;
    const roleId = searchParams.get("roleId") || undefined;

    // Group scoping
    const canViewAll =
      user.isSystem ||
      user.scopeAllReports ||
      user.permissions.includes("reports.view");

    // If user is group-scoped and no groupCode provided, force their group
    let effectiveGroupCode = groupCode;
    if (!canViewAll && user.groupId) {
      // Find the user's group code
      const userGroup = await db.group.findUnique({
        where: { id: user.groupId },
        select: { code: true },
      });
      if (userGroup) {
        if (effectiveGroupCode && effectiveGroupCode !== userGroup.code) {
          return NextResponse.json(
            { error: "Forbidden - you can only view your own group" },
            { status: 403 }
          );
        }
        effectiveGroupCode = userGroup.code;
      }
    }

    // Active filter — respect profiling.view_inactive
    const canViewInactive =
      user.isSystem || user.permissions.includes("profiling.view_inactive");
    const activeFilter = canViewInactive ? undefined : true;

    // ───────────────────────────────────────────────────────────
    // Level 1: no groupCode → groups summary
    // ───────────────────────────────────────────────────────────
    if (!effectiveGroupCode) {
      const groups = await db.group.findMany({
        where: { active: true },
        include: {
          employees: {
            where:
              activeFilter !== undefined ? { active: activeFilter } : undefined,
            select: {
              id: true,
              gender: true,
              contractType: true,
              _count: { select: { certificates: true } },
              roleId: true,
              role: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { name: "asc" },
      });

      const summary = groups.map((g) => {
        const total = g.employees.length;
        const male = g.employees.filter((e) => e.gender === "Male").length;
        const female = g.employees.filter((e) => e.gender === "Female").length;
        const unspecified = total - male - female;

        const byContract: Record<string, number> = {};
        for (const e of g.employees) {
          const ct = e.contractType || "Unknown";
          byContract[ct] = (byContract[ct] || 0) + 1;
        }

        const certCount = g.employees.reduce(
          (acc, e) => acc + e._count.certificates,
          0
        );

        // Roles breakdown for drill-down
        const byRole: Record<string, { roleId: string; roleName: string; count: number }> = {};
        for (const e of g.employees) {
          if (!e.role) continue;
          if (!byRole[e.role.id]) {
            byRole[e.role.id] = {
              roleId: e.role.id,
              roleName: e.role.name,
              count: 0,
            };
          }
          byRole[e.role.id].count += 1;
        }

        return {
          groupId: g.id,
          groupCode: g.code,
          groupName: g.name,
          total,
          byGender: { male, female, unspecified },
          byContractType: byContract,
          certificateCount: certCount,
          roles: Object.values(byRole).sort((a, b) => b.count - a.count),
        };
      });

      return NextResponse.json({ level: "groups", groups: summary });
    }

    // Resolve the requested group
    const group = await db.group.findUnique({
      where: { code: effectiveGroupCode },
    });
    if (!group) {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 }
      );
    }

    // ───────────────────────────────────────────────────────────
    // Level 2: groupCode only → roles breakdown
    // ───────────────────────────────────────────────────────────
    if (!roleId) {
      const employees = await db.employee.findMany({
        where: {
          groupId: group.id,
          ...(activeFilter !== undefined ? { active: activeFilter } : {}),
        },
        select: {
          id: true,
          gender: true,
          contractType: true,
          roleId: true,
          role: { select: { id: true, name: true } },
          _count: { select: { certificates: true } },
        },
      });

      const byRole: Record<
        string,
        {
          roleId: string;
          roleName: string;
          count: number;
          male: number;
          female: number;
          unspecified: number;
          byContractType: Record<string, number>;
          certificateCount: number;
        }
      > = {};

      for (const e of employees) {
        const rid = e.roleId || "unassigned";
        const rname = e.role?.name || "Unassigned";
        if (!byRole[rid]) {
          byRole[rid] = {
            roleId: rid,
            roleName: rname,
            count: 0,
            male: 0,
            female: 0,
            unspecified: 0,
            byContractType: {},
            certificateCount: 0,
          };
        }
        const r = byRole[rid];
        r.count += 1;
        if (e.gender === "Male") r.male += 1;
        else if (e.gender === "Female") r.female += 1;
        else r.unspecified += 1;
        const ct = e.contractType || "Unknown";
        r.byContractType[ct] = (r.byContractType[ct] || 0) + 1;
        r.certificateCount += e._count.certificates;
      }

      return NextResponse.json({
        level: "roles",
        group: { id: group.id, code: group.code, name: group.name },
        roles: Object.values(byRole).sort((a, b) => b.count - a.count),
      });
    }

    // ───────────────────────────────────────────────────────────
    // Level 3: groupCode + roleId → individual employees
    // ───────────────────────────────────────────────────────────
    const employees = await db.employee.findMany({
      where: {
        groupId: group.id,
        roleId,
        ...(activeFilter !== undefined ? { active: activeFilter } : {}),
      },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        gender: true,
        contractType: true,
        hireDate: true,
        active: true,
        role: { select: { id: true, name: true } },
        _count: { select: { certificates: true } },
      },
      orderBy: [{ employeeId: "asc" }],
    });

    return NextResponse.json({
      level: "employees",
      group: { id: group.id, code: group.code, name: group.name },
      roleId,
      employees: employees.map((e) => ({
        id: e.id,
        employeeId: e.employeeId,
        firstName: e.firstName,
        middleName: e.middleName,
        lastName: e.lastName,
        email: e.email,
        gender: e.gender,
        contractType: e.contractType,
        hireDate: e.hireDate?.toISOString() ?? null,
        active: e.active,
        roleName: e.role?.name ?? null,
        certificateCount: e._count.certificates,
      })),
    });
  } catch (error) {
    console.error("[API /reports/headcount] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
