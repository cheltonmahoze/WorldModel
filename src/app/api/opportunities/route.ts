import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { paginationFrom, paginated } from "@/server/api";
import {
  opportunityCreateSchema,
  opportunityFilterSchema,
} from "@/server/validation";
import { OPEN_STAGES, STAGE_PROBABILITY } from "@/server/engines/metrics";
import { assertWithinPlan } from "@/server/plan-guard";
import { auditAs } from "@/server/audit";
import type { Prisma } from "@prisma/client";
import { db as platformDb } from "@/server/db";

export const GET = route({
  query: opportunityFilterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take, orderBy } = paginationFrom(query);
    const stalledCutoff = new Date(Date.now() - 14 * 86_400_000);
    const where: Prisma.OpportunityWhereInput = {
      organizationId: auth.organization.id,
      deletedAt: null,
      ...(query.stage === "OPEN"
        ? { stage: { in: OPEN_STAGES as never } }
        : query.stage
          ? { stage: query.stage }
          : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.region ? { dealRegion: query.region } : {}),
      ...(query.productLine ? { productLine: query.productLine } : {}),
      ...(query.minAmount ? { amount: { gte: query.minAmount } } : {}),
      ...(query.inactiveDays
        ? {
            OR: [
              {
                lastActivityAt: {
                  lt: new Date(Date.now() - query.inactiveDays * 86_400_000),
                },
              },
              { lastActivityAt: null },
            ],
          }
        : {}),
      ...(query.riskOnly
        ? {
            stage: { in: OPEN_STAGES as never },
            OR: [
              { lastActivityAt: { lt: stalledCutoff } },
              { lastActivityAt: null },
            ],
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { code: { contains: query.q, mode: "insensitive" } },
              {
                customer: { name: { contains: query.q, mode: "insensitive" } },
              },
            ],
          }
        : {}),
    };

    const [items, total, byStage] = await Promise.all([
      db.opportunity.findMany({
        where,
        orderBy: { ...orderBy, amount: "desc" },
        skip,
        take,
        include: {
          customer: {
            select: { id: true, name: true, segment: true, healthScore: true },
          },
          owner: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      db.opportunity.count({ where }),
      db.opportunity.groupBy({
        by: ["stage"],
        where: { organizationId: auth.organization.id, deletedAt: null },
        _count: true,
        _sum: { amount: true, weightedAmount: true },
      }),
    ]);

    return paginated(
      items.map((deal) => ({
        ...deal,
        amount: Number(deal.amount),
        weightedAmount: Number(deal.weightedAmount),
        stalled: !deal.lastActivityAt || deal.lastActivityAt < stalledCutoff,
      })),
      total,
      page,
      pageSize,
      {
        byStage: byStage.map((row) => ({
          stage: row.stage,
          count: row._count,
          value: Number(row._sum.amount ?? 0),
          weighted: Number(row._sum.weightedAmount ?? 0),
        })),
      },
    );
  },
});

export const POST = route({
  permission: "opportunities:write",
  body: opportunityCreateSchema,
  rateLimit: "write",
  handler: async ({ auth, body, db }) => {
    await assertWithinPlan(
      auth.organization.id,
      auth.organization.plan,
      "opportunities",
    );
    const customer = await db.customer.findFirst({
      where: {
        id: body.customerId,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });
    if (!customer) throw AppError.notFound("Customer");

    const probability =
      body.probability ??
      STAGE_PROBABILITY[body.stage as keyof typeof STAGE_PROBABILITY] ??
      20;
    const amount = Number(body.amount);
    const deal = await createWithCode(auth.organization.id, (code) => ({
      data: {
        organizationId: auth.organization.id,
        customerId: body.customerId,
        ownerId: body.ownerId ?? auth.user.id,
        name: body.name,
        code,
        stage: body.stage,
        type: body.type,
        source: body.source,
        amount,
        currency: body.currency,
        probability,
        weightedAmount: (amount * probability) / 100,
        expectedCloseDate: new Date(body.expectedCloseDate),
        nextStep: body.nextStep ?? null,
        nextStepDueAt: body.nextStepDueAt ? new Date(body.nextStepDueAt) : null,
        competitor: body.competitor ?? null,
        productLine: body.productLine ?? null,
        dealRegion: body.dealRegion ?? null,
        department: body.department ?? "Revenue",
        forecastCategory: body.forecastCategory ?? null,
        lossReason: body.lossReason ?? null,
        stageEnteredAt: new Date(),
        lastActivityAt: new Date(),
      },
    }));

    await auditAs(auth, {
      action: "opportunity.created",
      entityType: "opportunity",
      entityId: deal.id,
      entityLabel: `${deal.name} (${deal.code})`,
      after: {
        stage: deal.stage,
        amount: Number(deal.amount),
        customer: customer.name,
        ownerId: deal.ownerId,
      },
    });

    return {
      data: {
        ...deal,
        amount: Number(deal.amount),
        weightedAmount: Number(deal.weightedAmount),
      },
    };
  },
});

/**
 * Creates an opportunity with the next free human-readable code.
 *
 * Codes are sequential (`OPP-4822`) but the seeded history is not written in
 * code order, so deriving the next number from the most recently *created* deal
 * collides. The highest existing code is scanned instead, and a unique-constraint
 * hit (two reps saving at the same instant) simply retries with the next number.
 */
async function createWithCode(
  organizationId: string,
  build: (code: string) => Prisma.OpportunityCreateArgs,
) {
  const codes: { code: string }[] = await platformDb.opportunity.findMany({
    where: { organizationId },
    select: { code: true },
  });
  const highest = codes.reduce((max: number, row: { code: string }) => {
    const value = Number(row.code.replace(/\D/g, ""));
    return Number.isFinite(value) && value > max ? value : max;
  }, 4700);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await platformDb.opportunity.create(build(`OPP-${highest + 1 + attempt}`));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002" && attempt < 4) continue;
      throw error;
    }
  }
  throw new AppError("CONFLICT", "opportunity code allocation failed", {
    userMessage: "We could not allocate a deal number right now. Please try again.",
  });
}
