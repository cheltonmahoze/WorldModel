import { route } from "@/server/api";
import { paginationFrom, paginated } from "@/server/api";
import { insightFilterSchema } from "@/server/validation";
import type { Prisma } from "@prisma/client";

export const GET = route({
  query: insightFilterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take, orderBy } = paginationFrom(query);
    const where: Prisma.InsightWhereInput = {
      organizationId: auth.organization.id,
      deletedAt: null,
      ...(query.status
        ? { status: query.status }
        : { status: { in: ["DETECTED", "REVIEWING", "IN_PROGRESS"] } }),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { summary: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total, summary] = await Promise.all([
      db.insight.findMany({
        where,
        orderBy: { ...orderBy, priorityScore: "desc" },
        skip,
        take,
        include: {
          owner: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      db.insight.count({ where }),
      db.insight.groupBy({
        by: ["category"],
        where: {
          organizationId: auth.organization.id,
          deletedAt: null,
          status: { in: ["DETECTED", "REVIEWING", "IN_PROGRESS"] },
        },
        _count: true,
        _sum: { estimatedImpact: true },
      }),
    ]);

    return paginated(items, total, page, pageSize, {
      summary: summary.map((row) => ({
        category: row.category,
        count: row._count,
        impact: Number(row._sum.estimatedImpact ?? 0),
      })),
    });
  },
});
