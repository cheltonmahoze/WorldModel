import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { apiKeyCreateSchema } from "@/server/validation";
import { generateToken, sha256 } from "@/server/auth/password";
import { PLANS } from "@/lib/plans";

export const GET = route({
  handler: async ({ auth, db }) => {
    const keys = await db.apiKey.findMany({
      where: { organizationId: auth.organization.id },
      orderBy: { createdAt: "desc" },
    });
    return {
      data: {
        items: keys.map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          scopes: key.scopes,
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
          revokedAt: key.revokedAt,
          createdAt: key.createdAt,
          requestCount: key.requestCount,
        })),
        allowance: PLANS[auth.organization.plan].limits.apiRequestsPerDay,
        apiEnabled: PLANS[auth.organization.plan].features.apiAccess,
        canManage: auth.permissions.includes("apikeys:manage"),
      },
    };
  },
});

export const POST = route({
  body: apiKeyCreateSchema,
  rateLimit: "write",
  permission: "apikeys:manage",
  handler: async ({ auth, body, db }) => {
    if (!PLANS[auth.organization.plan].features.apiAccess) {
      throw new AppError("FORBIDDEN", "api access not included in plan", {
        userMessage:
          "API access starts on the Growth plan. Upgrade in Settings → Billing.",
      });
    }
    const secret = `nx_live_${generateToken(24)}`;
    const key = await db.apiKey.create({
      data: {
        organizationId: auth.organization.id,
        name: body.name,
        prefix: secret.slice(0, 14),
        keyHash: sha256(secret),
        scopes: body.scopes,
        expiresAt: body.expiresInDays
          ? new Date(Date.now() + body.expiresInDays * 86_400_000)
          : null,
        createdById: auth.user.id,
      },
    });
    await auditAs(auth, {
      action: "apikey.created",
      entityType: "api_key",
      entityId: key.id,
      entityLabel: key.name,
      after: { scopes: key.scopes, prefix: key.prefix },
    });
    // The plaintext secret is returned exactly once — only its hash is stored.
    return {
      data: {
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scopes: key.scopes,
        secret,
      },
    };
  },
});
