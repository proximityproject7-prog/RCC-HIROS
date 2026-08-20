import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAuth, requirePermission, requireAnyPermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// /api/employees/[id]
// GET    profiling.view             — single employee w/ certs + counts
// PATCH  profiling.edit|profile.*   — update fields + optional password reset
// DELETE profiling.delete           — soft-delete (active=false)
// ═══════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Self-access exception: any authenticated user can view their own profile.
    // For viewing others' profiles, require profiling.view.
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;

    // If NOT viewing own profile, require profiling.view
    if (auth.user.id !== id) {
      if (!auth.user.isSystem && !auth.user.permissions.includes("profiling.view")) {
        return NextResponse.json(
          { error: "You do not have permission to view this employee's profile" },
          { status: 403 }
        );
      }
    }
    const employee = await db.employee.findUnique({
      where: { id },
      include: {
        group: true,
        role: { select: { id: true, name: true } },
        certificates: { orderBy: { issueDate: "desc" } },
        files: {
          orderBy: { createdAt: "desc" },
          include: {
            uploadedBy: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        _count: {
          select: {
            certificates: true,
            files: true,
            leaveRequests: true,
            attendanceRecords: true,
            evaluations: true,
          },
        },
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Block inactive employees for users without profiling.view_inactive
    const canViewInactive =
      auth.user.permissions.includes("profiling.view_inactive") ||
      auth.user.isSystem;

    if (!employee.active && !canViewInactive) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
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
        group: employee.group
          ? {
              id: employee.group.id,
              name: employee.group.name,
              code: employee.group.code,
            }
          : null,
        roleId: employee.roleId,
        roleName: employee.role?.name ?? null,
        contractType: employee.contractType,
        hireDate: employee.hireDate?.toISOString() ?? null,
        salary: employee.salary ?? null,
        active: employee.active,
        mustChangePwd: employee.mustChangePwd,
        lastLoginAt: employee.lastLoginAt?.toISOString() ?? null,
        createdAt: employee.createdAt.toISOString(),
        updatedAt: employee.updatedAt.toISOString(),
        certificates: employee.certificates.map((c) => ({
          id: c.id,
          title: c.title,
          issuer: c.issuer,
          certificateNo: c.certificateNo,
          issueDate: c.issueDate?.toISOString() ?? null,
          expiryDate: c.expiryDate?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        })),
        files: employee.files.map((f) => ({
          id: f.id,
          fileName: f.fileName,
          originalName: f.originalName,
          mimeType: f.mimeType,
          fileSize: f.fileSize,
          description: f.description,
          uploadedBy: f.uploadedBy
            ? `${f.uploadedBy.firstName} ${f.uploadedBy.lastName}`.trim()
            : null,
          createdAt: f.createdAt.toISOString(),
          uploadedAt: f.uploadedAt.toISOString(),
        })),
        counts: employee._count,
      },
    });
  } catch (error) {
    console.error("[API /employees/[id] GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require either full profiling.edit or profile self-edit permissions
    const auth = await requireAnyPermission(request, ["profiling.edit", "profile.editAll", "profile.selfEdit"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const employee = await db.employee.findUnique({ where: { id } });
    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Determine edit mode
    const isAdminEdit = auth.user.permissions.includes("profiling.edit");
    const isEditAll = auth.user.permissions.includes("profile.editAll");
    const isSelfEdit = auth.user.id === id && auth.user.permissions.includes("profile.selfEdit");

    if (!isAdminEdit && !isEditAll && !isSelfEdit) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    // Self-edit / editAll: only basic info fields allowed
    const canEditAllFields = isAdminEdit;

    if (canEditAllFields) {
      // Full admin edit — all fields
      const {
        employeeId, firstName, middleName, lastName, email, phone, address,
        birthday, gender, groupId, roleId, contractType, hireDate, salary, active, password,
      } = body as Record<string, unknown>;

      if (typeof employeeId === "string" && employeeId.trim() && employeeId !== employee.employeeId) {
        const dup = await db.employee.findUnique({
          where: { employeeId: employeeId.trim() },
        });
        if (dup && dup.id !== id) {
          return NextResponse.json({ error: "Employee ID already exists" }, { status: 409 });
        }
        data.employeeId = employeeId.trim();
      }
      if (typeof firstName === "string" && firstName.trim()) data.firstName = firstName.trim();
      if (typeof lastName === "string" && lastName.trim()) data.lastName = lastName.trim();
      if (middleName !== undefined) data.middleName = (middleName as string | null)?.trim() || null;
      if (typeof email === "string" && email.trim()) {
        const emailLower = email.trim().toLowerCase();
        if (emailLower !== employee.email) {
          const dup = await db.employee.findUnique({ where: { email: emailLower } });
          if (dup && dup.id !== id) {
            return NextResponse.json({ error: "Email already exists" }, { status: 409 });
          }
          data.email = emailLower;
        }
      }
      if (phone !== undefined) data.phone = (phone as string | null)?.trim() || null;
      if (address !== undefined) data.address = (address as string | null)?.trim() || null;
      if (birthday !== undefined) data.birthday = birthday ? new Date(birthday as string) : null;
      if (gender !== undefined) data.gender = (gender as string | null) || null;
      if (groupId !== undefined) data.groupId = (groupId as string | null) || null;
      if (roleId !== undefined) data.roleId = (roleId as string | null) || null;
      if (typeof contractType === "string" && contractType.trim()) data.contractType = contractType.trim();
      if (hireDate !== undefined) data.hireDate = hireDate ? new Date(hireDate as string) : null;
      if (salary !== undefined) data.salary = (salary as number | null) ?? null;
      if (active !== undefined) data.active = !!active;

      if (password !== undefined) {
        if (typeof password !== "string" || password.length < 8) {
          return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
        }
        const salt = await bcrypt.genSalt(12);
        data.passwordHash = await bcrypt.hash(password, salt);
        data.mustChangePwd = true;
      }
    } else {
      // Self-edit / editAll mode — only basic info
      const SELF_EDITABLE = new Set(["phone", "address", "birthday", "gender"]);
      for (const key of SELF_EDITABLE) {
        if (body[key] !== undefined) {
          if (key === "phone") {
            data.phone = (body.phone as string | null)?.trim() || null;
          } else if (key === "address") {
            data.address = (body.address as string | null)?.trim() || null;
          } else if (key === "birthday") {
            data.birthday = body.birthday ? new Date(body.birthday as string) : null;
          } else if (key === "gender") {
            data.gender = (body.gender as string | null) || null;
          }
        }
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
      }
    }

    const updated = await db.employee.update({
      where: { id },
      data,
      include: {
        group: true,
        role: { select: { id: true, name: true } },
        _count: { select: { certificates: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Update Employee",
        entity: "Employee",
        entityId: id,
        metadata: JSON.stringify({ fields: Object.keys(data) }),
      },
    });

    return NextResponse.json({
      employee: {
        id: updated.id,
        employeeId: updated.employeeId,
        firstName: updated.firstName,
        middleName: updated.middleName,
        lastName: updated.lastName,
        email: updated.email,
        phone: updated.phone,
        address: updated.address,
        birthday: updated.birthday?.toISOString() ?? null,
        gender: updated.gender,
        groupId: updated.groupId,
        groupName: updated.group?.name ?? null,
        roleId: updated.roleId,
        roleName: updated.role?.name ?? null,
        contractType: updated.contractType,
        hireDate: updated.hireDate?.toISOString() ?? null,
        salary: updated.salary ?? null,
        active: updated.active,
        mustChangePwd: updated.mustChangePwd,
        certificateCount: updated._count.certificates,
      },
    });
  } catch (error) {
    console.error("[API /employees/[id] PATCH] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, "profiling.delete");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const employee = await db.employee.findUnique({ where: { id } });
    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Soft-delete: set active=false
    await db.employee.update({
      where: { id },
      data: { active: false },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Deactivate Employee",
        entity: "Employee",
        entityId: id,
        metadata: JSON.stringify({
          employeeId: employee.employeeId,
          email: employee.email,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /employees/[id] DELETE] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
