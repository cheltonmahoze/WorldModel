import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { z } from "zod";

const bodySchema = z.object({
  userIds: z.array(z.string().min(8)).min(1).max(50),
});

export const POST = route({
  body: bodySchema,
  rateLimit: "write",
  permission: "teams:manage",
  handler: async ({ auth, params, body, db }) => {
    const team = await db.team.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!team) throw AppError.notFound("Team");
    const memberships = await db.membership.findMany({
      where: {
        organizationId: auth.organization.id,
        userId: { in: body.userIds },
        deletedAt: null,
      },
      select: { userId: true },
    });
    if (memberships.length !== body.userIds.length) {
      throw new AppError("BAD_REQUEST", "unknown members", {
        userMessage:
          "One or more selected people are not part of this workspace.",
      });
    }
    await db.teamMember.createMany({
      data: memberships.map((membership) => ({
        teamId: team.id,
        userId: membership.userId,
        organizationId: auth.organization.id,
        role: "MEMBER",
      })),
      skipDuplicates: true,
    });
    await auditAs(auth, {
      action: "team.members_added",
      entityType: "team",
      entityId: team.id,
      entityLabel: team.name,
      after: { added: body.userIds.length },
    });
    return { data: { teamId: team.id, added: body.userIds.length } };
  },
});

export const DELETE = route({
  rateLimit: "write",
  permission: "teams:manage",
  handler: async ({ auth, params, request, db }) => {
    const team = await db.team.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!team) throw AppError.notFound("Team");
    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId)
      throw new AppError("BAD_REQUEST", "userId required", {
        userMessage: "Select the person to remove from the team.",
      });
    await db.teamMember.deleteMany({ where: { teamId: team.id, userId } });
    await auditAs(auth, {
      action: "team.member_removed",
      entityType: "team",
      entityId: team.id,
      entityLabel: team.name,
      after: { userId },
      severity: "WARNING",
    });
    return { data: { teamId: team.id, userId, removed: true } };
  },
});
