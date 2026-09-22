import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import type { AuthContext } from "@/server/auth/session";
import { headers } from "next/headers";

export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AuditSource = "WEB" | "API" | "AUTOMATION" | "SYSTEM";

export type AuditInput = {
  organizationId: string;
  actorId?: string | null;
  actorName: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  before?: unknown;
  after?: unknown;
  severity?: AuditSeverity;
  source?: AuditSource;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

/** Computes a field-level diff so the audit trail can render "X changed A → B". */
export function diffObjects(before: unknown, after: unknown) {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return null;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)]);
  for (const key of keys) {
    const from = (before as Record<string, unknown>)[key];
    const to = (after as Record<string, unknown>)[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from: from ?? null, to: to ?? null };
  }
  return Object.keys(changes).length ? changes : null;
}

export async function recordAudit(input: AuditInput) {
  const diff = diffObjects(input.before, input.after);
  try {
    return await db.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId ?? null,
        actorName: input.actorName,
        actorEmail: input.actorEmail ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel ?? null,
        before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
        diff: (diff ?? undefined) as Prisma.InputJsonValue | undefined,
        severity: input.severity ?? "INFO",
        source: input.source ?? "WEB",
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
      },
    });
  } catch (error) {
    // Audit must never break the user-facing operation, but it must never fail silently either.
    console.error("[audit] failed to persist audit entry", input.action, error);
    return null;
  }
}

/** Convenience wrapper bound to the authenticated actor. */
export async function auditAs(
  auth: AuthContext,
  input: Omit<AuditInput, "organizationId" | "actorId" | "actorName" | "actorEmail" | "actorRole"> & {
    organizationId?: string;
  },
) {
  let ip = input.ip ?? null;
  let userAgent = input.userAgent ?? null;
  if (!ip && !userAgent) {
    try {
      const headerList = await headers();
      ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      userAgent = headerList.get("user-agent");
    } catch {
      /* outside a request scope (jobs) */
    }
  }
  return recordAudit({
    ...input,
    organizationId: input.organizationId ?? auth.organization.id,
    actorId: auth.user.id,
    actorName: auth.user.name,
    actorEmail: auth.user.email,
    actorRole: auth.role,
    ip,
    userAgent,
    source: input.source ?? "WEB",
  });
}

export async function auditSystem(input: Omit<AuditInput, "actorName"> & { actorName?: string }) {
  return recordAudit({ ...input, actorName: input.actorName ?? "Nexus Engine", actorId: null, actorRole: "SYSTEM", source: input.source ?? "SYSTEM" });
}
