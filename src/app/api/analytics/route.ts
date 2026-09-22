import { route } from "@/server/api";
import { resolveWindow, previousWindow } from "@/server/engines/metrics";
import { z } from "zod";

const querySchema = z.object({
  window: z.enum(["30d", "90d", "qtd", "ytd", "12m", "24m"]).default("90d"),
  department: z.string().optional(),
  region: z.string().optional(),
  segment: z.string().optional(),
  productLine: z.string().optional(),
  ownerId: z.string().optional(),
  compare: z.enum(["previous", "year"]).default("previous"),
});

export const GET = route({
  query: querySchema,
  handler: async ({ auth, query, db }) => {
    const organizationId = auth.organization.id;
    const window = resolveWindow(query.window ?? "90d");
    const prev = previousWindow(window);

    const customerFilter = {
      ...(query.segment ? { segment: query.segment as never } : {}),
      ...(query.region ? { region: query.region } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    };

    const customers = await db.customer.findMany({
      where: { organizationId, deletedAt: null, ...customerFilter },
      select: {
        id: true,
        name: true,
        segment: true,
        region: true,
        industry: true,
        status: true,
        arr: true,
        mrr: true,
        healthScore: true,
        churnProbability: true,
        expansionMrr: true,
        churnedMrr: true,
        renewalDate: true,
        ownerId: true,
        csmId: true,
      },
    });

    const [
      currentDeals,
      previousDeals,
      activities,
      tickets,
      invoices,
      automations,
      executions,
    ] = await Promise.all([
      db.opportunity.findMany({
        where: {
          organizationId,
          deletedAt: null,
          ...(query.productLine ? { productLine: query.productLine } : {}),
          ...(query.department ? { department: query.department } : {}),
          ...(query.region ? { dealRegion: query.region } : {}),
          ...(query.ownerId ? { ownerId: query.ownerId } : {}),
          OR: [
            { createdAt: { gte: window.from, lte: window.to } },
            { closedAt: { gte: window.from, lte: window.to } },
          ],
        },
        select: {
          id: true,
          name: true,
          code: true,
          amount: true,
          weightedAmount: true,
          stage: true,
          type: true,
          source: true,
          productLine: true,
          dealRegion: true,
          department: true,
          ownerId: true,
          createdAt: true,
          closedAt: true,
          expectedCloseDate: true,
          lastActivityAt: true,
          probability: true,
        },
      }),
      db.opportunity.findMany({
        where: {
          organizationId,
          deletedAt: null,
          OR: [
            { createdAt: { gte: prev.from, lte: prev.to } },
            { closedAt: { gte: prev.from, lte: prev.to } },
          ],
        },
        select: { amount: true, stage: true, closedAt: true, createdAt: true },
      }),
      db.activity.findMany({
        where: {
          organizationId,
          deletedAt: null,
          occurredAt: { gte: window.from, lte: window.to },
        },
        select: {
          type: true,
          outcome: true,
          durationMinutes: true,
          userId: true,
          occurredAt: true,
          customerId: true,
          opportunityId: true,
        },
      }),
      db.supportTicket.findMany({
        where: {
          organizationId,
          openedAt: { gte: window.from, lte: window.to },
          customerId: { in: customers.map((customer) => customer.id) },
        },
        select: {
          slaBreached: true,
          resolutionMinutes: true,
          status: true,
          priority: true,
          openedAt: true,
          csatScore: true,
        },
      }),
      db.invoice.findMany({
        where: {
          organizationId,
          issuedAt: { gte: window.from, lte: window.to },
        },
        select: {
          total: true,
          status: true,
          paidAt: true,
          dueAt: true,
          issuedAt: true,
          customerId: true,
        },
      }),
      db.automation.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          id: true,
          name: true,
          status: true,
          runCount: true,
          failureCount: true,
          timeSavedMinutes: true,
        },
      }),
      db.automationExecution.findMany({
        where: {
          organizationId,
          startedAt: { gte: window.from, lte: window.to },
        },
        select: {
          status: true,
          durationMs: true,
          startedAt: true,
          automationId: true,
        },
      }),
    ]);

    const scored = currentDeals.filter((deal) => deal.closedAt);
    const won = scored.filter((deal) => deal.stage === "WON");
    const lost = scored.filter((deal) => deal.stage === "LOST");
    const open = currentDeals.filter((deal) => !deal.closedAt);

    const wonValue = won.reduce((acc, deal) => acc + Number(deal.amount), 0);
    const prevWon = previousDeals.filter(
      (deal) => deal.stage === "WON" && deal.closedAt,
    );
    const prevWonValue = prevWon.reduce(
      (acc, deal) => acc + Number(deal.amount),
      0,
    );

    const people = await db.membership.findMany({
      where: { organizationId: auth.organization.id, deletedAt: null },
      select: { userId: true, user: { select: { name: true } } },
    });
    const nameOf = (id: string) => people.find((row) => row.userId === id)?.user.name ?? "Unassigned";

    const byOwner = aggregate(
      open,
      (deal) => deal.ownerId ?? "Unassigned",
      (deal) => ({
        deals: 1,
        pipeline: Number(deal.amount),
        weighted: Number(deal.weightedAmount),
        won: deal.stage === "WON" ? 1 : 0,
        wonValue: deal.stage === "WON" ? Number(deal.amount) : 0,
      }),
    );
    const byProduct = aggregate(
      currentDeals,
      (deal) => deal.productLine ?? "Unassigned",
      (deal) => ({
        deals: 1,
        pipeline: Number(deal.amount),
        weighted: Number(deal.weightedAmount),
        won: deal.stage === "WON" ? 1 : 0,
        wonValue: deal.stage === "WON" ? Number(deal.amount) : 0,
      }),
    );
    const byRegion = aggregate(
      currentDeals,
      (deal) => deal.dealRegion ?? "Unassigned",
      (deal) => ({
        deals: 1,
        pipeline: Number(deal.amount),
        weighted: Number(deal.weightedAmount),
        won: deal.stage === "WON" ? 1 : 0,
        wonValue: deal.stage === "WON" ? Number(deal.amount) : 0,
      }),
    );
    const bySegment = aggregate(
      currentDeals,
      (deal) => deal.type,
      (deal) => ({
        deals: 1,
        pipeline: Number(deal.amount),
        weighted: Number(deal.weightedAmount),
        won: deal.stage === "WON" ? 1 : 0,
        wonValue: deal.stage === "WON" ? Number(deal.amount) : 0,
      }),
    );

    const funnel = [
      "DISCOVERY",
      "QUALIFICATION",
      "PROPOSAL",
      "NEGOTIATION",
      "CONTRACT_SENT",
      "WON",
    ].map((stage) => {
      const count = currentDeals.filter((deal) => deal.stage === stage).length;
      const value = currentDeals
        .filter((deal) => deal.stage === stage)
        .reduce((acc, deal) => acc + Number(deal.amount), 0);
      return { stage, count, value };
    });

    const cohorts = cohortRetention(customers);
    const activityMix = aggregate(
      activities,
      (activity) => activity.type,
      () => ({ count: 1, minutes: 0 }),
      (activity) => ({ minutes: activity.durationMinutes ?? 0 }),
    );
    const responseByUser = aggregate(
      activities,
      (activity) => activity.userId ?? "Unassigned",
      () => ({ count: 1, positive: 0 }),
      (activity) => ({ positive: activity.outcome === "POSITIVE" ? 1 : 0 }),
    );

    const labelled = <T extends { key: string }>(rows: T[]) => rows.map((row) => ({ ...row, label: nameOf(row.key) }));

    return {
      data: {
        window: {
          key: query.window,
          from: window.from,
          to: window.to,
          previousFrom: prev.from,
          previousTo: prev.to,
        },
        headline: {
          wonValue,
          previousWonValue: prevWonValue,
          wonCount: won.length,
          lostCount: lost.length,
          winRate: scored.length ? (won.length / scored.length) * 100 : 0,
          averageDealSize: won.length ? wonValue / won.length : 0,
          averageCycleDays: won.length
            ? won.reduce(
                (acc, deal) =>
                  acc +
                  Math.max(
                    1,
                    (deal.closedAt!.getTime() - deal.createdAt.getTime()) /
                      86_400_000,
                  ),
                0,
              ) / won.length
            : 0,
          openPipeline: open.reduce(
            (acc, deal) => acc + Number(deal.amount),
            0,
          ),
          weightedPipeline: open.reduce(
            (acc, deal) => acc + Number(deal.weightedAmount),
            0,
          ),
          activities: activities.length,
          meetings: activities.filter((activity) =>
            ["MEETING", "DEMO", "QBR"].includes(activity.type),
          ).length,
          slaAdherence: tickets.length
            ? ((tickets.length -
                tickets.filter((ticket) => ticket.slaBreached).length) /
                tickets.length) *
              100
            : 100,
          onTimePaymentRate: invoices.filter(
            (invoice) => invoice.status === "PAID",
          ).length
            ? (invoices.filter(
                (invoice) =>
                  invoice.status === "PAID" &&
                  invoice.paidAt &&
                  invoice.paidAt <= invoice.dueAt,
              ).length /
                invoices.filter((invoice) => invoice.status === "PAID")
                  .length) *
              100
            : 100,
          automationRuns: executions.length,
          automationFailureRate: executions.length
            ? (executions.filter((execution) => execution.status === "FAILED")
                .length /
                executions.length) *
              100
            : 0,
        },
        dimensions: {
          byOwner: labelled(byOwner),
          byProduct,
          byRegion,
          bySegment,
          activityMix,
          responseByUser: labelled(responseByUser),
        },
        funnel,
        cohorts,
        health: {
          buckets: [
            {
              key: "80-100",
              label: "Healthy",
              count: customers.filter((customer) => customer.healthScore >= 80)
                .length,
            },
            {
              key: "60-79",
              label: "Monitor",
              count: customers.filter(
                (customer) =>
                  customer.healthScore >= 60 && customer.healthScore < 80,
              ).length,
            },
            {
              key: "<60",
              label: "At risk",
              count: customers.filter((customer) => customer.healthScore < 60)
                .length,
            },
          ],
          churnRisk: customers.filter(
            (customer) => customer.churnProbability >= 60,
          ).length,
          totalArr: customers.reduce(
            (acc, customer) => acc + Number(customer.arr),
            0,
          ),
        },
        automationOptions: automations.map((automation) => ({
          id: automation.id,
          name: automation.name,
          status: automation.status,
          runCount: automation.runCount,
          failureCount: automation.failureCount,
          hoursSaved: automation.timeSavedMinutes / 60,
        })),
      },
    };
  },
});

