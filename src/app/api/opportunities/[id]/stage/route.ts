import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { stageChangeSchema } from "@/server/validation";
import { STAGE_PROBABILITY } from "@/server/engines/metrics";
import { dispatchWebhooks } from "@/server/services/webhooks";
import { runAutomations } from "@/server/services/automations";

export const POST = route({
  permission: "opportunities:write",
  body: stageChangeSchema,
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.opportunity.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
      include: { customer: { select: { name: true } } },
    });
    if (!existing) throw AppError.notFound("Opportunity");

    const probability =
      body.probability ??
      STAGE_PROBABILITY[body.stage as keyof typeof STAGE_PROBABILITY] ??
      existing.probability;
    const closed = body.stage === "WON" || body.stage === "LOST";

    const deal = await db.opportunity.update({
      where: { id: existing.id },
      data: {
        stage: body.stage,
        probability,
        weightedAmount: (Number(existing.amount) * probability) / 100,
        stageEnteredAt: new Date(),
        daysInStage: 0,
        closedAt: closed ? new Date() : null,
        lossReason:
          body.stage === "LOST"
            ? (body.lossReason ?? existing.lossReason ?? "No reason recorded")
            : null,
        forecastCategory:
          body.stage === "WON"
            ? "Closed"
            : body.stage === "LOST"
              ? "Omitted"
              : existing.forecastCategory,
      },
    });

    if (body.note) {
      await db.activity.create({
        data: {
          organizationId: auth.organization.id,
          customerId: existing.customerId,
          opportunityId: existing.id,
          userId: auth.user.id,
          type: "NOTE",
          direction: "INTERNAL",
          subject: `Stage moved to ${body.stage.replace(/_/g, " ").toLowerCase()}`,
          body: body.note,
        },
      });
    }

    await auditAs(auth, {
      action: "deal.stage_changed",
      entityType: "opportunity",
      entityId: existing.id,
      entityLabel: `Deal #${existing.code.replace("OPP-", "")}`,
      before: { stage: existing.stage, probability: existing.probability },
      after: {
        stage: deal.stage,
        probability: deal.probability,
        amount: Number(deal.amount),
      },
    });

    const payload = {
      id: deal.id,
      code: deal.code,
      name: deal.name,
      from: existing.stage,
      to: deal.stage,
      amount: Number(deal.amount),
      customerName: existing.customer.name,
      customerId: existing.customerId,
      ownerId: deal.ownerId,
      stage: deal.stage,
      probability: deal.probability,
    };
    await dispatchWebhooks({
      organizationId: auth.organization.id,
      event: "opportunity.stage_changed",
      payload,
    });
    if (closed) {
      await dispatchWebhooks({
        organizationId: auth.organization.id,
        event: body.stage === "WON" ? "opportunity.won" : "opportunity.lost",
        payload,
      });
    }
    // Stage movements feed the automation engine so playbooks react immediately.
    await runAutomations(
      auth.organization.id,
      {
        type: "deal_stage_changed",
        entityType: "Opportunity",
        entityId: deal.id,
        entityLabel: deal.name,
        data: {
          ...payload,
          customerId: existing.customerId,
          customerName: existing.customer.name,
        },
      },
      { triggeredBy: `user:${auth.user.id}` },
    );
    if (closed) {
      await runAutomations(
        auth.organization.id,
        {
          type: body.stage === "WON" ? "deal_won" : "deal_lost",
          entityType: "Opportunity",
          entityId: deal.id,
          entityLabel: deal.name,
          data: {
            ...payload,
            customerId: existing.customerId,
            customerName: existing.customer.name,
            amount: Number(deal.amount),
            arr: body.stage === "WON" ? Number(deal.amount) : 0,
            daysToRenewal: null,
          },
        },
        { triggeredBy: `user:${auth.user.id}` },
      );
    }

    return {
      data: {
        ...deal,
        amount: Number(deal.amount),
        weightedAmount: Number(deal.weightedAmount),
      },
    };
  },
});
