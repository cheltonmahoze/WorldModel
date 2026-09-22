import { route } from "@/server/api";
import { paginated, paginationFrom } from "@/server/api";
import { auditFilterSchema } from "@/server/validation";
import type { Prisma } from "@prisma/client";

export const GET = route({
  query: auditFilterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take } = paginationFrom(query);
    const where: Prisma.AuditLogWhereInput = {
      organizationId: auth.organization.id,
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { actorName: { contains: query.q, mode: "insensitive" } },
              { entityLabel: { contains: query.q, mode: "insensitive" } },
              { action: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total, actions, actors] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          actor: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      db.auditLog.count({ where }),
      db.auditLog.groupBy({
        by: ["action"],
        where: { organizationId: auth.organization.id },
        _count: true,
        orderBy: { _count: { action: "desc" } },
        take: 25,
      }),
      db.auditLog.groupBy({
        by: ["actorName"],
        where: { organizationId: auth.organization.id },
        _count: true,
        orderBy: { _count: { actorName: "desc" } },
        take: 12,
      }),
    ]);

    return paginated(items, total, page, pageSize, {
      facets: {
        actions: actions.map((row) => ({
          action: row.action,
          count: row._count,
        })),
        actors: actors.map((row) => ({
          name: row.actorName,
          count: row._count,
        })),
      },
      retention: `${auth.organization.plan === "STARTER" ? 90 : auth.organization.plan === "GROWTH" ? 365 : 1095} days on ${auth.organization.plan.toLowerCase()}`,
    });
  },
});
