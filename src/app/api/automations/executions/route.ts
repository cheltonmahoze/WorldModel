import { route, paginated, paginationFrom } from "@/server/api";
import { automationExecutionFilterSchema } from "@/server/validation";
import type { Prisma } from "@prisma/client";

/**
 * Automation execution log.
 *
 * Every run of every rule lands here — trigger, whether the conditions matched,
 * each step's outcome, duration and the entity it touched. The Automations board
 * shows the twelve most recent runs inline; this endpoint is the full, filterable
 * ledger behind that preview (and the audit trail automations are judged on).
 */
export const GET = route({
  query: automationExecutionFilterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take, orderBy } = paginationFrom(query);
    const organizationId = auth.organization.id;
    const where: Prisma.AutomationExecutionWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.automationId ? { automationId: query.automationId } : {}),
      ...(query.matched === undefined ? {} : { matched: query.matched }),
      ...(query.q
        ? {
            OR: [
              { triggerEvent: { contains: query.q, mode: "insensitive" } },
              { entityLabel: { contains: query.q, mode: "insensitive" } },
              { automation: { name: { contains: query.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [items, total, byStatus, duration] = await Promise.all([
      db.automationExecution.findMany({
        where,
        orderBy: { ...orderBy, startedAt: "desc" },
        skip,
        take,
        include: { automation: { select: { id: true, name: true, status: true } } },
      }),
      db.automationExecution.count({ where }),
      db.automationExecution.groupBy({
        by: ["status"],
        where: { organizationId },
        _count: true,
      }),
      db.automationExecution.aggregate({
        where: { organizationId },
        _avg: { durationMs: true },
        _sum: { durationMs: true },
        _count: true,
      }),
    ]);

    return paginated(items, total, page, pageSize, {
      summary: {
        runs: duration._count,
        averageDurationMs: Math.round(duration._avg.durationMs ?? 0),
        totalDurationMs: duration._sum.durationMs ?? 0,
        byStatus: byStatus.map((row) => ({ status: row.status, count: row._count })),
      },
    });
  },
});
