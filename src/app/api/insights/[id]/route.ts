import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { insightUpdateSchema } from "@/server/validation";
import { notify } from "@/server/services/notifications";

export const GET = route({
  handler: async ({ auth, params, db }) => {
    const insight = await db.insight.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
      include: {
        owner: {
          select: { id: true, name: true, avatarUrl: true, jobTitle: true },
        },
      },
    });
    if (!insight) throw AppError.notFound("Insight");
    return {
      data: { ...insight, estimatedImpact: Number(insight.estimatedImpact) },
    };
  },
});

export const PATCH = route({
  permission: "insights:write",
  body: insightUpdateSchema,
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.insight.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Insight");

    const updated = await db.insight.update({
      where: { id: existing.id },
      data: {
        ...body,
        dueAt: body.dueAt
          ? new Date(body.dueAt)
          : body.dueAt === null
            ? null
            : undefined,
        status: body.status ?? existing.status,
        acknowledgedAt:
          body.status &&
          existing.status === "DETECTED" &&
          body.status !== "DETECTED"
            ? new Date()
            : existing.acknowledgedAt,
        completedAt:
          body.status === "COMPLETED" ? new Date() : existing.completedAt,
        dismissedAt:
          body.status === "DISMISSED" ? new Date() : existing.dismissedAt,
      },
    });

    if (body.ownerId && body.ownerId !== existing.ownerId) {
      await notify({
        organizationId: auth.organization.id,
        userId: body.ownerId,
        type: "TASK_ASSIGNED",
        title: "Opportunity assigned to you",
        body: existing.title,
        entityType: "insight",
        entityId: existing.id,
        actionUrl: `/opportunities/${existing.id}`,
      });
    }

    await auditAs(auth, {
      action: "insight.updated",
      entityType: "insight",
      entityId: existing.id,
      entityLabel: existing.title,
      before: {
        status: existing.status,
        priority: existing.priority,
        ownerId: existing.ownerId,
      },
      after: {
        status: updated.status,
        priority: updated.priority,
        ownerId: updated.ownerId,
      },
    });

    return {
      data: { ...updated, estimatedImpact: Number(updated.estimatedImpact) },
    };
  },
});
