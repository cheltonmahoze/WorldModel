import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";

export const DELETE = route({
  rateLimit: "write",
  permission: "apikeys:manage",
  handler: async ({ auth, params, db }) => {
    const existing = await db.apiKey.findFirst({
      where: { id: params.id, organizationId: auth.organization.id },
    });
    if (!existing) throw AppError.notFound("API key");
    // Keys are revoked, not deleted, so the audit trail stays intact.
    await db.apiKey.update({
      where: { id: existing.id },
      data: {
        revokedAt: new Date(),
        keyHash: `revoked:${existing.keyHash.slice(0, 12)}`,
      },
    });
    await auditAs(auth, {
      action: "apikey.revoked",
      entityType: "api_key",
      entityId: existing.id,
      entityLabel: existing.name,
      severity: "WARNING",
    });
    return { data: { id: existing.id, revoked: true } };
  },
});
