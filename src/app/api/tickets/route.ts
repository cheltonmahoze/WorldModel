import { route, paginated, paginationFrom } from "@/server/api";
import { ticketFilterSchema } from "@/server/validation";
import type { Prisma } from "@prisma/client";

/**
 * Support ticket collection.
 *
 * The workspace surfaces tickets through the Operations module; this endpoint is
 * the REST counterpart so the same records can be listed, filtered and paged by
 * an integration, a mobile client or the API-key holder — reading a ticket by id
 * was possible before, listing them was not.
 */
export const GET = route({
  query: ticketFilterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take, orderBy } = paginationFrom(query);
    const where: Prisma.SupportTicketWhereInput = {
      organizationId: auth.organization.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.slaBreached === undefined ? {} : { slaBreached: query.slaBreached }),
      ...(query.q
        ? {
            OR: [
              { subject: { contains: query.q, mode: "insensitive" } },
              { reference: { contains: query.q, mode: "insensitive" } },
              { customer: { name: { contains: query.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [items, total, byStatus, breached] = await Promise.all([
      db.supportTicket.findMany({
        where,
        orderBy: { ...orderBy, openedAt: "desc" },
        skip,
        take,
        include: {
          customer: { select: { id: true, name: true, tier: true } },
          assignee: { select: { id: true, name: true } },
        },
      }),
      db.supportTicket.count({ where }),
      db.supportTicket.groupBy({
        by: ["status"],
        where: { organizationId: auth.organization.id },
        _count: true,
      }),
      db.supportTicket.count({
        where: { organizationId: auth.organization.id, slaBreached: true },
      }),
    ]);

    return paginated(items, total, page, pageSize, {
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count })),
      breached,
    });
  },
});
