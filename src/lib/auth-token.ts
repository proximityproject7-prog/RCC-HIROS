import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════
// JWT token (jose) — 8-hour expiry, HS256
// ═══════════════════════════════════════════════════════════════

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET
);
const ISSUER = "rcc-hiros";
const AUDIENCE = "rcc-hiros-api";

export interface TokenPayload {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
}

/** Sign a JWT with 8-hour expiry. */
export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(SECRET);
}

/** Verify a JWT and return the payload, or null on failure. */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      roleId: payload.roleId as string,
      roleName: payload.roleName as string,
    };
  } catch {
    return null;
  }
}

/** Extract & verify Bearer token from the Authorization header. */
export async function getTokenFromRequest(
  request: NextRequest
): Promise<TokenPayload | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  return verifyToken(token);
}

// ═══════════════════════════════════════════════════════════════
// AuthUser — hydrated from DB on each request
// ═══════════════════════════════════════════════════════════════

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;

  // Scope flags (from Role)
  scopeAllProfiling: boolean;
  scopeAllEvaluation: boolean;
  scopeAllLeave: boolean;
  scopeAllReports: boolean;
  scopeAllAttendance: boolean;
  canSelfApproveLeave: boolean;
  isSystem: boolean;

  // Employee profile
  groupId: string | null;
  active: boolean;
  mustChangePassword: boolean;

  // Effective permissions (identifier list)
  permissions: string[];
}

/** Build the full name from first/middle/last. */
function buildFullName(
  firstName: string,
  middleName: string | null,
  lastName: string
): string {
  return [firstName, middleName, lastName].filter(Boolean).join(" ");
}

/** Load Employee + Role + Permissions from DB and produce an AuthUser. */
export async function getAuthUser(employeeId: string): Promise<AuthUser | null> {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: {
      role: {
        include: {
          permissions: true,
        },
      },
    },
  });

  if (!employee) return null;
  if (!employee.active) return null;
  if (!employee.role) return null;

  const permissions = employee.role.permissions
    .filter((p) => p.granted)
    .map((p) => p.identifier);

  return {
    id: employee.id,
    email: employee.email,
    name: buildFullName(employee.firstName, employee.middleName, employee.lastName),
    roleId: employee.role.id,
    roleName: employee.role.name,
    scopeAllProfiling: employee.role.scopeAllProfiling,
    scopeAllEvaluation: employee.role.scopeAllEvaluation,
    scopeAllLeave: employee.role.scopeAllLeave,
    scopeAllReports: employee.role.scopeAllReports,
    scopeAllAttendance: employee.role.scopeAllAttendance,
    canSelfApproveLeave: employee.role.canSelfApproveLeave,
    isSystem: employee.role.isSystem,
    groupId: employee.groupId,
    active: employee.active,
    mustChangePassword: employee.mustChangePwd,
    permissions,
  };
}

// ═══════════════════════════════════════════════════════════════
// Route guards — return AuthUser or a 401/403 NextResponse
// ═══════════════════════════════════════════════════════════════

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse };

/** Require a valid Bearer token; return AuthUser or 401 response. */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const payload = await getTokenFromRequest(request);
  if (!payload) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      ),
    };
  }
  const user = await getAuthUser(payload.id);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Account not found or inactive" },
        { status: 401 }
      ),
    };
  }
  return { ok: true, user };
}

/** Require a specific permission; return AuthUser or 401/403 response. */
export async function requirePermission(
  request: NextRequest,
  identifier: string
): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  if (auth.user.isSystem) return auth; // System admin bypasses
  if (!auth.user.permissions.includes(identifier)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 }
      ),
    };
  }
  return auth;
}

/** Require ANY of the given permissions; return AuthUser or 401/403 response. */
export async function requireAnyPermission(
  request: NextRequest,
  identifiers: string[]
): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  if (auth.user.isSystem) return auth; // System admin bypasses
  const set = new Set(auth.user.permissions);
  const ok = identifiers.some((id) => set.has(id));
  if (!ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 }
      ),
    };
  }
  return auth;
}

/** Alias for backward compatibility. */
export const getAuthFromRequest = getTokenFromRequest;
