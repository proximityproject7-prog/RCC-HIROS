import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-token";
import { MAX_TEMPLATES_PER_EMPLOYEE } from "@/lib/biometric";

// ═══════════════════════════════════════════════════════════════
// POST   /api/biometric/enroll  — save one enrolled template
//   { employeeId, fingerIndex (0-9), templateData (base64), quality? }
//   Self: biometric.enroll · Others: biometric.manage · Cap enforced.
// DELETE /api/biometric/enroll?templateId=X — remove one template
// ═══════════════════════════════════════════════════════════════

const MAX_BLOB_CHARS = 200_000; // ~150KB blob sanity cap

async function canModify(
  requester: { id: string; isSystem: boolean; permissions: string[] },
  targetId: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  if (targetId === requester.id) {
    if (
      requester.isSystem ||
      requester.permissions.includes("biometric.enroll") ||
      requester.permissions.includes("biometric.manage")
    ) {
      return { ok: true, status: 200 };
    }
    return { ok: false, status: 403, error: "Fingerprint enrollment is not enabled for your role" };
  }
  if (requester.isSystem || requester.permissions.includes("biometric.manage")) {
    return { ok: true, status: 200 };
  }
  return { ok: false, status: 403, error: "You do not have permission to manage biometrics" };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const employeeId = typeof body?.employeeId === "string" ? body.employeeId : "";
    const fingerIndex = typeof body?.fingerIndex === "number" ? Math.trunc(body.fingerIndex) : -1;
    const templateData = typeof body?.templateData === "string" ? body.templateData : "";
    const quality =
      typeof body?.quality === "number" ? Math.max(0, Math.min(100, Math.trunc(body.quality))) : 0;

    if (!employeeId) {
      return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
    }
    if (fingerIndex < 0 || fingerIndex > 9) {
      return NextResponse.json({ error: "fingerIndex must be 0-9" }, { status: 400 });
    }
    if (!templateData || templateData.length > MAX_BLOB_CHARS) {
      return NextResponse.json({ error: "templateData is missing or too large" }, { status: 400 });
    }

    const gate = await canModify(auth.user, employeeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        employeeId: true,
        role: { select: { isSystem: true } },
        _count: { select: { biometricTemplates: true } },
      },
    });
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    if (employee.role?.isSystem && !auth.user.isSystem) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    if (employee._count.biometricTemplates >= MAX_TEMPLATES_PER_EMPLOYEE) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_TEMPLATES_PER_EMPLOYEE} fingerprints per employee` },
        { status: 409 }
      );
    }

    const created = await db.biometricTemplate.create({
      data: { employeeId, fingerIndex, templateData, quality },
    }).catch(() => null);
    if (!created) {
      // Almost certainly the @@unique([employeeId, fingerIndex]) slot conflict
      return NextResponse.json(
        { error: "This finger slot is already enrolled for this employee" },
        { status: 409 }
      );
    }

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Biometric Enroll",
        entity: "BiometricTemplate",
        entityId: created.id,
        metadata: JSON.stringify({ employeeId, fingerIndex, quality }),
      },
    });

    return NextResponse.json(
      {
        template: {
          id: created.id,
          fingerIndex: created.fingerIndex,
          quality: created.quality,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/biometric/enroll error:", err);
    return NextResponse.json({ error: "Failed to save fingerprint template" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get("templateId") || "";
    if (!templateId) {
      return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    }

    const template = await db.biometricTemplate.findUnique({
      where: { id: templateId },
      include: { employee: { select: { id: true, role: { select: { isSystem: true } } } } },
    });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    if (template.employee.role?.isSystem && !auth.user.isSystem) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const gate = await canModify(auth.user, template.employeeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    await db.biometricTemplate.delete({ where: { id: templateId } });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Biometric Delete",
        entity: "BiometricTemplate",
        entityId: templateId,
        metadata: JSON.stringify({
          employeeId: template.employeeId,
          fingerIndex: template.fingerIndex,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/biometric/enroll error:", err);
    return NextResponse.json({ error: "Failed to delete fingerprint template" }, { status: 500 });
  }
}
