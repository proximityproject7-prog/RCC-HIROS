import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnyPermission } from "@/lib/auth-token";
import { randomUUID } from "crypto";
import { mkdir, writeFile, unlink, readFile } from "fs/promises";
import path from "path";

// ═══════════════════════════════════════════════════════════════
// /api/employees/[id]/photo
// GET    (public)    — serve profile photo
// POST   profiling.edit|profile.*|canEditProfile — upload 2x2 photo
// DELETE profiling.edit|profile.* — remove photo
// ═══════════════════════════════════════════════════════════════

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const PHOTO_DIR = path.join(process.cwd(), "uploads", "employees", "photos");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const employee = await db.employee.findUnique({
      where: { id },
      select: { id: true, photo: true },
    });
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    if (!employee.photo) {
      return NextResponse.json({ error: "No photo" }, { status: 404 });
    }

    const filePath = path.join(PHOTO_DIR, id, employee.photo);
    try {
      const buffer = await readFile(filePath);
      const ext = path.extname(employee.photo).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
      };
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": mimeMap[ext] || "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return NextResponse.json({ error: "Photo file not found" }, { status: 404 });
    }
  } catch (error) {
    console.error("[API /employees/[id]/photo GET] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAnyPermission(request, [
      "profiling.edit",
      "profile.editAll",
      "profile.selfEdit",
    ]);
    if (!auth.ok) return auth.response;

    const { id } = await params;

    // Permission check: self-edit or admin
    const isSelfEdit = auth.user.id === id && auth.user.permissions.includes("profile.selfEdit");
    const isAdmin = auth.user.permissions.includes("profiling.edit") || auth.user.permissions.includes("profile.editAll");
    if (!isAdmin && !isSelfEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const employee = await db.employee.findUnique({ where: { id }, select: { id: true } });
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("photo");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No photo uploaded (expected 'photo' field)" }, { status: 400 });
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: "Only JPG, PNG, or WebP images are allowed" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File exceeds 5MB limit" }, { status: 400 });
    }

    // Ensure directory exists
    const dir = path.join(PHOTO_DIR, id);
    await mkdir(dir, { recursive: true });

    const ext = file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : ".jpg";
    const fileName = `profile${ext}`;
    const filePath = path.join(dir, fileName);

    // Delete old photo if exists
    const oldPhoto = await db.employee.findUnique({ where: { id }, select: { photo: true } });
    if (oldPhoto?.photo) {
      const oldPath = path.join(dir, oldPhoto.photo);
      await unlink(oldPath).catch(() => {});
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    await db.employee.update({
      where: { id },
      data: { photo: fileName },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "Upload Photo",
        entity: "Employee",
        entityId: id,
        metadata: JSON.stringify({ employeeId: id, fileName, size: file.size }),
      },
    });

    return NextResponse.json({ photo: fileName });
  } catch (error) {
    console.error("[API /employees/[id]/photo POST] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAnyPermission(request, [
      "profiling.edit",
      "profile.editAll",
      "profile.selfEdit",
    ]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const isSelfEdit = auth.user.id === id && auth.user.permissions.includes("profile.selfEdit");
    const isAdmin = auth.user.permissions.includes("profiling.edit") || auth.user.permissions.includes("profile.editAll");
    if (!isAdmin && !isSelfEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const employee = await db.employee.findUnique({ where: { id }, select: { id: true, photo: true } });
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    if (employee.photo) {
      const filePath = path.join(PHOTO_DIR, id, employee.photo);
      await unlink(filePath).catch(() => {});
      await db.employee.update({ where: { id }, data: { photo: null } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /employees/[id]/photo DELETE] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
