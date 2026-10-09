import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// GET /api/reports/attendance/raw  reports.export
// Raw analytics export — every clock in/out field + employee info
// as a downstream-processable CSV (no computed tardiness; analysis
// happens in Excel). Same filter params as the on-screen report so
// screen and file are 1-to-1.
// Params: dateFrom, dateTo (required), groupCodes (comma-separated
//   codes or "ALL"), roleId, q (name/ID contains).
// Group scoping based on scopeAllReports (mirrors attendance report).
// ═══════════════════════════════════════════════════════════════

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return `"${String(v).replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "reports.export");
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { searchParams } = new URL(request.url);
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    const groupCodesParam = searchParams.get("groupCodes") || "ALL";
    const roleId = searchParams.get("roleId") || undefined;
    const q = (searchParams.get("q") || "").trim().toLowerCase();

    if (!dateFromParam || !dateToParam) {
      return NextResponse.json(
        { error: "dateFrom and dateTo are required" },
        { status: 400 }
      );
    }
    const from = new Date(dateFromParam);
    const to = new Date(dateToParam);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }
    if (to < from) {
      return NextResponse.json(
        { error: "dateTo cannot be before dateFrom" },
        { status: 400 }
      );
    }

    // Group scoping (mirrors /api/reports/attendance)
    const canViewAll =
      user.isSystem ||
      user.scopeAllReports ||
      user.permissions.includes("reports.view");

    let groupIds: string[] | undefined;
    if (groupCodesParam !== "ALL") {
      const codes = groupCodesParam
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      if (codes.length === 0) {
        return NextResponse.json(
          { error: "Select at least one group or ALL" },
          { status: 400 }
        );
      }
      const grps = await db.group.findMany({
        where: { code: { in: codes } },
        select: { id: true, code: true },
      });
      groupIds = grps.map((g) => g.id);
      if (!canViewAll && user.groupId) {
        if (!groupIds.includes(user.groupId)) {
          return NextResponse.json(
            { error: "Forbidden - you can only export your own group" },
            { status: 403 }
          );
        }
        groupIds = [user.groupId];
      }
    } else if (!canViewAll && user.groupId) {
      groupIds = [user.groupId];
    }

    const records = await db.attendance.findMany({
      where: {
        date: { gte: startOfDay(from), lte: endOfDay(to) },
        ...(groupIds ? { employee: { groupId: { in: groupIds } } } : {}),
        ...(roleId ? { employee: { roleId } } : {}),
        ...(!user.isSystem
          ? { employee: { role: { isSystem: false } } }
          : {}),
      },
      include: {
        employee: {
          select: {
            employeeId: true,
            firstName: true,
            middleName: true,
            lastName: true,
            email: true,
            gender: true,
            employmentType: true,
            contractType: true,
            hireDate: true,
            active: true,
            group: { select: { code: true, name: true } },
            role: { select: { name: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { employeeId: "asc" }],
    });

    const filtered =
      q.length > 0
        ? records.filter((r) => {
            const full =
              `${r.employee.firstName} ${r.employee.middleName ?? ""} ${r.employee.lastName} ${r.employee.employeeId}`.toLowerCase();
            return full.includes(q);
          })
        : records;

    const headers = [
      "Employee ID",
      "Last Name",
      "First Name",
      "Middle Name",
      "Email",
      "Gender",
      "Employment Type",
      "Contract Type",
      "Hire Date",
      "Active",
      "Group Code",
      "Group Name",
      "Role",
      "Date",
      "Clock In",
      "Clock Out",
      "Clock-In Lat",
      "Clock-In Lng",
      "Clock-In On Premise",
      "Clock-In Distance (m)",
      "Clock-Out Lat",
      "Clock-Out Lng",
      "Clock-Out On Premise",
      "Clock-Out Distance (m)",
      "Biometric Verified",
      "Manually Edited",
      "Edit Remarks",
    ];

    const lines = [headers.map(csvCell).join(",")];
    for (const r of filtered) {
      const e = r.employee;
      lines.push(
        [
          e.employeeId,
          e.lastName,
          e.firstName,
          e.middleName ?? "",
          e.email,
          e.gender ?? "",
          e.employmentType,
          e.contractType,
          e.hireDate ? e.hireDate.toISOString().slice(0, 10) : "",
          e.active ? "TRUE" : "FALSE",
          e.group?.code ?? "",
          e.group?.name ?? "",
          e.role?.name ?? "",
          r.date.toISOString().slice(0, 10),
          r.clockInAt ? r.clockInAt.toISOString() : "",
          r.clockOutAt ? r.clockOutAt.toISOString() : "",
          r.clockInLat ?? "",
          r.clockInLng ?? "",
          r.clockInOnPremise === null || r.clockInOnPremise === undefined
            ? ""
            : r.clockInOnPremise
              ? "TRUE"
              : "FALSE",
          r.clockInDistance ?? "",
          r.clockOutLat ?? "",
          r.clockOutLng ?? "",
          r.clockOutOnPremise === null || r.clockOutOnPremise === undefined
            ? ""
            : r.clockOutOnPremise
              ? "TRUE"
              : "FALSE",
          r.clockOutDistance ?? "",
          r.biometricVerified ? "TRUE" : "FALSE",
          r.manuallyEdited ? "TRUE" : "FALSE",
          r.editRemarks ?? "",
        ]
          .map(csvCell)
          .join(",")
      );
    }

    const csv = lines.join("\n");
    const fname = `report-raw-${dateFromParam}-to-${dateToParam}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${fname}"`,
      },
    });
  } catch (error) {
    console.error("[API /reports/attendance/raw GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
