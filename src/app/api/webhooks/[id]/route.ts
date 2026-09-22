import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { webhookSchema } from "@/server/validation";

export const PATCH = route({
  permission: "webhooks:manage",
  body: webhookSchema.partial(),
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.webhook.findFirst({
      where: { id: params.id, organizationId: auth.organization.id },
    });
    if (!existing) throw AppError.notFound("Webhook");
    const webhook = await db.webhook.update({
      where: { id: existing.id },
      data: body,
    });
    await auditAs(auth, {
      action: "webhook.updated",
      entityType: "webhook",
      entityId: existing.id,
      entityLabel: existing.url,
      before: {
        url: existing.url,
        active: existing.active,
        events: existing.events,
      },
      after: {
        url: webhook.url,
        active: webhook.active,
        events: webhook.events,
      },
    });
    return {
      data: { ...webhook, secret: `whsec_••••${webhook.secret.slice(-4)}` },
    };
  },
});

export const DELETE = route({
  permission: "webhooks:manage",
  rateLimit: "write",
  handler: async ({ auth, params, db }) => {
    const existing = await db.webhook.findFirst({
      where: { id: params.id, organizationId: auth.organization.id },
    });
    if (!existing) throw AppError.notFound("Webhook");
    // Deliveries cascade with the endpoint; the audit entry keeps the record.
    await db.webhook.delete({ where: { id: existing.id } });
    await auditAs(auth, {
      action: "webhook.deleted",
      entityType: "webhook",
      entityId: existing.id,
      entityLabel: existing.url,
      severity: "WARNING",
    });
    return { data: { id: existing.id, deleted: true } };
  },
});
