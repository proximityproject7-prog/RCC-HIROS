import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET    /api/employees   profiling.view
//        Search + filters + group scoping. Include group+role+cert count.
// POST   /api/employees   profiling.create
//        Create with bcrypt-hashed password + mustChangePwd flag.
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "profiling.view");
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const groupId = searchParams.get("groupId") || undefined;
    const roleId = searchParams.get("roleId") || undefined;
    const contractType = searchParams.get("contractType") || undefined;
    const activeParam = searchParams.get("active");
    const fpassStatus = searchParams.get("fpassStatus") || undefined;
    const scope = searchParams.get("scope") || "profiling";

    // Group scoping: use the appropriate scope permission
    const scopeAll = scope === "evaluation" ? auth.user.scopeAllEvaluation : auth.user.scopeAllProfiling;

    let effectiveGroupId = groupId || undefined;
    if (!scopeAll && auth.user.groupId) {
      effectiveGroupId = auth.user.groupId;
    }

    // Active filter: respect profiling.view_inactive
    const canViewInactive =
      auth.user.permissions.includes("profiling.view_inactive") ||
      auth.user.isSystem;

    let activeFilter: boolean | undefined;
    if (activeParam === "true") activeFilter = true;
    else if (activeParam === "false") {
      if (!canViewInactive) {
        return NextResponse.json(
          { error: "You do not have permission to view inactive employees" },
          { status: 403 }
        );
      }
      activeFilter = false;
    } else if (!canViewInactive) {
      // Hide inactive employees by default for users without view_inactive
      activeFilter = true;
    }

    const where: Record<string, unknown> = {};
    if (activeFilter !== undefined) where.active = activeFilter;
    if (effectiveGroupId) where.groupId = effectiveGroupId;
    if (roleId) where.roleId = roleId;
    if (contractType) where.contractType = contractType;

    if (search) {
      const lower = search.toLowerCase();
      where.OR = [
        { firstName: { contains: lower } },
        { lastName: { contains: lower } },
        { middleName: { contains: lower } },
        { email: { contains: lower } },
        { employeeId: { contains: search } },
      ];
    }

    // Hide system admin employees from non-system-admin users
    if (!auth.user.isSystem) {
      where.role = { ...(where.role as object || {}), isSystem: false };
    }

    // FPASS status filter
    const currentYear = new Date().getFullYear();
    const fpassSchoolYear = `${currentYear}-${currentYear + 1}`;
    if (fpassStatus === "submitted") {
      where.fpassSubmissions = { some: { schoolYear: fpassSchoolYear } };
    } else if (fpassStatus === "empty") {
      where.fpassSubmissions = { none: { schoolYear: fpassSchoolYear } };
    }

    const employees = await db.employee.findMany({
      where,
      include: {
        group: true,
        role: { select: { id: true, name: true, isSystem: true } },
        _count: { select: { certificates: true } },
      },
      orderBy: [{ employeeId: "asc" }],
    });

    return NextResponse.json({
      employees: employees.map((e) => ({
        id: e.id,
        employeeId: e.employeeId,
        firstName: e.firstName,
        middleName: e.middleName,
        lastName: e.lastName,
        email: e.email,
        phone: e.phone,
        address: e.address,
        birthday: e.birthday?.toISOString() ?? null,
        gender: e.gender,
        contractType: e.contractType,
        hireDate: e.hireDate?.toISOString() ?? null,
        salary: e.salary ?? null,
        active: e.active,
        groupId: e.groupId,
        groupName: e.group?.name ?? null,
        groupCode: e.group?.code ?? null,
        roleId: e.roleId,
        roleName: e.role?.name ?? null,
        certificateCount: e._count.certificates,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[API /employees GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "profiling.create");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const {
      employeeId,
      firstName,
      middleName,
      lastName,
      email,
      phone,
      address,
      birthday,
      gender,
      groupId,
      roleId,
      contractType = "Regular",
      hireDate,
      salary = 0,
      active = true,
      password,
      mustChangePwd = true,
    } = body as {
      employeeId?: string;
      firstName?: string;
      lastName?: string;
      middleName?: string;
      email?: string;
      phone?: string;
      address?: string;
      birthday?: string;
      gender?: string;
      groupId?: string;
      roleId?: string;
      contractType?: string;
      hireDate?: string;
      salary?: number;
      active?: boolean;
      password?: string;
      mustChangePwd?: boolean;
    };

    // Validate required
    if (!employeeId || !employeeId.trim()) {
      return NextResponse.json(
        { error: "Employee ID is required" },
        { status: 400 }
      );
    }
    if (!firstName || !firstName.trim()) {
      return NextResponse.json(
        { error: "First name is required" },
        { status: 400 }
      );
    }
    if (!lastName || !lastName.trim()) {
      return NextResponse.json(
        { error: "Last name is required" },
        { status: 400 }
      );
    }
    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const emailLower = email.trim().toLowerCase();

    // Uniqueness checks
    const dupEmpId = await db.employee.findUnique({
      where: { employeeId: employeeId.trim() },
    });
    if (dupEmpId) {
      return NextResponse.json(
        { error: "Employee ID already exists" },
        { status: 409 }
      );
    }
    const dupEmail = await db.employee.findUnique({
      where: { email: emailLower },
    });
    if (dupEmail) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 }
      );
    }

    // Validate optional relations
    if (groupId) {
      const grp = await db.group.findUnique({ where: { id: groupId } });
      if (!grp) {
        return NextResponse.json(
          { error: "Group not found" },
          { status: 400 }
        );
      }
    }
    if (roleId) {
      const r = await db.role.findUnique({ where: { id: roleId } });
      if (!r) {
        return NextResponse.json(
          { error: "Role not found" },
          { status: 400 }
        );
      }
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const employee = await db.employee.create({
      data: {
        employeeId: employeeId.trim(),
        firstName: firstName.trim(),
        middleName: middleName?.trim() || null,
        lastName: lastName.trim(),
        email: emailLower,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        birthday: birthday ? new Date(birthday) : null,
        gender: gender || null,
        groupId: groupId || null,
        roleId: roleId || null,
        contractType: contractType || "Regular",
        hireDate: hireDate ? new Date(hireDate) : null,
        salary: salary ?? 0,
        active: !!active,
        passwordHash,
        mustChangePwd: !!mustChangePwd,
      },
      include: {
        group: true,
        role: { select: { id: true, name: true } },
        _count: { select: { certificates: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Create Employee",
        entity: "Employee",
        entityId: employee.id,
        metadata: JSON.stringify({
          employeeId: employee.employeeId,
          email: employee.email,
        }),
      },
    });

    return NextResponse.json(
      {
        employee: {
          id: employee.id,
          employeeId: employee.employeeId,
          firstName: employee.firstName,
          middleName: employee.middleName,
          lastName: employee.lastName,
          email: employee.email,
          phone: employee.phone,
          address: employee.address,
          birthday: employee.birthday?.toISOString() ?? null,
          gender: employee.gender,
          groupId: employee.groupId,
          groupName: employee.group?.name ?? null,
          roleId: employee.roleId,
          roleName: employee.role?.name ?? null,
          contractType: employee.contractType,
          hireDate: employee.hireDate?.toISOString() ?? null,
          salary: employee.salary ?? null,
          active: employee.active,
          mustChangePwd: employee.mustChangePwd,
          certificateCount: employee._count.certificates,
          createdAt: employee.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API /employees POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
