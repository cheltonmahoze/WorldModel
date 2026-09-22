import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { integrationConnectSchema } from "@/server/validation";
import { INTEGRATION_CATALOGUE } from "@/lib/integrations";
import { PLANS } from "@/lib/plans";
import { z } from "zod";

const querySchema = z.object({ category: z.string().optional() });

export const GET = route({
  query: querySchema,
  handler: async ({ auth, query, db }) => {
    const connected = await db.integration.findMany({
      where: { organizationId: auth.organization.id },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    const byProvider = new Map(
      connected.map((integration) => [integration.provider, integration]),
    );
    const catalogued = INTEGRATION_CATALOGUE.filter(
      (entry) => !query.category || entry.category === query.category,
    );

    return {
      data: {
        connectors: connected.map((integration) => ({
          ...integration,
          recordsSynced: integration.recordsSynced,
        })),
        catalogue: catalogued.map((entry) => ({
          ...entry,
          connected: byProvider.has(entry.provider),
          integrationId: byProvider.get(entry.provider)?.id ?? null,
          status: byProvider.get(entry.provider)?.status ?? "DISCONNECTED",
        })),
        allowance: PLANS[auth.organization.plan].limits.integrations,
        summary: {
          connected: connected.filter(
            (integration) =>
              integration.status !== "DISCONNECTED" && integration.enabled,
          ).length,
          errors: connected.filter(
            (integration) => integration.status === "ERROR",
          ).length,
          pending: connected.filter(
            (integration) => integration.status === "PENDING",
          ).length,
          lastSyncAt: connected.reduce<Date | null>(
            (latest, integration) =>
              !latest ||
              (integration.lastSyncAt && integration.lastSyncAt > latest)
                ? integration.lastSyncAt
                : latest,
            null,
          ),
          recordsSynced: connected.reduce(
            (acc, integration) => acc + integration.recordsSynced,
            0,
          ),
        },
        configurationNote:
          "Live connectors need a provider credential. Without one the integration stays connected-but-unconfigured and every sync states that explicitly — nothing is faked.",
      },
    };
  },
});

export const POST = route({
  permission: "integrations:manage",
  body: integrationConnectSchema,
  rateLimit: "write",
  handler: async ({ auth, body, db }) => {
    const entry = INTEGRATION_CATALOGUE.find(
      (item) => item.provider === body.provider,
    );
    if (!entry) throw AppError.notFound("Integration provider");
    const existing = await db.integration.findFirst({
      where: { organizationId: auth.organization.id, provider: body.provider },
    });
    if (existing) {
      throw new AppError("CONFLICT", "integration already connected", {
        userMessage: `${entry.name} is already connected. Update the existing connection instead.`,
      });
    }
    const limit = PLANS[auth.organization.plan].limits.integrations;
    const count = await db.integration.count({
      where: {
        organizationId: auth.organization.id,
        status: { not: "DISCONNECTED" },
      },
    });
    if (count >= limit) {
      throw AppError.planLimit(`Your plan includes ${limit} integrations. Upgrade to connect more.`);
    }
    const integration = await db.integration.create({
      data: {
        organizationId: auth.organization.id,
        provider: entry.provider,
        name: entry.name,
        category: entry.category,
        status: body.credential ? "CONNECTED" : "PENDING",
        enabled: body.enabled,
        config: body.config as never,
        scopes: entry.scopes,
        credentialRef: body.credential
          ? `vault://${entry.provider}/${auth.organization.id}`
          : null,
        secretPreview: body.credential
          ? `••••${body.credential.slice(-4)}`
          : null,
        syncFrequency: body.syncFrequency,
        syncDirection: body.syncDirection,
        connectedById: auth.user.id,
        lastSyncAt: null,
        nextSyncAt: new Date(Date.now() + 3_600_000),
        lastError: body.credential
          ? null
          : "No provider credential stored — live sync is disabled until one is added.",
      },
    });
    await auditAs(auth, {
      action: "integration.connected",
      entityType: "integration",
      entityId: integration.id,
      entityLabel: integration.name,
      after: {
        provider: integration.provider,
        status: integration.status,
        syncFrequency: integration.syncFrequency,
      },
    });
    return { data: integration };
  },
});
