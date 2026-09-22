import { route } from "@/server/api";
import { paginationFrom, paginated } from "@/server/api";
import {
  automationCreateSchema,
  automationFilterSchema,
} from "@/server/validation";
import { assertWithinPlan } from "@/server/plan-guard";
import { auditAs } from "@/server/audit";

export const GET = route({
  query: automationFilterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take } = paginationFrom(query);
    const where = {
      organizationId: auth.organization.id,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { name: { contains: query.q, mode: "insensitive" as const } }
        : {}),
    };
    const [items, total, recentExecutions] = await Promise.all([
      db.automation.findMany({
        where,
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        skip,
        take,
        include: { _count: { select: { executions: true } } },
      }),
      db.automation.count({ where }),
      db.automationExecution.findMany({
        where: { organizationId: auth.organization.id },
        orderBy: { startedAt: "desc" },
        take: 12,
        include: { automation: { select: { name: true, id: true } } },
      }),
    ]);
    return paginated(items, total, page, pageSize, {
      summary: {
        active: await db.automation.count({
          where: {
            organizationId: auth.organization.id,
            status: "ACTIVE",
            deletedAt: null,
          },
        }),
        paused: await db.automation.count({
          where: {
            organizationId: auth.organization.id,
            status: "PAUSED",
            deletedAt: null,
          },
        }),
        draft: await db.automation.count({
          where: {
            organizationId: auth.organization.id,
            status: "DRAFT",
            deletedAt: null,
          },
        }),
        hoursSaved: Math.round(
          ((
            await db.automation.aggregate({
              where: { organizationId: auth.organization.id, deletedAt: null },
              _sum: { timeSavedMinutes: true },
            })
          )._sum.timeSavedMinutes ?? 0) / 60,
        ),
      },
      recentExecutions,
    });
  },
});

export const POST = route({
  permission: "automations:write",
  body: automationCreateSchema,
  rateLimit: "write",
  handler: async ({ auth, body, db }) => {
    await assertWithinPlan(
      auth.organization.id,
      auth.organization.plan,
      "automations",
    );
    const automation = await db.automation.create({
      data: {
        organizationId: auth.organization.id,
        name: body.name,
        description: body.description ?? null,
        status: body.status,
        triggerType: body.triggerType,
        triggerConfig: body.triggerConfig as never,
        conditions: body.conditions as never,
        actions: body.actions as never,
        tags: body.tags ?? [],
        createdById: auth.user.id,
      },
    });
    await auditAs(auth, {
      action: "automation.created",
      entityType: "automation",
      entityId: automation.id,
      entityLabel: automation.name,
      after: {
        trigger: automation.triggerType,
        actions: body.actions.length,
        status: automation.status,
      },
    });
    return { data: automation };
  },
});
