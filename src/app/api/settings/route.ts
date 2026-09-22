import { route } from "@/server/api";
import { organizationUpdateSchema } from "@/server/validation";
import { auditAs } from "@/server/audit";
import { PLANS } from "@/lib/plans";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";

export const GET = route({
  handler: async ({ auth }) => ({
    data: {
      organization: auth.organization,
      plan: PLANS[auth.organization.plan],
      role: auth.role,
      permissions: auth.permissions,
      memberships: auth.memberships,
      brandable: PLANS[auth.organization.plan].features.sso || true,
    },
  }),
});

export const PATCH = route({
  body: organizationUpdateSchema,
  rateLimit: "write",
  permission: "org:update",
  handler: async ({ auth, body }) => {
    const organization = await db.organization.update({
      where: { id: auth.organization.id },
      data: body,
    });
    await auditAs(auth, {
      action: "organization.updated",
      entityType: "organization",
      entityId: organization.id,
      entityLabel: organization.name,
      before: {
        name: auth.organization.name,
        industry: auth.organization.industry,
        currency: auth.organization.currency,
        timezone: auth.organization.timezone,
        aiEngineEnabled: auth.organization.aiEngineEnabled,
        churnRiskThreshold: auth.organization.churnRiskThreshold,
      },
      after: {
        name: organization.name,
        industry: organization.industry,
        currency: organization.currency,
        timezone: organization.timezone,
        aiEngineEnabled: organization.aiEngineEnabled,
        churnRiskThreshold: organization.churnRiskThreshold,
      },
    });
    return { data: organization };
  },
});

export const DELETE = route({
  rateLimit: "write",
  permission: "org:delete",
  handler: async ({ auth }) => {
    if (auth.role !== "OWNER")
      throw AppError.forbidden(
        "Only the workspace owner can delete this organization.",
      );
    await db.$transaction([
      db.organization.update({
        where: { id: auth.organization.id },
        data: { deletedAt: new Date() },
      }),
      db.session.updateMany({
        where: { organizationId: auth.organization.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedById: auth.user.id },
      }),
    ]);
    await auditAs(auth, {
      action: "organization.deleted",
      entityType: "organization",
      entityId: auth.organization.id,
      entityLabel: auth.organization.name,
      severity: "CRITICAL",
    });
    return { data: { id: auth.organization.id, deleted: true } };
  },
});
