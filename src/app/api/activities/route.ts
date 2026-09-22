import { route } from "@/server/api";
import { paginationFrom, paginated } from "@/server/api";
import {
  activityCreateSchema,
  activityFilterSchema,
} from "@/server/validation";
import { auditAs } from "@/server/audit";
import type { Prisma } from "@prisma/client";

export const GET = route({
  query: activityFilterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take, orderBy } = paginationFrom(query);
    const where: Prisma.ActivityWhereInput = {
      organizationId: auth.organization.id,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from ? { occurredAt: { gte: new Date(query.from) } } : {}),
      ...(query.to ? { occurredAt: { lte: new Date(query.to) } } : {}),
      ...(query.overdueOnly
        ? { completedAt: null, dueAt: { lt: new Date() } }
        : {}),
      ...(query.q
        ? { subject: { contains: query.q, mode: "insensitive" } }
        : {}),
    };

    const [items, total] = await Promise.all([
      db.activity.findMany({
        where,
        orderBy: query.overdueOnly
          ? { dueAt: "asc" }
          : { ...orderBy, occurredAt: "desc" },
        skip,
        take,
        include: {
          customer: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          opportunity: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      db.activity.count({ where }),
    ]);
    return paginated(items, total, page, pageSize);
  },
});

export const POST = route({
  permission: "activities:write",
  body: activityCreateSchema,
  rateLimit: "write",
  handler: async ({ auth, body, db }) => {
    const activity = await db.activity.create({
      data: {
        organizationId: auth.organization.id,
        type: body.type,
        subject: body.subject,
        customerId: body.customerId ?? null,
        contactId: body.contactId ?? null,
        opportunityId: body.opportunityId ?? null,
        userId: body.userId ?? auth.user.id,
        direction: body.direction,
        outcome: body.outcome ?? null,
        body: body.body ?? null,
        durationMinutes: body.durationMinutes ?? null,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        channel: body.channel ?? null,
        completedAt: body.dueAt ? null : new Date(),
      },
    });

    if (activity.opportunityId) {
      await db.opportunity.update({
        where: { id: activity.opportunityId },
        data: {
          lastActivityAt: activity.occurredAt,
          activityCount: { increment: 1 },
        },
      });
    }
    if (activity.customerId) {
      await db.customer.update({
        where: { id: activity.customerId },
        data: {
          lastActivityAt: activity.occurredAt,
          activityCount: { increment: 1 },
        },
      });
    }

    await auditAs(auth, {
      action: "activity.logged",
      entityType: "activity",
      entityId: activity.id,
      entityLabel: activity.subject,
      after: {
        type: activity.type,
        customerId: activity.customerId,
        opportunityId: activity.opportunityId,
      },
    });
    return { data: activity };
  },
});
