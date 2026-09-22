import type { NextRequest } from "next/server";
import { relativeRedirect } from "@/server/redirect";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { clearSignedOutMarker, createSession } from "@/server/auth/session";
import { clientIp, consume, RATE_LIMITS, rateLimitKey } from "@/server/rate-limit";
import { recordAudit } from "@/server/audit";

/**
 * Open workspace entry point.
 *
 * When `OPEN_WORKSPACE` is enabled this route signs the visitor in as the demo
 * owner and redirects to the requested page, so anyone with the link reaches the
 * product without an account. It is deliberately *not* a fake mode: the session
 * cookie it issues is the same one the login form issues, backed by a real row
 * in `Session`, and every action the visitor takes is attributed to that user and
 * written to the audit trail. Disable it with `OPEN_WORKSPACE="false"`.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const requested = url.searchParams.get("next");
  const destination = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  if (!env.OPEN_WORKSPACE) {
    return redirectTo(`/login?next=${encodeURIComponent(destination)}`);
  }

  const budget = consume(rateLimitKey("demo:open", clientIp(request)), RATE_LIMITS.auth);
  if (!budget.allowed) {
    return redirectTo("/login?error=rate-limited");
  }

  const user = await resolveDemoUser();
  if (!user) {
    return redirectTo("/login?error=demo-unavailable");
  }

  const membership =
    user.memberships.find((row) => row.role === "OWNER" && row.organization.deletedAt === null) ??
    user.memberships.find((row) => row.organization.deletedAt === null) ??
    null;

  if (!membership) {
    return redirectTo("/login?error=demo-unavailable");
  }

  await createSession({
    userId: user.id,
    organizationId: membership.organizationId,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
  });
  await clearSignedOutMarker();

  await recordAudit({
    organizationId: membership.organizationId,
    actorId: user.id,
    actorName: user.name,
    actorEmail: user.email,
    actorRole: membership.role,
    action: "auth.open_access",
    entityType: "session",
    entityLabel: "Open workspace access",
    after: { organization: membership.organization.name, role: membership.role },
    source: "SYSTEM",
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
  }).catch(() => undefined);

  return redirectTo(destination);
}

async function resolveDemoUser() {
  const configured = await db.user.findUnique({
    where: { email: env.DEMO_EMAIL },
    include: {
      memberships: {
        where: { deletedAt: null, status: "ACTIVE" },
        include: { organization: { select: { id: true, name: true, deletedAt: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (configured?.memberships.length) return configured;

  // Fallback: the owner of the oldest live tenant, so a freshly seeded
  // environment works even when the demo address was renamed.
  const membership = await db.membership.findFirst({
    where: { role: "OWNER", deletedAt: null, status: "ACTIVE", organization: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    include: { user: { include: { memberships: { where: { deletedAt: null, status: "ACTIVE" }, include: { organization: { select: { id: true, name: true, deletedAt: true } } } } } } },
  });
  return membership?.user ?? null;
}

function redirectTo(path: string) {
  const [pathname, query] = path.split("?");
  const destination = `${pathname || "/dashboard"}${query ? `?${query}` : ""}`;
  return relativeRedirect(destination);
}

export const dynamic = "force-dynamic";
