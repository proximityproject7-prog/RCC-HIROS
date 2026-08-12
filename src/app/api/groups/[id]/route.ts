import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requirePermission,
  requireAnyPermission,
} from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// /api/groups/[id]
// GET    groups.view OR groups.manage — single group
// PATCH  groups.manage — update
// DELETE groups.manage — block if employees assigned
// ═══════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAnyPermission(request, [
      "groups.view",
      "groups.manage",
    ]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const group = await db.group.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        code: group.code,
        description: group.description,
        active: group.active,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
        employeeCount: group._count.employees,
      },
    });
  } catch (error) {
    console.error("[API /groups/[id] GET] Error:", error);
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
    const auth = await requirePermission(request, "groups.manage");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const group = await db.group.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, code, description, active } = body as {
      name?: string;
      code?: string;
      description?: string | null;
      active?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim() && name !== group.name) {
      const dup = await db.group.findFirst({
        where: { name: name.trim().toLowerCase(), NOT: { id } },
      });
      if (dup) {
        return NextResponse.json(
          { error: "Group with this name already exists" },
          { status: 409 }
        );
      }
      data.name = name.trim();
    }
    if (typeof code === "string" && code.trim()) {
      const upper = code.trim().toUpperCase();
      if (upper !== group.code) {
        const dup = await db.group.findUnique({ where: { code: upper } });
        if (dup && dup.id !== id) {
          return NextResponse.json(
            { error: "Group with this code already exists" },
            { status: 409 }
          );
        }
        data.code = upper;
      }
    }
    if (description !== undefined) {
      data.description =
        typeof description === "string" && description.trim()
          ? description.trim()
          : null;
    }
    if (active !== undefined) data.active = !!active;

    const updated = await db.group.update({ where: { id }, data });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Update Group",
        entity: "Group",
        entityId: id,
        metadata: JSON.stringify({ name: updated.name }),
      },
    });

    return NextResponse.json({ group: updated });
  } catch (error) {
    console.error("[API /groups/[id] PATCH] Error:", error);
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
    const auth = await requirePermission(request, "groups.manage");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const group = await db.group.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (!group.active) {
      return NextResponse.json(
        { error: "Group is already inactive." },
        { status: 400 }
      );
    }

    const updated = await db.group.update({
      where: { id },
      data: { active: false },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Disable Group",
        entity: "Group",
        entityId: id,
        metadata: JSON.stringify({ name: group.name, code: group.code }),
      },
    });

    return NextResponse.json({ group: updated });
  } catch (error) {
    console.error("[API /groups/[id] DELETE] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
