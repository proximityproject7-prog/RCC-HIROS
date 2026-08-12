import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requirePermission,
  requireAuth,
} from "@/lib/auth-token";
import { PERMISSIONS } from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════
// GET /api/roles — list all roles with permissions + employee count
// POST /api/roles — create role with permissions
// ═══════════════════════════════════════════════════════════════

const VALID_PERMISSIONS = new Set<string>(PERMISSIONS);

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "roles.view");
    if (!auth.ok) return auth.response;

    const roles = await db.role.findMany({
      include: {
        permissions: true,
        _count: { select: { employees: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const result = roles.map((role) => ({
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
    }));

    return NextResponse.json({ roles: result });
  } catch (error) {
    console.error("[API /roles GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "roles.create");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const {
      name,
      description,
      scopeAllProfiling = false,
      scopeAllEvaluation = false,
      scopeAllLeave = false,
      scopeAllReports = false,
      scopeAllAttendance = false,
      canSelfApproveLeave = false,
      permissions = [],
    } = body as {
      name?: string;
      description?: string;
      scopeAllProfiling?: boolean;
      scopeAllEvaluation?: boolean;
      scopeAllLeave?: boolean;
      scopeAllReports?: boolean;
      scopeAllAttendance?: boolean;
      canSelfApproveLeave?: boolean;
      permissions?: string[];
    };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Role name is required" },
        { status: 400 }
      );
    }

    // Validate permission identifiers
    const invalid = permissions.filter((p) => !VALID_PERMISSIONS.has(p));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid permission identifiers: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }

    // Uniqueness check (case-insensitive on SQLite via toLowerCase)
    const nameLower = name.trim().toLowerCase();
    const existing = await db.role.findFirst({
      where: { name: nameLower },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Role with this name already exists" },
        { status: 409 }
      );
    }

    const role = await db.role.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        scopeAllProfiling: !!scopeAllProfiling,
        scopeAllEvaluation: !!scopeAllEvaluation,
        scopeAllLeave: !!scopeAllLeave,
        scopeAllReports: !!scopeAllReports,
        scopeAllAttendance: !!scopeAllAttendance,
        canSelfApproveLeave: !!canSelfApproveLeave,
        isSystem: false, // Never allow creating system roles via API
        permissions: {
          create: Array.from(new Set(permissions)).map((identifier) => ({
            identifier,
            granted: true,
          })),
        },
      },
      include: { permissions: true, _count: { select: { employees: true } } },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Create Role",
        entity: "Role",
        entityId: role.id,
        metadata: JSON.stringify({ name: role.name }),
      },
    });

    return NextResponse.json(
      {
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
          permissions: role.permissions
            .filter((p) => p.granted)
            .map((p) => p.identifier),
          employeeCount: role._count.employees,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API /roles POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Suppress unused-import warning for requireAuth (kept for symmetry / future use)
void requireAuth;
