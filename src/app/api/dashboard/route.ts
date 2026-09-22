import { route } from "@/server/api";
import {
  computeRevenueSnapshot,
  resolveWindow,
  metricSeries,
  bucketSeries,
  linearForecast,
  OPEN_STAGES,
} from "@/server/engines/metrics";
import { revenueScorecard } from "@/server/engines/kpis";
import { z } from "zod";

const querySchema = z.object({
  window: z
    .enum(["7d", "30d", "90d", "qtd", "ytd", "12m", "24m"])
    .default("90d"),
  comparison: z.enum(["previous", "year"]).default("previous"),
});

export const GET = route({
  query: querySchema,
  handler: async ({ auth, query, db }) => {
    const organizationId = auth.organization.id;
    const window = resolveWindow(query.window ?? "90d");
    const snapshot = await computeRevenueSnapshot(organizationId, window);

    const [
      series,
      insights,
      risks,
      tasks,
      activities,
      pipelineByStage,
      customers,
      automations,
    ] = await Promise.all([
      metricSeries(organizationId, "revenue_day", {
        granularity: "DAY",
        from: window.from,
      }),
      db.insight.findMany({
        where: {
          organizationId,
          status: { in: ["DETECTED", "REVIEWING", "IN_PROGRESS"] },
        },
        orderBy: [{ priorityScore: "desc" }, { estimatedImpact: "desc" }],
        take: 4,
        select: {
          id: true,
          title: true,
          summary: true,
          category: true,
          priority: true,
          priorityScore: true,
          confidence: true,
          estimatedImpact: true,
          impactScope: true,
          status: true,
          detectedAt: true,
          actions: true,
        },
      }),
      db.risk.findMany({
        where: {
          organizationId,
          status: { in: ["OPEN", "MITIGATING", "MONITORING"] },
        },
        orderBy: [{ riskScore: "desc" }],
        take: 5,
        select: {
          id: true,
          title: true,
          category: true,
          severity: true,
          status: true,
          probability: true,
          impact: true,
          riskScore: true,
          detectedAt: true,
          customerId: true,
        },
      }),
      db.activity.findMany({
        where: { organizationId, type: "TASK", completedAt: null },
        orderBy: [{ dueAt: "asc" }],
        take: 5,
        select: {
          id: true,
          subject: true,
          dueAt: true,
          isOverdue: true,
          userId: true,
          customer: { select: { name: true, id: true } },
          opportunity: { select: { name: true, id: true } },
        },
      }),
      db.activity.findMany({
        where: { organizationId, deletedAt: null },
        orderBy: { occurredAt: "desc" },
        take: 6,
        select: {
          id: true,
          type: true,
          subject: true,
          outcome: true,
          occurredAt: true,
          user: { select: { name: true } },
          customer: { select: { name: true, id: true } },
        },
      }),
      db.opportunity.groupBy({
        by: ["stage"],
        where: {
          organizationId,
          deletedAt: null,
          stage: { in: OPEN_STAGES as never },
        },
        _count: true,
        _sum: { amount: true, weightedAmount: true },
      }),
      db.customer.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          healthScore: true,
          arr: true,
          status: true,
          churnProbability: true,
        },
      }),
      db.automation.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          status: true,
          runCount: true,
          successCount: true,
          timeSavedMinutes: true,
        },
      }),
    ]);

    const healthMix = { healthy: 0, watch: 0, at_risk: 0 };
    for (const customer of customers) {
      if (customer.status === "CHURNED") continue;
      if (customer.healthScore >= 80) healthMix.healthy += 1;
      else if (customer.healthScore >= 60) healthMix.watch += 1;
      else healthMix.at_risk += 1;
    }

    const runs = automations.reduce(
      (acc, automation) => acc + automation.runCount,
      0,
    );
    const successes = automations.reduce(
      (acc, automation) => acc + automation.successCount,
      0,
    );

    // Single source of truth for the four headline numbers: real comparison
    // periods, formula provenance and the sparkline series, shared with the
    // intelligence brief so the two can never disagree.
    const scorecard = await revenueScorecard(organizationId, { window: query.window, snapshot });
    const kpis = scorecard.kpis;

    const dailySeries = bucketSeries(
      series.map((point) => ({ period: point.period, value: point.value })),
      "week",
    );
    const forecast = linearForecast(
      series.map((point) => ({ period: point.period, value: point.value })),
      30,
    );
    const recentSeries = series.slice(-14);

    return {
      data: {
        window: { from: window.from, to: window.to, key: query.window },
        snapshot,
        kpis,
        series: dailySeries.map((point) => ({
          period: point.period,
          value: point.value,
          forecast: false,
        })),
        forecast,
        forecastSeries: [
          ...recentSeries.map((point) => ({
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
        pipelineByStage: pipelineByStage
          .map((row) => ({
            stage: row.stage,
            count: row._count,
            value: Number(row._sum.amount ?? 0),
            weighted: Number(row._sum.weightedAmount ?? 0),
          }))
          .sort(
            (a, b) =>
              OPEN_STAGES.indexOf(a.stage as never) -
              OPEN_STAGES.indexOf(b.stage as never),
          ),
        healthMix,
        insights,
        risks,
        tasks,
        activities,
        automations: {
          total: automations.length,
          active: automations.filter(
            (automation) => automation.status === "ACTIVE",
          ).length,
          runs,
          successRate: runs ? (successes / runs) * 100 : 0,
          hoursSaved: Math.round(
            automations.reduce(
              (acc, automation) => acc + automation.timeSavedMinutes,
              0,
            ) / 60,
          ),
        },
      },
    };
  },
});

function resolveAutomationCoverage(automations: { status: string }[]) {
  if (!automations.length) return 40;
  return Math.min(
    100,
    (automations.filter((automation) => automation.status === "ACTIVE").length /
      automations.length) *
      120,
  );
}
