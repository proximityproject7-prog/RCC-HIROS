import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET    /api/groups       groups.view   — list groups + employeeCount
// POST   /api/groups       groups.manage — create group
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "groups.view");
    if (!auth.ok) return auth.response;

    const groups = await db.group.findMany({
      include: { _count: { select: { employees: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        code: g.code,
        description: g.description,
        active: g.active,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
        employeeCount: g._count.employees,
      })),
    });
  } catch (error) {
    console.error("[API /groups GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "groups.manage");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, code, description, active = true } = body as {
      name?: string;
      code?: string;
      description?: string;
      active?: boolean;
    };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Group name is required" },
        { status: 400 }
      );
    }
    if (!code || !code.trim()) {
      return NextResponse.json(
        { error: "Group code is required" },
        { status: 400 }
      );
    }

    const upperCode = code.trim().toUpperCase();

    const dupName = await db.group.findFirst({
      where: { name: name.trim().toLowerCase() },
    });
    if (dupName) {
      return NextResponse.json(
        { error: "Group with this name already exists" },
        { status: 409 }
      );
    }
    const dupCode = await db.group.findUnique({ where: { code: upperCode } });
    if (dupCode) {
      return NextResponse.json(
        { error: "Group with this code already exists" },
        { status: 409 }
      );
    }

    const group = await db.group.create({
      data: {
        name: name.trim(),
        code: upperCode,
        description: description?.trim() || null,
        active: !!active,
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Create Group",
        entity: "Group",
        entityId: group.id,
        metadata: JSON.stringify({ name: group.name, code: group.code }),
      },
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    console.error("[API /groups POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
