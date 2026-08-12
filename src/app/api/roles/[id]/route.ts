import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";
import { PERMISSIONS } from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════
// /api/roles/[id]
// GET    roles.view    — single role
// PATCH  roles.edit    — update role + replace permissions (transaction)
// DELETE roles.delete  — block if isSystem or has employees
// ═══════════════════════════════════════════════════════════════

const VALID_PERMISSIONS = new Set<string>(PERMISSIONS);

const CRITICAL_PERMS = [
  "roles.view",
  "roles.edit",
  "profiling.view",
  "profiling.edit",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, "roles.view");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const role = await db.role.findUnique({
      where: { id },
      include: {
        permissions: true,
        _count: { select: { employees: true } },
      },
    });

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    return NextResponse.json({
      role: {
        id: role.id,
        name: role.name,
        description: role.description,
        scopeAllProfiling: role.scopeAllProfiling,
        scopeAllEvaluation: role.scopeAllEvaluation,
        scopeAllLeave: role.scopeAllLeave,
        scopeAllReports: role.scopeAllReports,
        scopeAllAttendance: role.scopeAllAttendance,
        canSelfApproveLeave: role.canSelfApproveLeave,
        isSystem: role.isSystem,
        active: role.active,
        createdAt: role.createdAt.toISOString(),
        updatedAt: role.updatedAt.toISOString(),
        permissions: role.permissions
          .filter((p) => p.granted)
          .map((p) => p.identifier),
        allPermissions: role.permissions.map((p) => ({
          identifier: p.identifier,
          granted: p.granted,
        })),
        employeeCount: role._count.employees,
      },
    });
  } catch (error) {
    console.error("[API /roles/[id] GET] Error:", error);
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
    const auth = await requirePermission(request, "roles.edit");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const role = await db.role.findUnique({
      where: { id },
      include: { permissions: true },
    });
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      description,
      scopeAllProfiling,
      scopeAllEvaluation,
      scopeAllLeave,
      scopeAllReports,
      scopeAllAttendance,
      canSelfApproveLeave,
      active,
      permissions,
    } = body as {
      name?: string;
      description?: string | null;
      scopeAllProfiling?: boolean;
      scopeAllEvaluation?: boolean;
      scopeAllLeave?: boolean;
      scopeAllReports?: boolean;
      scopeAllAttendance?: boolean;
      canSelfApproveLeave?: boolean;
      active?: boolean;
      permissions?: string[];
    };

    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim() && name !== role.name) {
      const nameLower = name.trim().toLowerCase();
      const dup = await db.role.findFirst({
        where: { name: nameLower, NOT: { id } },
      });
      if (dup) {
        return NextResponse.json(
          { error: "Role with this name already exists" },
          { status: 409 }
        );
      }
      data.name = name.trim();
    }
    if (description !== undefined) {
      data.description =
        typeof description === "string" && description.trim()
          ? description.trim()
          : null;
    }
    if (scopeAllProfiling !== undefined)
      data.scopeAllProfiling = !!scopeAllProfiling;
    if (scopeAllEvaluation !== undefined)
      data.scopeAllEvaluation = !!scopeAllEvaluation;
    if (scopeAllLeave !== undefined) data.scopeAllLeave = !!scopeAllLeave;
    if (scopeAllReports !== undefined) data.scopeAllReports = !!scopeAllReports;
    if (scopeAllAttendance !== undefined)
      data.scopeAllAttendance = !!scopeAllAttendance;
    if (canSelfApproveLeave !== undefined)
      data.canSelfApproveLeave = !!canSelfApproveLeave;
    if (active !== undefined) data.active = !!active;

    // Never let API callers change isSystem flag
    if (data.isSystem !== undefined) delete data.isSystem;

    // Validate permission identifiers
    if (permissions !== undefined) {
      const invalid = permissions.filter((p) => !VALID_PERMISSIONS.has(p));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Invalid permission identifiers: ${invalid.join(", ")}` },
          { status: 400 }
        );
      }

      // Block removal of critical perms from isSystem roles
      if (role.isSystem) {
        const newSet = new Set(permissions);
        const removed = CRITICAL_PERMS.filter(
          (p) => role.permissions.some((rp) => rp.identifier === p && rp.granted) &&
            !newSet.has(p)
        );
        if (removed.length > 0) {
          return NextResponse.json(
            {
              error: `Cannot remove critical permissions from a system role: ${removed.join(", ")}`,
            },
            { status: 400 }
          );
        }
      }
    }

    await db.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.role.update({ where: { id }, data });
      }
      if (permissions !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: Array.from(new Set(permissions)).map((identifier) => ({
              roleId: id,
              identifier,
              granted: true,
            })),
          });
        }
      }
    });

    const updated = await db.role.findUnique({
      where: { id },
      include: {
        permissions: true,
        _count: { select: { employees: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Update Role",
        entity: "Role",
        entityId: id,
        metadata: JSON.stringify({ name: updated?.name }),
      },
    });

    return NextResponse.json({
      role: updated
        ? {
            id: updated.id,
            name: updated.name,
            description: updated.description,
            scopeAllProfiling: updated.scopeAllProfiling,
            scopeAllEvaluation: updated.scopeAllEvaluation,
            scopeAllLeave: updated.scopeAllLeave,
            scopeAllReports: updated.scopeAllReports,
            scopeAllAttendance: updated.scopeAllAttendance,
            canSelfApproveLeave: updated.canSelfApproveLeave,
            isSystem: updated.isSystem,
            active: updated.active,
            permissions: updated.permissions
              .filter((p) => p.granted)
              .map((p) => p.identifier),
            employeeCount: updated._count.employees,
          }
        : null,
    });
  } catch (error) {
    console.error("[API /roles/[id] PATCH] Error:", error);
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
    const auth = await requirePermission(request, "roles.delete");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const role = await db.role.findUnique({ where: { id } });
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    if (role.isSystem) {
      return NextResponse.json(
        { error: "System roles cannot be disabled." },
        { status: 400 }
      );
    }

    if (!role.active) {
      return NextResponse.json(
        { error: "Role is already inactive." },
        { status: 400 }
      );
    }

    const updated = await db.role.update({
      where: { id },
      data: { active: false },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Disable Role",
        entity: "Role",
        entityId: id,
        metadata: JSON.stringify({ name: role.name }),
      },
    });

    return NextResponse.json({ role: updated });
  } catch (error) {
    console.error("[API /roles/[id] DELETE] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
