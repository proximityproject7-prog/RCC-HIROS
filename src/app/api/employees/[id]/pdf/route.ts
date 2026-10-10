import { NextRequest, NextResponse } from "next/server";
import type { ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-token";
import { ProfilePdfDocument } from "@/components/profiling/profile-pdf";
import type { PrintableEmployee } from "@/components/profiling/profile-print";
import { profilePdfFilename } from "@/lib/pdf-export";

// ═══════════════════════════════════════════════════════════════
// GET /api/employees/[id]/pdf — download the personnel profile as PDF.
// Access mirrors GET /api/employees/[id]: self, or profiling.view.
// ═══════════════════════════════════════════════════════════════
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const { id } = await params;

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
        group: { select: { name: true } },
        role: { select: { name: true } },
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const canViewInactive =
      auth.user.permissions.includes("profiling.view_inactive") ||
      auth.user.isSystem;
    if (!employee.active && !canViewInactive) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    let parsed: Record<string, Array<Record<string, unknown>>> = {};
    try {
      parsed = employee.profileData ? (JSON.parse(employee.profileData) as Record<string, Array<Record<string, unknown>>>) : {};
    } catch {
      parsed = {};
    }

    // Embed the 2x2 photo bytes (fallback: caption box in the document).
    let photoDataUri: string | null = null;
    if (employee.photo) {
      try {
        const filePath = path.join(
          process.cwd(), "uploads", "employees", "photos", employee.id, employee.photo
        );
        const buf = await readFile(filePath);
        const ext = employee.photo.split(".").pop()?.toLowerCase();
        const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        photoDataUri = `data:${mime};base64,${buf.toString("base64")}`;
      } catch {
        photoDataUri = null;
      }
    }

    const printable: PrintableEmployee = {
      employeeId: employee.employeeId,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone,
      address: employee.address,
      birthday: employee.birthday?.toISOString() ?? null,
      gender: employee.gender,
      employmentType: employee.employmentType,
      contractType: employee.contractType,
      hireDate: employee.hireDate?.toISOString() ?? null,
      active: employee.active,
      groupName: employee.group?.name ?? null,
      roleName: employee.role?.name ?? null,
      placeOfBirth: employee.placeOfBirth,
      rank: employee.rank,
      civilStatus: employee.civilStatus,
      citizenship: employee.citizenship,
      religion: employee.religion,
      photo: employee.photo,
    };

    const year = new Date().getFullYear();
    const buffer = await renderToBuffer(
      ProfilePdfDocument({
        employee: printable,
        profileData: parsed,
        photoDataUri,
        schoolYear: `${year}-${year + 1}`,
      }) as unknown as ReactElement<DocumentProps>
    );

    const fname = profilePdfFilename(
      employee.employeeId,
      `${employee.firstName} ${employee.lastName}`.trim()
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fname}"`,
      },
    });
  } catch (error) {
    console.error("[API /employees/[id]/pdf] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
