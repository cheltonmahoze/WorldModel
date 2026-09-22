import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { integrationUpdateSchema } from "@/server/validation";

export const PATCH = route({
  permission: "integrations:manage",
  body: integrationUpdateSchema,
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.integration.findFirst({
      where: { id: params.id, organizationId: auth.organization.id },
    });
    if (!existing) throw AppError.notFound("Integration");
    const integration = await db.integration.update({
      where: { id: existing.id },
      data: {
        ...body,
        config: body.config as never,
        credentialRef: body.credential
          ? `vault://${existing.provider}/${auth.organization.id}`
          : undefined,
        secretPreview: body.credential
          ? `••••${body.credential.slice(-4)}`
          : undefined,
        status: body.credential ? "CONNECTED" : body.enabled === false ? "DISCONNECTED" : undefined,
        lastError: body.credential ? null : undefined,
      },
    });
    await auditAs(auth, {
      action: "integration.updated",
      entityType: "integration",
      entityId: existing.id,
      entityLabel: existing.name,
      before: {
        status: existing.status,
        enabled: existing.enabled,
        syncFrequency: existing.syncFrequency,
      },
      after: {
        status: integration.status,
        enabled: integration.enabled,
        syncFrequency: integration.syncFrequency,
      },
    });
    return { data: integration };
  },
});

export const DELETE = route({
  permission: "integrations:manage",
  rateLimit: "write",
  handler: async ({ auth, params, db }) => {
    const existing = await db.integration.findFirst({
      where: { id: params.id, organizationId: auth.organization.id },
    });
    if (!existing) throw AppError.notFound("Integration");
    await db.integration.update({
      where: { id: existing.id },
      data: {
        status: "DISCONNECTED",
        enabled: false,
        credentialRef: null,
        secretPreview: null,
        nextSyncAt: null,
        lastError: null,
      },
    });
    await auditAs(auth, {
      action: "integration.disconnected",
      entityType: "integration",
      entityId: existing.id,
      entityLabel: existing.name,
      severity: "WARNING",
    });
    return { data: { id: existing.id, disconnected: true } };
  },
});
