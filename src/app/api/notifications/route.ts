import { route } from "@/server/api";
import { notificationFilterSchema } from "@/server/validation";
import type { Prisma } from "@prisma/client";

export const GET = route({
  query: notificationFilterSchema,
  handler: async ({ auth, query, db }) => {
    const where: Prisma.NotificationWhereInput = {
      organizationId: auth.organization.id,
      OR: [{ userId: auth.user.id }, { userId: null }],
      ...(query.filter === "unread"
        ? { readAt: null }
        : query.filter === "archived"
          ? { readAt: { not: null } }
          : {}),
    };
    const [items, unread, total] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.notification.count({
        where: {
          organizationId: auth.organization.id,
          OR: [{ userId: auth.user.id }, { userId: null }],
          readAt: null,
        },
      }),
      db.notification.count({ where }),
    ]);
    return {
      data: {
        items,
        unread,
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    };
  },
});
