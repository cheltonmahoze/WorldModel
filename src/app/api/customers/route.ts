import { route } from "@/server/api";
import { paginationFrom, paginated } from "@/server/api";
import {
  customerCreateSchema,
  customerFilterSchema,
} from "@/server/validation";
import { assertWithinPlan } from "@/server/plan-guard";
import { auditAs } from "@/server/audit";
import type { Prisma } from "@prisma/client";

export const GET = route({
  query: customerFilterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take, orderBy } = paginationFrom(query);
    const where: Prisma.CustomerWhereInput = {
      organizationId: auth.organization.id,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.segment ? { segment: query.segment } : {}),
      ...(query.region ? { region: query.region } : {}),
      ...(query.tier ? { tier: query.tier } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.minArr ? { arr: { gte: query.minArr } } : {}),
      ...(query.health === "healthy"
        ? { healthScore: { gte: 80 } }
        : query.health === "watch"
          ? { healthScore: { gte: 60, lt: 80 } }
          : query.health === "at_risk"
            ? { healthScore: { lt: 60 } }
            : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { domain: { contains: query.q, mode: "insensitive" } },
              { industry: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total, summary] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy: { ...orderBy, arr: "desc" },
        skip,
        take,
        include: {
          owner: { select: { id: true, name: true } },
          csm: { select: { id: true, name: true } },
          _count: {
            select: { contacts: true, opportunities: true, tickets: true },
          },
        },
      }),
      db.customer.count({ where }),
      db.customer.groupBy({
        by: ["status"],
        where: { organizationId: auth.organization.id, deletedAt: null },
        _count: true,
        _sum: { arr: true },
      }),
    ]);

    return paginated(
      items.map((customer) => ({
        ...customer,
        arr: Number(customer.arr),
        mrr: Number(customer.mrr),
        lifetimeValue: Number(customer.lifetimeValue),
        expansionMrr: Number(customer.expansionMrr),
        churnedMrr: Number(customer.churnedMrr),
      })),
      total,
      page,
      pageSize,
      {
        byStatus: summary.map((row) => ({
          status: row.status,
          count: row._count,
          arr: Number(row._sum.arr ?? 0),
        })),
      },
    );
  },
});

export const POST = route({
  permission: "customers:write",
  body: customerCreateSchema,
  rateLimit: "write",
  handler: async ({ auth, body, db }) => {
    await assertWithinPlan(
      auth.organization.id,
      auth.organization.plan,
      "customers",
    );
    const arr = Number(body.arr ?? 0);
    const customer = await db.customer.create({
      data: {
        organizationId: auth.organization.id,
        name: body.name,
        domain: body.domain ?? null,
        website: body.website ?? null,
        industry: body.industry ?? null,
        segment: body.segment,
        region: body.region ?? null,
        country: body.country ?? null,
        city: body.city ?? null,
        companySize: body.companySize ?? null,
        employeeCount: body.employeeCount ?? null,
        status: body.status,
        plan: body.plan ?? null,
        tier: body.tier ?? null,
        arr,
        mrr: Number(body.mrr ?? Math.round(arr / 12)),
        ownerId: body.ownerId ?? null,
        csmId: body.csmId ?? null,
        renewalDate: body.renewalDate ? new Date(body.renewalDate) : null,
        contractStart: body.contractStart ? new Date(body.contractStart) : null,
        acquisitionChannel: body.acquisitionChannel ?? null,
        notes: body.notes ?? null,
        tags: body.tags ?? [],
        healthScore: 70,
      },
    });

    await auditAs(auth, {
      action: "customer.created",
      entityType: "customer",
      entityId: customer.id,
      entityLabel: customer.name,
      after: { status: customer.status, segment: customer.segment, arr },
    });
    return {
      data: {
        ...customer,
        arr: Number(customer.arr),
        mrr: Number(customer.mrr),
      },
    };
  },
});
