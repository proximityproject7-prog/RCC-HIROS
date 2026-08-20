import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/auth-token";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

// ═══════════════════════════════════════════════════════════════
// /api/leave-requests
// GET   auth            — list with scope=mine|pending_l1|pending_l2|all
// POST  leave.request   — multipart form data create
// ═══════════════════════════════════════════════════════════════

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "leave-docs");
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type ApproverInfo = { firstName: string; lastName: string };
type EmployeeBrief = {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  groupId: string | null;
};
type LeaveTypeBrief = { id: string; name: string; code: string };
type ApprovalRow = {
  id: string;
  level: number;
  approverId: string;
  approver: ApproverInfo | null;
  status: string;
  remarks: string | null;
  actedAt: Date | null;
  createdAt: Date;
};
type LeaveRequestFull = {
  id: string;
  requestNo: string;
  employeeId: string;
  employee: EmployeeBrief | null;
  leaveTypeId: string;
  leaveType: LeaveTypeBrief | null;
  startDate: Date;
  endDate: Date;
  workdays: number;
  reason: string;
  status: string;
  documentFileName: string | null;
  documentOriginalName: string | null;
  documentMimeType: string | null;
  documentFileSize: number | null;
  createdAt: Date;
  updatedAt: Date;
  approvals: ApprovalRow[];
};

/** Compute Mon–Fri workdays between two inclusive ISO date strings. */
function computeWorkdays(startISO: string, endISO: string): number {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (end < start) return 0;

  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  let workdays = 0;
  const cursor = new Date(s);
  while (cursor <= e) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) workdays += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return workdays;
}

