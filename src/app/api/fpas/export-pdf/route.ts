import { NextRequest, NextResponse } from "next/server";
import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";
import type { FpasFormData } from "@/lib/fpas-form";
import { FpasPdfBundle, FpasPdfDocument } from "@/components/fpas/fpas-pdf";
import { fpasPdfFilename, safeFilePart } from "@/lib/pdf-export";
import { createZip } from "@/lib/zip-store";

// ═══════════════════════════════════════════════════════════════
// GET /api/fpas/export-pdf — department FPAS bundle (fpas.manage)
//   ?schoolYear=YYYY-YYYY (required) &groupCode=XXX (optional, ALL)
//   &format=pdf (one merged file) | zip (one file per member)
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "fpas.manage");
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const schoolYear = searchParams.get("schoolYear")?.trim() || "";
    const groupCode = searchParams.get("groupCode") || "ALL";
    const format = searchParams.get("format") === "zip" ? "zip" : "pdf";

    if (!schoolYear) {
      return NextResponse.json(
        { error: "schoolYear is required" },
        { status: 400 }
      );
    }

    let groupId: string | undefined;
    if (groupCode !== "ALL") {
      const grp = await db.group.findUnique({ where: { code: groupCode } });
      if (!grp) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      groupId = grp.id;
    }

    const submissions = await db.fpasSubmission.findMany({
      where: {
        schoolYear,
        ...(groupId ? { employee: { groupId } } : {}),
      },
      include: {
        employee: {
          select: {
            employeeId: true,
            firstName: true,
            lastName: true,
            group: { select: { code: true } },
            role: { select: { isSystem: true } },
          },
        },
      },
      orderBy: { employee: { employeeId: "asc" } },
    });
    const rows = submissions.filter((s) => !s.employee?.role?.isSystem);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No submitted FPAS forms for this scope" },
        { status: 404 }
      );
    }

    const tag = `${safeFilePart(schoolYear)}-${safeFilePart(groupCode)}`;

    if (format === "zip") {
      const entries: { name: string; data: Uint8Array }[] = [];
      for (const s of rows) {
        const formData = JSON.parse(s.formData) as FpasFormData;
        const pdf = await renderToBuffer(
          FpasPdfDocument({ formData, schoolYear }) as unknown as ReactElement<DocumentProps>
        );
        const name = s.employee
          ? `${s.employee.firstName} ${s.employee.lastName}`.trim()
          : s.employeeId;
        entries.push({
          name: fpasPdfFilename(s.employee?.employeeId ?? s.employeeId, name, schoolYear),
          data: new Uint8Array(pdf),
        });
      }
      const zip = createZip(entries);
      return new NextResponse(new Uint8Array(zip), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="fpas-${tag}.zip"`,
        },
      });
    }

    const buffer = await renderToBuffer(
      FpasPdfBundle({
        docs: rows.map((s) => ({
          formData: JSON.parse(s.formData) as FpasFormData,
          schoolYear,
        })),
      }) as unknown as ReactElement<DocumentProps>
    );
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="fpas-${tag}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[API /fpas/export-pdf] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

