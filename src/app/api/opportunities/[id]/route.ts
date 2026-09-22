import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { opportunityUpdateSchema } from "@/server/validation";

export const GET = route({
  handler: async ({ auth, params, db }) => {
    const deal = await db.opportunity.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            segment: true,
            healthScore: true,
            arr: true,
          },
        },
        owner: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });
    if (!deal) throw AppError.notFound("Opportunity");
    const [activities, risks, siblings] = await Promise.all([
      db.activity.findMany({
        where: { opportunityId: deal.id, deletedAt: null },
        orderBy: { occurredAt: "desc" },
        take: 25,
        include: { user: { select: { name: true } } },
      }),
      db.risk.findMany({
        where: { opportunityId: deal.id, deletedAt: null },
        orderBy: { riskScore: "desc" },
      }),
      db.opportunity.findMany({
        where: {
          customerId: deal.customerId,
          id: { not: deal.id },
          deletedAt: null,
        },
        orderBy: { amount: "desc" },
        take: 5,
        select: { id: true, name: true, code: true, stage: true, amount: true },
      }),
    ]);
    return {
      data: {
        opportunity: {
          ...deal,
          amount: Number(deal.amount),
          weightedAmount: Number(deal.weightedAmount),
        },
        activities,
        risks: risks.map((risk) => ({ ...risk, impact: Number(risk.impact) })),
        siblings: siblings.map((deal) => ({
          ...deal,
          amount: Number(deal.amount),
        })),
      },
    };
  },
});

export const PATCH = route({
  permission: "opportunities:write",
  body: opportunityUpdateSchema,
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.opportunity.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Opportunity");

    const stageChanged =
      body.stage !== undefined && body.stage !== existing.stage;
    const probability =
      body.probability ?? (stageChanged ? undefined : existing.probability);
    const amount = Number(body.amount ?? existing.amount);
    const effectiveProbability = probability ?? existing.probability;

    const deal = await db.opportunity.update({
      where: { id: existing.id },
      data: {
        ...body,
        amount:
          body.amount === undefined || body.amount === null
            ? undefined
            : Number(body.amount),
        expectedCloseDate: body.expectedCloseDate
          ? new Date(body.expectedCloseDate)
          : undefined,
        nextStepDueAt: body.nextStepDueAt
          ? new Date(body.nextStepDueAt)
          : body.nextStepDueAt === null
            ? null
            : undefined,
        probability: probability,
        weightedAmount: (amount * effectiveProbability) / 100,
        stageEnteredAt: stageChanged ? new Date() : undefined,
        daysInStage: stageChanged ? 0 : undefined,
        closedAt:
          body.stage === "WON" || body.stage === "LOST"
            ? new Date()
            : undefined,
      },
    });

    await auditAs(auth, {
      action: stageChanged ? "deal.stage_changed" : "deal.updated",
      entityType: "opportunity",
      entityId: existing.id,
      entityLabel: `Deal #${existing.code.replace("OPP-", "")}`,
      before: {
        stage: existing.stage,
        amount: Number(existing.amount),
        probability: existing.probability,
        expectedCloseDate: existing.expectedCloseDate,
        nextStep: existing.nextStep,
      },
      after: {
        stage: deal.stage,
        amount: Number(deal.amount),
        probability: deal.probability,
        expectedCloseDate: deal.expectedCloseDate,
        nextStep: deal.nextStep,
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

export const DELETE = route({
  permission: "opportunities:delete",
  rateLimit: "write",
  handler: async ({ auth, params, db }) => {
    const existing = await db.opportunity.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Opportunity");
    await db.opportunity.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await auditAs(auth, {
      action: "opportunity.deleted",
      entityType: "opportunity",
      entityId: existing.id,
      entityLabel: existing.name,
      severity: "WARNING",
    });
    return { data: { id: existing.id, deleted: true } };
  },
});
