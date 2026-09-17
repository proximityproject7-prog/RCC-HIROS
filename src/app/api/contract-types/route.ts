import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET   /api/contract-types   auth only        — list contract types
// POST  /api/contract-types   profiling.edit   — create
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const isAdmin = auth.user.isSystem || auth.user.permissions.includes("profiling.edit");

    const contractTypes = await db.contractType.findMany({
      where: isAdmin ? {} : { active: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ contractTypes });
  } catch (error) {
    console.error("[API /contract-types GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "profiling.edit");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, code, active = true } = body as {
      name?: string;
      code?: string;
      active?: boolean;
    };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Contract type name is required" },
        { status: 400 }
      );
    }
    if (!code || !code.trim()) {
      return NextResponse.json(
        { error: "Contract type code is required" },
        { status: 400 }
      );
    }

    const upperCode = code.trim().toUpperCase();

    const dupName = await db.contractType.findFirst({
      where: { name: { equals: name.trim(), mode: "insensitive" } },
    });
    if (dupName) {
      return NextResponse.json(
        { error: "Contract type with this name already exists" },
        { status: 409 }
      );
    }
    const dupCode = await db.contractType.findUnique({
      where: { code: upperCode },
    });
    if (dupCode) {
      return NextResponse.json(
        { error: "Contract type with this code already exists" },
        { status: 409 }
      );
    }

    const contractType = await db.contractType.create({
      data: {
        name: name.trim(),
        code: upperCode,
        active: !!active,
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Create Contract Type",
        entity: "ContractType",
        entityId: contractType.id,
        metadata: JSON.stringify({ name: contractType.name, code: contractType.code }),
      },
    });

    return NextResponse.json({ contractType }, { status: 201 });
  } catch (error) {
    console.error("[API /contract-types POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
