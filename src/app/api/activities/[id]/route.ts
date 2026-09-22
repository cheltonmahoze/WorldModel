import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { activityUpdateSchema } from "@/server/validation";
import { z } from "zod";

export const PATCH = route({
  permission: "activities:write",
  body: activityUpdateSchema.extend({ completed: z.boolean().optional() }),
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.activity.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Activity");
    const { completed, ...rest } = body;
    const activity = await db.activity.update({
      where: { id: existing.id },
      data: {
        ...rest,
        occurredAt: rest.occurredAt ? new Date(rest.occurredAt) : undefined,
        dueAt: rest.dueAt
          ? new Date(rest.dueAt)
          : rest.dueAt === null
            ? null
            : undefined,
        completedAt:
          completed === true
            ? new Date()
            : completed === false
              ? null
              : undefined,
        isOverdue: completed === true ? false : undefined,
      },
    });
    await auditAs(auth, {
      action: completed ? "activity.completed" : "activity.updated",
      entityType: "activity",
      entityId: existing.id,
      entityLabel: existing.subject,
      before: {
        subject: existing.subject,
        type: existing.type,
        dueAt: existing.dueAt,
        completedAt: existing.completedAt,
      },
      after: {
        subject: activity.subject,
        type: activity.type,
        dueAt: activity.dueAt,
        completedAt: activity.completedAt,
      },
    });
    return { data: activity };
  },
});

export const DELETE = route({
  permission: "activities:write",
  rateLimit: "write",
  handler: async ({ auth, params, db }) => {
    const existing = await db.activity.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Activity");
    await db.activity.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await auditAs(auth, {
      action: "activity.deleted",
      entityType: "activity",
      entityId: existing.id,
      entityLabel: existing.subject,
      severity: "WARNING",
    });
    return { data: { id: existing.id, deleted: true } };
  },
});
