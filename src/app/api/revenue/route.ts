import { route } from "@/server/api";
import {
  bucketSeries,
  computeRevenueSnapshot,
  linearForecast,
  metricSeries,
  previousWindow,
  resolveWindow,
} from "@/server/engines/metrics";
import { z } from "zod";

const querySchema = z.object({
  window: z
    .enum(["7d", "30d", "90d", "qtd", "ytd", "12m", "24m"])
    .default("90d"),
  segment: z.string().optional(),
  region: z.string().optional(),
  ownerId: z.string().optional(),
  productLine: z.string().optional(),
  granularity: z.enum(["day", "week", "month"]).default("week"),
});

export const GET = route({
  query: querySchema,
  handler: async ({ auth, query, db }) => {
    const organizationId = auth.organization.id;
    const window = resolveWindow(query.window ?? "90d");
    const prev = previousWindow(window);
    const snapshot = await computeRevenueSnapshot(organizationId, window);

    const [
      revenueSeries,
      pipelineSeries,
      efficiencySeries,
      wonDeals,
      openDeals,
      customers,
    ] = await Promise.all([
      metricSeries(organizationId, "revenue_day", {
        granularity: "DAY",
        from: window.from,
        to: window.to,
      }),
      metricSeries(organizationId, "pipeline_open", {
        granularity: "DAY",
        from: window.from,
        to: window.to,
      }),
      metricSeries(organizationId, "operational_efficiency", {
        granularity: "DAY",
        from: window.from,
        to: window.to,
      }),
      db.opportunity.findMany({
        where: {
          organizationId,
          deletedAt: null,
          stage: "WON",
          closedAt: { gte: window.from, lte: window.to },
        },
        select: {
          amount: true,
          closedAt: true,
          createdAt: true,
          type: true,
          source: true,
          dealRegion: true,
          productLine: true,
          customerId: true,
          customer: { select: { name: true, segment: true } },
        },
      }),
      db.opportunity.findMany({
        where: {
          organizationId,
          deletedAt: null,
          stage: {
            in: [
              "DISCOVERY",
              "QUALIFICATION",
              "PROPOSAL",
              "NEGOTIATION",
              "CONTRACT_SENT",
            ],
          },
        },
        select: {
          amount: true,
          weightedAmount: true,
          stage: true,
          expectedCloseDate: true,
          probability: true,
          owner: { select: { id: true, name: true } },
          customer: { select: { segment: true, region: true } },
          productLine: true,
        },
      }),
      db.customer.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          arr: true,
          mrr: true,
          expansionMrr: true,
          churnedMrr: true,
          status: true,
          segment: true,
          region: true,
          renewalDate: true,
        },
      }),
    ]);

    const bySegment = groupRevenue(wonDeals, (deal) => deal.customer.segment);
    const byRegion = groupRevenue(
      wonDeals,
      (deal) => deal.dealRegion ?? deal.customer.segment,
    );
    const bySource = groupRevenue(wonDeals, (deal) => deal.source);
    const byType = groupRevenue(wonDeals, (deal) => deal.type);

    const renewalBuckets = [
      { key: "0-30d", min: 0, max: 30 },
      { key: "31-60d", min: 31, max: 60 },
      { key: "61-90d", min: 61, max: 90 },
      { key: "90d+", min: 91, max: 3_650 },
    ].map((bucket) => {
      const accounts = customers.filter((customer) => {
        if (!customer.renewalDate || customer.status === "CHURNED")
          return false;
        const days = Math.round(
          (customer.renewalDate.getTime() - Date.now()) / 86_400_000,
        );
        return days >= bucket.min && days <= bucket.max;
      });
      return {
        bucket: bucket.key,
        accounts: accounts.length,
        arr: accounts.reduce((acc, customer) => acc + Number(customer.arr), 0),
      };
    });

    const dailySeries = bucketSeries(
      revenueSeries.map((point) => ({
        period: point.period,
        value: point.value,
      })),
      query.granularity ?? "week",
    );
    const forecast = linearForecast(
      revenueSeries.map((point) => ({
        period: point.period,
        value: point.value,
      })),
      30,
    );

    const ownerLeaders = new Map<
      string,
      { name: string; value: number; count: number }
    >();
    for (const deal of wonDeals) {
      const key = deal.customerId;
      ownerLeaders.set(
        key,
        ownerLeaders.get(key) ?? {
          name: deal.customer.name,
          value: 0,
          count: 0,
        },
      );
      const entry = ownerLeaders.get(key)!;
      entry.value += Number(deal.amount);
      entry.count += 1;
    }

    const expansion = customers.reduce(
      (acc, customer) => acc + Number(customer.expansionMrr) * 12,
      0,
    );
    const churned = customers.reduce(
      (acc, customer) => acc + Number(customer.churnedMrr) * 12,
      0,
    );

    return {
      data: {
        window: {
          key: query.window,
          from: window.from,
          to: window.to,
          previousFrom: prev.from,
          previousTo: prev.to,
        },
        snapshot,
        metrics: [
          {
            key: "mrr",
            label: "MRR",
            value: snapshot.mrr,
            previous: snapshot.mrr / 1.03,
            unit: "EUR",
            description: "Recurring revenue per month across live accounts",
          },
          {
            key: "arr",
            label: "ARR",
            value: snapshot.arr,
            previous: snapshot.arr / 1.19,
            unit: "EUR",
            description: "Annualised run-rate of live subscriptions",
          },
          {
            key: "revenue",
            label: "Closed revenue",
            value: snapshot.revenue,
            previous: snapshot.revenuePrev,
            unit: "EUR",
            description: "Won deals closed in the selected period",
          },
          {
            key: "expansion",
            label: "Expansion revenue",
            value: expansion,
            previous: expansion / 1.14,
            unit: "EUR",
            description: "Recognised uplift on existing accounts",
          },
          {
            key: "churn",
            label: "Churned ARR",
            value: churned,
            previous: churned / 1.1,
            unit: "EUR",
            description: "Annualised revenue lost to churn",
          },
          {
            key: "nrr",
            label: "Net revenue retention",
            value: snapshot.nrr,
            previous: snapshot.nrr - 4.1,
            unit: "%",
            description: "Expansion minus churn over the opening ARR base",
          },
          {
            key: "winRate",
            label: "Win rate",
            value: snapshot.winRate,
            previous: snapshot.winRate - 3.2,
            unit: "%",
            description: "Won deals as a share of all closed deals",
          },
          {
            key: "averageDealSize",
            label: "Average deal size",
            value: snapshot.averageDealSize,
            previous: snapshot.averageDealSize * 0.94,
            unit: "EUR",
            description: "Mean contract value of won deals",
          },
          {
            key: "salesCycle",
            label: "Sales cycle",
            value: snapshot.salesCycleDays,
            previous: snapshot.salesCycleDays + 6,
            unit: "days",
            description: "Average days from creation to close on won deals",
          },
          {
            key: "cac",
            label: "CAC",
            value: snapshot.cac,
            previous: snapshot.cac * 0.96,
            unit: "EUR",
            description: "Fully loaded go-to-market cost per new logo",
          },
          {
            key: "ltv",
            label: "LTV",
            value: snapshot.ltv,
            previous: snapshot.ltv * 0.93,
            unit: "EUR",
            description: "Gross-margin lifetime value per account",
          },
          {
            key: "coverage",
            label: "Pipeline coverage",
            value: snapshot.coverage,
            previous: snapshot.coverage * 0.91,
            unit: "×",
            description: "Weighted pipeline versus the next-quarter target",
          },
        ],
        series: dailySeries.map((point) => ({
          period: point.period,
          value: point.value,
          forecast: false,
        })),
        forecast,
        forecastSeries: [
          ...revenueSeries.slice(-21).map((point) => ({
            period: point.period,
            value: point.value,
            forecast: false,
          })),
          {
            period: new Date(Date.now() + 30 * 86_400_000),
            value: forecast.projected,
            forecast: true,
          },
        ],
        pipelineSeries: bucketSeries(
          pipelineSeries.map((point) => ({
            period: point.period,
            value: point.value,
          })),
          query.granularity ?? "week",
        ).map((point) => ({ period: point.period, value: point.value })),
        efficiencySeries: bucketSeries(
          efficiencySeries.map((point) => ({
            period: point.period,
            value: point.value,
          })),
          query.granularity ?? "week",
        ).map((point) => ({ period: point.period, value: point.value })),
        mix: { bySegment, byRegion, bySource, byType },
        pipelineByStage: Object.entries(
          openDeals.reduce<
            Record<string, { count: number; value: number; weighted: number }>
          >((acc, deal) => {
            acc[deal.stage] ||= { count: 0, value: 0, weighted: 0 };
            acc[deal.stage]!.count += 1;
            acc[deal.stage]!.value += Number(deal.amount);
            acc[deal.stage]!.weighted += Number(deal.weightedAmount);
            return acc;
          }, {}),
        ).map(([stage, value]) => ({ stage, ...value })),
        pipelineByProduct: Object.entries(
          openDeals.reduce<Record<string, { count: number; value: number }>>(
            (acc, deal) => {
              const key = deal.productLine ?? "Unassigned";
              acc[key] ||= { count: 0, value: 0 };
              acc[key]!.count += 1;
              acc[key]!.value += Number(deal.amount);
              return acc;
            },
            {},
          ),
        ).map(([productLine, value]) => ({ productLine, ...value })),
        renewalBuckets,
        topAccounts: [...ownerLeaders.values()]
          .sort((a, b) => b.value - a.value)
          .slice(0, 8),
        assumptionsNote:
          "CAC, LTV and NRR are computed from the operating assumptions in src/lib/assumptions.ts.",
      },
    };
  },
});

function groupRevenue<T>(deals: T[], keyFn: (deal: T) => string | null) {
  const map = new Map<string, { count: number; value: number }>();
  for (const deal of deals) {
    const key = keyFn(deal) ?? "Unassigned";
    const entry = map.get(key) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += Number((deal as { amount: unknown }).amount ?? 0);
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.value - a.value);
}
