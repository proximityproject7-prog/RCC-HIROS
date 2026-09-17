import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// /api/contract-types/[id]
// PATCH  profiling.edit — update
// DELETE profiling.edit — soft-delete (set active=false)
// ═══════════════════════════════════════════════════════════════

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, "profiling.edit");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const existing = await db.contractType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Contract type not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, code, active } = body as {
      name?: string;
      code?: string;
      active?: boolean;
    };

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      const dup = await db.contractType.findFirst({
        where: { name: { equals: name.trim(), mode: "insensitive" }, NOT: { id } },
      });
      if (dup) {
        return NextResponse.json({ error: "Name already exists" }, { status: 409 });
      }
      updateData.name = name.trim();
    }

    if (code !== undefined) {
      if (!code.trim()) {
        return NextResponse.json({ error: "Code cannot be empty" }, { status: 400 });
      }
      const upperCode = code.trim().toUpperCase();
      const dup = await db.contractType.findFirst({
        where: { code: upperCode, NOT: { id } },
      });
      if (dup) {
        return NextResponse.json({ error: "Code already exists" }, { status: 409 });
      }
      updateData.code = upperCode;
    }

    if (active !== undefined) {
      updateData.active = active;
    }

    const contractType = await db.contractType.update({
      where: { id },
      data: updateData,
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Update Contract Type",
        entity: "ContractType",
        entityId: id,
        metadata: JSON.stringify({ name: contractType.name, code: contractType.code }),
      },
    });

    return NextResponse.json({ contractType });
  } catch (error) {
    console.error("[API /contract-types/[id] PATCH] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, "profiling.edit");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const existing = await db.contractType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Contract type not found" }, { status: 404 });
    }

    // Soft-delete: set active=false
    await db.contractType.update({
      where: { id },
      data: { active: false },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Deactivate Contract Type",
        entity: "ContractType",
        entityId: id,
        metadata: JSON.stringify({ name: existing.name }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /contract-types/[id] DELETE] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
