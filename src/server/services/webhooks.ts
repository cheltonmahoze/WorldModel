import { createHmac, randomBytes } from "node:crypto";
import { db } from "@/server/db";

export const WEBHOOK_EVENTS = [
  "deal.created",
  "deal.updated",
  "deal.stage_changed",
  "deal.won",
  "deal.lost",
  "customer.created",
  "customer.updated",
  "customer.health_changed",
  "risk.detected",
  "risk.resolved",
  "insight.detected",
  "insight.completed",
  "automation.executed",
  "automation.failed",
  "report.generated",
  "invoice.paid",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function generateWebhookSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signPayload(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * Delivers an event to every subscribed endpoint with an HMAC signature
 * (`X-Nexus-Signature`), a 5s timeout and full delivery logging — the same
 * contract a customer integration would rely on.
 */
export async function dispatchWebhooks(input: {
  organizationId: string;
  event: WebhookEvent | string;
  payload: Record<string, unknown>;
}) {
  const endpoints = await db.webhook.findMany({
    where: { organizationId: input.organizationId, active: true, events: { has: input.event } },
  });
  if (!endpoints.length) return [];

  const body = JSON.stringify({
    event: input.event,
    organizationId: input.organizationId,
    sentAt: new Date().toISOString(),
    data: input.payload,
  });
  const timestamp = Math.floor(Date.now() / 1000);

  const results = await Promise.all(
    endpoints.map(async (endpoint) => {
      const startedAt = Date.now();
      let status = "failed";
      let responseCode: number | null = null;
      let error: string | null = null;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "NexusOS-Webhooks/1.0",
            "x-nexus-event": input.event,
            "x-nexus-delivery": randomBytes(8).toString("hex"),
            "x-nexus-signature": `t=${timestamp},v1=${signPayload(endpoint.secret, timestamp, body)}`,
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        responseCode = response.status;
        status = response.ok ? "delivered" : "failed";
        if (!response.ok) error = `HTTP ${response.status}`;
      } catch (err) {
        error = err instanceof Error ? err.message : "network error";
      }

      const durationMs = Date.now() - startedAt;

      await db.webhookDelivery.create({
        data: {
          organizationId: input.organizationId,
          webhookId: endpoint.id,
          event: input.event,
          status,
          responseCode,
          durationMs,
          payload: input.payload as never,
          error,
        },
      });

      await db.webhook.update({
        where: { id: endpoint.id },
        data: {
          lastDeliveryAt: new Date(),
          failureCount: status === "delivered" ? 0 : { increment: 1 },
          active: status === "delivered" ? true : endpoint.failureCount < 9,
        },
      });

      return { webhookId: endpoint.id, status, responseCode, durationMs, error };
    }),
  );

  return results;
}
