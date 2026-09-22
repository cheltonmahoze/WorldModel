import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { automationUpdateSchema } from "@/server/validation";

export const GET = route({
  handler: async ({ auth, params, db }) => {
    const automation = await db.automation.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
      include: { executions: { orderBy: { startedAt: "desc" }, take: 25 } },
    });
    if (!automation) throw AppError.notFound("Automation");
    const stats = await db.automationExecution.groupBy({
      by: ["status"],
      where: { automationId: automation.id },
      _count: true,
      _avg: { durationMs: true },
    });
    return {
      data: {
        automation,
        executions: automation.executions,
        stats: stats.map((row) => ({
          status: row.status,
          count: row._count,
          averageDuration: row._avg.durationMs ?? 0,
        })),
      },
    };
  },
});

export const PATCH = route({
  permission: "automations:write",
  body: automationUpdateSchema,
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.automation.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Automation");
    const automation = await db.automation.update({
      where: { id: existing.id },
      data: {
        ...body,
        triggerConfig: body.triggerConfig as never,
        conditions: body.conditions as never,
        actions: body.actions as never,
      },
    });
    await auditAs(auth, {
      action:
        existing.status !== automation.status
          ? "automation.status_changed"
          : "automation.updated",
      entityType: "automation",
      entityId: existing.id,
      entityLabel: existing.name,
      before: {
        name: existing.name,
        status: existing.status,
        triggerType: existing.triggerType,
      },
      after: {
        name: automation.name,
        status: automation.status,
        triggerType: automation.triggerType,
      },
    });
    return { data: automation };
  },
});

export const DELETE = route({
  permission: "automations:write",
  rateLimit: "write",
  handler: async ({ auth, params, db }) => {
    const existing = await db.automation.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Automation");
    await db.automation.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), status: "DRAFT" },
    });
    await auditAs(auth, {
      action: "automation.deleted",
      entityType: "automation",
      entityId: existing.id,
      entityLabel: existing.name,
      severity: "WARNING",
    });
    return { data: { id: existing.id, deleted: true } };
  },
});
