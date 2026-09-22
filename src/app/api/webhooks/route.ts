import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { webhookSchema } from "@/server/validation";
import {
  generateWebhookSecret,
  WEBHOOK_EVENTS,
} from "@/server/services/webhooks";

export const GET = route({
  handler: async ({ auth, db }) => {
    const [webhooks, deliveries] = await Promise.all([
      db.webhook.findMany({
        where: { organizationId: auth.organization.id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { deliveries: true } } },
      }),
      db.webhookDelivery.findMany({
        where: { organizationId: auth.organization.id },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { webhook: { select: { id: true, url: true } } },
      }),
    ]);
    return {
      data: {
        webhooks: webhooks.map((webhook) => ({
          ...webhook,
          secret: `whsec_••••${webhook.secret.slice(-4)}`,
        })),
        deliveries,
        events: WEBHOOK_EVENTS,
        signing:
          "Every delivery carries X-Nexus-Signature: t=<unix>,v1=<hmac-sha256>. Retries stop after 9 failures.",
      },
    };
  },
});

export const POST = route({
  permission: "webhooks:manage",
  body: webhookSchema,
  rateLimit: "write",
  handler: async ({ auth, body, db }) => {
    const webhook = await db.webhook.create({
      data: {
        organizationId: auth.organization.id,
        url: body.url,
        description: body.description ?? null,
        events: body.events,
        active: body.active,
        secret: generateWebhookSecret(),
        createdById: auth.user.id,
      },
    });
    await auditAs(auth, {
      action: "webhook.created",
      entityType: "webhook",
      entityId: webhook.id,
      entityLabel: webhook.url,
      after: { events: webhook.events, active: webhook.active },
    });
    // The signing secret is shown once at creation time.
    return { data: webhook };
  },
});

