import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { teamSchema } from "@/server/validation";

export const PATCH = route({
  body: teamSchema.partial(),
  rateLimit: "write",
  permission: "teams:manage",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.team.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Team");
    const team = await db.team.update({
      where: { id: existing.id },
      data: body,
    });
    await auditAs(auth, {
      action: "team.updated",
      entityType: "team",
      entityId: existing.id,
      entityLabel: existing.name,
      before: {
        name: existing.name,
        department: existing.department,
        leadId: existing.leadId,
      },
      after: {
        name: team.name,
        department: team.department,
        leadId: team.leadId,
      },
    });
    return { data: team };
  },
});

export const DELETE = route({
  rateLimit: "write",
  permission: "teams:manage",
  handler: async ({ auth, params, db }) => {
    const existing = await db.team.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Team");
    await db.$transaction([
      db.teamMember.deleteMany({ where: { teamId: existing.id } }),
      db.team.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      }),
    ]);
    await auditAs(auth, {
      action: "team.deleted",
      entityType: "team",
      entityId: existing.id,
      entityLabel: existing.name,
      severity: "WARNING",
    });
    return { data: { id: existing.id, deleted: true } };
  },
});
