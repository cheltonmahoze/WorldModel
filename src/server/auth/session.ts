import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Organization, Session, User } from "@prisma/client";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { generateToken, sha256 } from "@/server/auth/password";
import { can, canAny, permissionsForRole, type Permission, type RoleName } from "@/lib/rbac";

export const SESSION_COOKIE = "nexus_session";
export const ORG_COOKIE = "nexus_org";
/**
 * Set when a user signs out on purpose. Open access never re-creates a session
 * while this marker is present, which keeps the logout flow honest instead of
 * bouncing the visitor straight back into the workspace.
 */
export const SIGNED_OUT_COOKIE = "nexus_signed_out";
const SESSION_TTL_MS = env.SESSION_TTL_MINUTES * 60_000;

export type AuthContext = {
  user: Pick<User, "id" | "email" | "name" | "avatarUrl" | "jobTitle" | "timezone" | "locale" | "themePreference" | "emailVerifiedAt" | "lastLoginAt" | "isPlatformAdmin">;
  session: Pick<Session, "id" | "createdAt" | "lastSeenAt" | "expiresAt" | "ip" | "userAgent" | "device" | "location">;
  organization: Organization;
  role: RoleName;
  membershipId: string;
  permissions: Permission[];
  memberships: {
    id: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    plan: Organization["plan"];
    role: RoleName;
    logoUrl: string | null;
  }[];
};

function describeDevice(userAgent: string | null) {
  if (!userAgent) return { device: "Unknown device", location: null };
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Safari\//.test(userAgent)
        ? "Safari"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : "Browser";
  const os = /Mac OS X/.test(userAgent)
    ? "macOS"
    : /Windows/.test(userAgent)
      ? "Windows"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  return { device: `${browser} · ${os}`, location: null as string | null };
}

/** Creates a session row + signed cookie for an authenticated user. */
export async function createSession(options: {
  userId: string;
  organizationId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { device, location } = describeDevice(options.userAgent ?? null);

  const session = await db.session.create({
    data: {
      userId: options.userId,
      organizationId: options.organizationId ?? null,
      tokenHash: sha256(token),
      ip: options.ip ?? null,
      userAgent: options.userAgent ?? null,
      device,
      location,
      expiresAt,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  if (options.organizationId) {
    store.set(ORG_COOKIE, options.organizationId, {
      httpOnly: false,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    });
  }

  await db.user.update({ where: { id: options.userId }, data: { lastLoginAt: new Date(), lastActiveAt: new Date() } });
  return session;
}

export async function destroySession(sessionId: string, options: { suppressOpenAccess?: boolean } = {}) {
  await db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => undefined);
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ORG_COOKIE);
  if (options.suppressOpenAccess) {
    store.set(SIGNED_OUT_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 30,
    });
  }
}

export async function clearSignedOutMarker() {
  const store = await cookies();
  store.delete(SIGNED_OUT_COOKIE);
}

export async function switchOrganization(organizationId: string) {
  const store = await cookies();
  store.set(ORG_COOKIE, organizationId, {
    httpOnly: false,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + SESSION_TTL_MS),
  });
}

/**
 * Resolves the caller's full context: user, active organization, role and
 * permissions. Memoised per request. Returns null when unauthenticated.
 */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          memberships: {
            where: { deletedAt: null, status: "ACTIVE" },
            include: { organization: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.deletedAt) return null;

  const memberships = session.user.memberships.filter((membership) => !membership.organization.deletedAt);
  if (!memberships.length) return null;

  const preferredOrgId = store.get(ORG_COOKIE)?.value ?? session.organizationId ?? undefined;
  const active =
    memberships.find((membership) => membership.organizationId === preferredOrgId) ?? memberships[0]!;
  const role = active.role as RoleName;

  // Sliding session + activity signal (throttled to avoid a write per request).
  const now = Date.now();
  if (now - session.lastSeenAt.getTime() > 60_000) {
    void db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    void db.user.update({ where: { id: session.userId }, data: { lastActiveAt: new Date() } }).catch(() => undefined);
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatarUrl: session.user.avatarUrl,
      jobTitle: session.user.jobTitle,
      timezone: session.user.timezone,
      locale: session.user.locale,
      themePreference: session.user.themePreference,
      emailVerifiedAt: session.user.emailVerifiedAt,
      lastLoginAt: session.user.lastLoginAt,
      isPlatformAdmin: session.user.isPlatformAdmin,
    },
    session: {
      id: session.id,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      ip: session.ip,
      userAgent: session.userAgent,
      device: session.device,
      location: session.location,
    },
    organization: active.organization,
    role,
    membershipId: active.id,
    permissions: permissionsForRole(role),
    memberships: memberships.map((membership) => ({
      id: membership.id,
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      organizationSlug: membership.organization.slug,
      plan: membership.organization.plan,
      role: membership.role as RoleName,
      logoUrl: membership.organization.logoUrl,
    })),
  };
});

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw AppError.unauthorized();
  return auth;
}

export function hasPermission(auth: AuthContext, permission: Permission) {
  return can(auth.role, permission);
}

export function hasAnyPermission(auth: AuthContext, permissions: Permission[]) {
  return canAny(auth.role, permissions);
}

export async function requirePermission(permission: Permission | Permission[]): Promise<AuthContext> {
  const auth = await requireAuth();
  const allowed = Array.isArray(permission)
    ? hasAnyPermission(auth, permission)
    : hasPermission(auth, permission);
  if (!allowed) {
    throw AppError.forbidden(
      `Your role (${auth.role.toLowerCase()}) does not allow this action. Ask an administrator for access.`,
    );
  }
  return auth;
}

export async function requestMeta() {
  const headerList = await headers();
  return {
    ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? null,
    userAgent: headerList.get("user-agent"),
    requestId: headerList.get("x-request-id") ?? undefined,
  };
}