function aggregate<T, R extends Record<string, number>>(
  items: T[],
  keyFn: (item: T) => string,
  init: (item: T) => R,
  extra?: (item: T) => Partial<R>,
) {
  const map = new Map<string, R>();
  for (const item of items) {
    const key = keyFn(item);
    const current = map.get(key) ?? (init(item) as R);
    const deltas = extra?.(item) ?? {};
    for (const [field, value] of Object.entries(deltas)) {
      current[field as keyof R] = ((current[field as keyof R] as number) +
        (value as number)) as R[keyof R];
    }
    map.set(key, current);
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length);
}

/** Simple cohort retention grid based on contract start month. */
function cohortRetention(
  customers: {
    status: string;
    arr: unknown;
    churnedMrr: unknown;
    expansionMrr: unknown;
    renewalDate: Date | null;
  }[],
) {
  const cohorts = new Map<
    string,
    { accounts: number; arr: number; churned: number; expansion: number }
  >();
  for (const customer of customers) {
    const month = customer.renewalDate
      ? new Date(
          customer.renewalDate.getFullYear(),
          customer.renewalDate.getMonth() - 12,
          1,
        )
      : new Date();
    const key = month.toLocaleDateString("en-GB", {
      month: "short",
      year: "2-digit",
    });
    const entry = cohorts.get(key) ?? {
      accounts: 0,
      arr: 0,
      churned: 0,
      expansion: 0,
    };
    entry.accounts += 1;
    entry.arr += Number(customer.arr);
    if (customer.status === "CHURNED") entry.churned += 1;
    entry.expansion += Number(customer.expansionMrr) * 12;
    cohorts.set(key, entry);
  }
  return [...cohorts.entries()]
    .map(([key, value]) => ({ cohort: key, ...value }))
    .sort((a, b) => a.cohort.localeCompare(b.cohort));
}