/** Generate next requestNo like LR-2025-0001 */
async function generateRequestNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LR-${year}-`;
  const last = await db.leaveRequest.findFirst({
    where: { requestNo: { startsWith: prefix } },
    orderBy: { requestNo: "desc" },
    select: { requestNo: true },
  });
  let next = 1;
  if (last) {
    const m = last.requestNo.match(/-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

function serializeRequest(req: LeaveRequestFull) {
  return {
    id: req.id,
    requestNo: req.requestNo,
    employeeId: req.employeeId,
    employee: req.employee
      ? {
          id: req.employee.id,
          firstName: req.employee.firstName,
          lastName: req.employee.lastName,
          employeeId: req.employee.employeeId,
          groupId: req.employee.groupId,
        }
      : null,
    leaveTypeId: req.leaveTypeId,
    leaveType: req.leaveType
      ? { id: req.leaveType.id, name: req.leaveType.name, code: req.leaveType.code }
      : null,
    startDate: req.startDate.toISOString(),
    endDate: req.endDate.toISOString(),
    workdays: req.workdays,
    reason: req.reason,
    status: req.status,
    documentFileName: req.documentFileName,
    documentOriginalName: req.documentOriginalName,
    documentMimeType: req.documentMimeType,
    documentFileSize: req.documentFileSize,
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
    approvals: req.approvals.map((a) => ({
      id: a.id,
      level: a.level,
      approverId: a.approverId,
      approverName: a.approver
        ? `${a.approver.firstName} ${a.approver.lastName}`.trim()
        : null,
      status: a.status,
      remarks: a.remarks,
      actedAt: a.actedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

const REQUEST_INCLUDE = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeId: true,
      groupId: true,
    },
  },
  leaveType: { select: { id: true, name: true, code: true } },
  approvals: {
    include: {
      approver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { level: "asc" as const },
  },
} satisfies Record<string, unknown>;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") || "mine";
    const { user } = auth;

    let where: Record<string, unknown> = {};

    if (scope === "mine") {
      where.employeeId = user.id;
    } else if (scope === "pending_l1") {
      where.status = "pending_l1";
      if (!user.scopeAllLeave && user.groupId) {
        where.employee = { groupId: user.groupId };
      }
      if (!user.isSystem && !user.permissions.includes("leave.approve_l1")) {
        return NextResponse.json(
          { error: "Forbidden - insufficient permissions" },
          { status: 403 }
        );
      }
    } else if (scope === "pending_l2") {
      where.status = "pending_l2";
      if (!user.scopeAllLeave && user.groupId) {
        where.employee = { groupId: user.groupId };
      }
      if (!user.isSystem && !user.permissions.includes("leave.approve_l2")) {
        return NextResponse.json(
          { error: "Forbidden - insufficient permissions" },
          { status: 403 }
        );
      }
    } else if (scope === "all") {
      if (
        !user.isSystem &&
        !user.permissions.includes("leave.view_all") &&
        !user.scopeAllLeave
      ) {
        if (user.groupId) {
          where.employee = { groupId: user.groupId };
        } else {
          where.employeeId = user.id;
        }
      }
    } else {
      return NextResponse.json(
        { error: `Invalid scope: ${scope}` },
        { status: 400 }
      );
    }

    const requests = await db.leaveRequest.findMany({
      where,
       
      include: REQUEST_INCLUDE as any,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      requests: requests.map((r) => serializeRequest(r as unknown as LeaveRequestFull)),
    });
  } catch (error) {
    console.error("[API /leave-requests GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, "leave.request");
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const formData = await request.formData();
    const leaveTypeId = formData.get("leaveTypeId") as string | null;
    const startDate = formData.get("startDate") as string | null;
    const endDate = formData.get("endDate") as string | null;
    const reason = formData.get("reason") as string | null;
    const file = formData.get("file");

    if (!leaveTypeId || !startDate || !endDate || !reason) {
      return NextResponse.json(
        { error: "leaveTypeId, startDate, endDate, and reason are required" },
        { status: 400 }
      );
    }

    const leaveType = await db.leaveType.findUnique({
      where: { id: leaveTypeId },
    });
    if (!leaveType) {
      return NextResponse.json(
        { error: "Leave type not found" },
        { status: 400 }
      );
    }
    if (!leaveType.active) {
      return NextResponse.json(
        { error: "Leave type is inactive and cannot be requested" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }
    if (end < start) {
      return NextResponse.json(
        { error: "End date cannot be before start date" },
        { status: 400 }
      );
    }

    const workdays = computeWorkdays(startDate, endDate);

    // Edge Case 7 — Balance warning
    const year = start.getFullYear();
    const balance = await db.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: user.id,
          leaveTypeId,
          year,
        },
      },
    });
    const balanceWarning =
      balance && balance.totalDays - balance.usedDays < workdays
        ? {
            warning: true,
            message: `Requested ${workdays} day(s) exceeds remaining balance of ${(
              balance.totalDays - balance.usedDays
            ).toFixed(2)} day(s). Request will still be created.`,
            remaining: balance.totalDays - balance.usedDays,
            requested: workdays,
          }
        : null;

    // Handle file upload
    let documentFileName: string | null = null;
    let documentOriginalName: string | null = null;
    let documentMimeType: string | null = null;
    let documentFileSize: number | null = null;

    if (file && file instanceof File) {
      if (!ALLOWED_MIME.has(file.type)) {
        return NextResponse.json(
          { error: `File type not allowed: ${file.type || "unknown"}` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File exceeds 25MB limit" },
          { status: 400 }
        );
      }
      await mkdir(UPLOAD_ROOT, { recursive: true });
      const ext = path.extname(file.name) || "";
      documentFileName = `${randomUUID()}${ext}`;
      documentOriginalName = file.name;
      documentMimeType = file.type || "application/octet-stream";
      documentFileSize = file.size;
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(UPLOAD_ROOT, documentFileName), buffer);
    }

    const requestNo = await generateRequestNo();

    const newRequest = await db.leaveRequest.create({
      data: {
        requestNo,
        employeeId: user.id,
        leaveTypeId,
        startDate: start,
        endDate: end,
        workdays,
        reason: reason.trim(),
        status: "pending_l1",
        documentFileName,
        documentOriginalName,
        documentMimeType,
        documentFileSize,
      },
       
      include: REQUEST_INCLUDE as any,
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "Create Leave Request",
        entity: "LeaveRequest",
        entityId: newRequest.id,
        metadata: JSON.stringify({
          requestNo,
          leaveTypeId,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          workdays,
        }),
      },
    });

    return NextResponse.json(
      {
        request: serializeRequest(newRequest as unknown as LeaveRequestFull),
        balanceWarning,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API /leave-requests POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
