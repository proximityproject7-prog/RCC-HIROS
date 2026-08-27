import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { signToken } from "@/lib/auth-token";

// ═══════════════════════════════════════════════════════════════
// Rate limiter (in-memory, IP-based)
// ═══════════════════════════════════════════════════════════════

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // requests per window per IP

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetInMs: RATE_LIMIT_WINDOW_MS };
  }

  entry.count++;
  const remaining = Math.max(0, RATE_LIMIT_MAX - entry.count);
  const resetInMs = entry.resetAt - now;

  if (entry.count > RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetInMs };
  }

  return { allowed: true, remaining, resetInMs };
}

// ═══════════════════════════════════════════════════════════════
// POST /api/auth/login
// Accepts { identifier, password } where identifier is email or employeeId.
// Locks account after 5 failed attempts. Returns JWT + full user payload.
// ═══════════════════════════════════════════════════════════════

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function buildFullName(
  firstName: string,
  middleName: string | null,
  lastName: string
): string {
  return [firstName, middleName, lastName].filter(Boolean).join(" ");
}

 
function publicUser(emp: any) {
  if (!emp) return null;
  const permissions = (emp.role?.permissions || [])
    .filter((p: { granted: boolean }) => p.granted)
    .map((p: { identifier: string }) => p.identifier);
  return {
    id: emp.id,
    email: emp.email,
    name: buildFullName(emp.firstName, emp.middleName, emp.lastName),
    employeeId: emp.employeeId,
    roleId: emp.role?.id,
    roleName: emp.role?.name,
    scopeAllProfiling: emp.role?.scopeAllProfiling ?? false,
    scopeAllEvaluation: emp.role?.scopeAllEvaluation ?? false,
    scopeAllLeave: emp.role?.scopeAllLeave ?? false,
    scopeAllReports: emp.role?.scopeAllReports ?? false,
    scopeAllAttendance: emp.role?.scopeAllAttendance ?? false,
    scopeGroupAttendance: emp.role?.scopeGroupAttendance ?? false,
    canSelfApproveLeave: emp.role?.canSelfApproveLeave ?? false,
    canEditProfile: emp.role?.canEditProfile ?? false,
    canChangePassword: emp.role?.canChangePassword ?? false,
    isSystem: emp.role?.isSystem ?? false,
    groupId: emp.groupId,
    group: emp.group?.name ?? null,
    active: emp.active,
    mustChangePassword: emp.mustChangePwd,
    permissions,
  };
}

export async function POST(request: NextRequest) {
  try {
    // ── Rate limit check ──
    const ip = getClientIp(request);
    const { allowed, remaining, resetInMs } = checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Too many login attempts. Please try again later.",
          retryAfterMs: resetInMs,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(resetInMs / 1000)),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const body = await request.json();
    const { identifier, password } = body as {
      identifier?: string;
      password?: string;
    };

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Employee ID/Email and password are required." },
        { status: 400 }
      );
    }

    const input = identifier.trim();
    const emailLower = input.toLowerCase();

    // Look up by email (case-insensitive) OR employeeId (case-sensitive)
    const employee = await db.employee.findFirst({
      where: {
        OR: [{ email: emailLower }, { employeeId: input }],
      },
      include: {
        role: { include: { permissions: true } },
        group: true,
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Invalid Employee ID/Email or password." },
        { status: 401 }
      );
    }

    if (!employee.role) {
      return NextResponse.json(
        { error: "Your account has no role assigned. Please contact an administrator." },
        { status: 403 }
      );
    }

    if (!employee.active) {
      return NextResponse.json(
        { error: "Your account is inactive. Please contact HR." },
        { status: 403 }
      );
    }

    if (!employee.passwordHash) {
      return NextResponse.json(
        { error: "Your account is not configured for login. Please contact IT." },
        { status: 403 }
      );
    }

    // Locked?
    if (employee.lockedUntil && employee.lockedUntil.getTime() > Date.now()) {
      const minutesLeft = Math.ceil(
        (employee.lockedUntil.getTime() - Date.now()) / 60_000
      );
      return NextResponse.json(
        {
          error: `Account is temporarily locked. Try again in ${minutesLeft} minute(s).`,
        },
        { status: 429 }
      );
    }

    const isValid = await compare(password, employee.passwordHash);

    if (!isValid) {
      const failedAttempts = employee.failedAttempts + 1;
      const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS;

      await db.employee.update({
        where: { id: employee.id },
        data: {
          failedAttempts: failedAttempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : null,
        },
      });

      if (shouldLock) {
        return NextResponse.json(
          {
            error:
              "Too many failed attempts. Your account has been locked for 15 minutes.",
          },
          { status: 429 }
        );
      }

      const remaining = MAX_FAILED_ATTEMPTS - failedAttempts;
      return NextResponse.json(
        {
          error: `Invalid credentials. ${remaining} attempt(s) remaining before lockout.`,
        },
        { status: 401 }
      );
    }

    // Successful login: reset failed attempts, update lastLoginAt
    await db.employee.update({
      where: { id: employee.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const token = await signToken({
      id: employee.id,
      email: employee.email,
      name: buildFullName(employee.firstName, employee.middleName, employee.lastName),
      roleId: employee.role.id,
      roleName: employee.role.name,
    });

    const user = publicUser(employee);
    if (!user) {
      return NextResponse.json(
        { error: "Unable to build user profile." },
        { status: 500 }
      );
    }

    return NextResponse.json({ token, user });
  } catch (error) {
    console.error("[API /auth/login] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
