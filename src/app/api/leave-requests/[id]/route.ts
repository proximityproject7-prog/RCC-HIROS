import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// /api/leave-requests/[id]
// GET   auth — single request with access check
// PATCH auth — recall (Edge Case 6)
//   Only the L1 approver who approved can recall, and only while
//   the request is in pending_l2 status. Recall moves the request
//   back to pending_l1 (re-opens L1) and marks the L1 approval as
//   "recalled" (row preserved for audit; re-approval upserts it).
// ═══════════════════════════════════════════════════════════════

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
      approver: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { level: "asc" as const },
  },
} satisfies Record<string, unknown>;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { id } = await params;
    const req = await db.leaveRequest.findUnique({
      where: { id },
       
      include: REQUEST_INCLUDE as any,
    });

    if (!req) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 }
      );
    }

    // Access check
     
    const r = req as any;
    const isRequester = r.employeeId === user.id;
    const isApprover = (r.approvals || []).some(
      (a: { approverId: string }) => a.approverId === user.id
    );
    const canViewAll =
      user.isSystem ||
      user.permissions.includes("leave.view_all") ||
      user.scopeAllLeave ||
      (user.groupId && r.employee?.groupId === user.groupId);

    if (!isRequester && !isApprover && !canViewAll) {
      return NextResponse.json(
        { error: "You do not have access to this request" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      request: {
        id: r.id,
        requestNo: r.requestNo,
        employeeId: r.employeeId,
        employee: r.employee
          ? {
              id: r.employee.id,
              firstName: r.employee.firstName,
              lastName: r.employee.lastName,
              employeeId: r.employee.employeeId,
              groupId: r.employee.groupId,
            }
          : null,
        leaveTypeId: r.leaveTypeId,
        leaveType: r.leaveType
          ? {
              id: r.leaveType.id,
              name: r.leaveType.name,
              code: r.leaveType.code,
            }
          : null,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate.toISOString(),
        workdays: r.workdays,
        reason: r.reason,
        status: r.status,
        documentFileName: r.documentFileName,
        documentOriginalName: r.documentOriginalName,
        documentMimeType: r.documentMimeType,
        documentFileSize: r.documentFileSize,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        approvals: (r.approvals || []).map(
          (a: {
            id: string;
            level: number;
            approverId: string;
            approver: { firstName: string; lastName: string } | null;
            status: string;
            remarks: string | null;
            actedAt: Date | null;
            createdAt: Date;
          }) => ({
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
          })
        ),
      },
    });
  } catch (error) {
    console.error("[API /leave-requests/[id] GET] Error:", error);
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
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { id } = await params;
    const body = await request.json();
    const { action } = body as { action?: string };

    if (action !== "recall") {
      return NextResponse.json(
        { error: "Unsupported PATCH action" },
        { status: 400 }
      );
    }

    const req = await db.leaveRequest.findUnique({
      where: { id },
      include: { approvals: true },
    });
    if (!req) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 }
      );
    }

    if (req.status !== "pending_l2") {
      return NextResponse.json(
        { error: "Only requests pending L2 approval can be recalled" },
        { status: 400 }
      );
    }

    const l1Approval = req.approvals.find(
      (a) => a.level === 1 && a.status === "approved"
    );
    if (!l1Approval) {
      return NextResponse.json(
        { error: "No L1 approval exists on this request" },
        { status: 400 }
      );
    }
    if (l1Approval.approverId !== user.id && !user.isSystem) {
      return NextResponse.json(
        { error: "Only the L1 approver who approved this request can recall it" },
        { status: 403 }
      );
    }

    await db.$transaction(async (tx) => {
      // Conditional gate: recall only while still pending L2 (race-safe).
      const gate = await tx.leaveRequest.updateMany({
        where: { id, status: "pending_l2" },
        data: { status: "pending_l1" },
      });
      if (gate.count === 0) throw new Error("ERR_STALE_STATUS");
      // D — mark recalled instead of deleting: preserves the audit trail
      // and keeps the (request, level) row for the re-approval upsert.
      await tx.leaveApproval.update({
        where: { id: l1Approval.id },
        data: { status: "recalled", actedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "Recall Leave Request",
          entity: "LeaveRequest",
          entityId: id,
          metadata: JSON.stringify({ requestNo: req.requestNo }),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ERR_STALE_STATUS") {
      return NextResponse.json(
        {
          error:
            "Request status changed — it is no longer pending L2 approval. Please refresh.",
        },
        { status: 400 }
      );
    }
    console.error("[API /leave-requests/[id] PATCH] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE — Cancel a leave request (employee cancels their own pending request)
//   Only the requester can cancel, and only if status is pending_l1 or pending_l2.
//   Sets status to "cancelled" (soft-delete — record preserved for audit).
// ═══════════════════════════════════════════════════════════════

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const { id } = await params;
    const lr = await db.leaveRequest.findUnique({
      where: { id },
    });

    if (!lr) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }

    // Only the requester can cancel
    if (lr.employeeId !== user.id) {
      return NextResponse.json({ error: "You can only cancel your own requests" }, { status: 403 });
    }

    // Only pending requests can be cancelled
    if (lr.status !== "pending_l1" && lr.status !== "pending_l2") {
      return NextResponse.json({ error: "Only pending requests can be cancelled" }, { status: 400 });
    }

    await db.leaveRequest.update({
      where: { id },
      data: { status: "cancelled" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /leave-requests/[id] DELETE] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
