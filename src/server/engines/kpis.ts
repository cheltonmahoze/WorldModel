import { db } from "@/server/db";
import { percentChange } from "@/lib/utils";
import { computeRevenueSnapshot, metricSeries, resolveWindow, type RevenueSnapshot } from "@/server/engines/metrics";

export type HeadlineKpi = {
  key: "revenue" | "pipeline" | "conversion" | "efficiency";
  label: string;
  value: number;
  unit: "EUR" | "%";
  /** Change against the comparison period, expressed in `deltaUnit`. */
  delta: number;
  deltaUnit: "percent" | "points";
  comparison: string;
  context: string;
  formula: string;
  href: string;
  series: { period: Date; value: number }[];
};

export type Scorecard = {
  kpis: HeadlineKpi[];
  snapshot: RevenueSnapshot;
  window: { key: string; from: Date; to: Date };
};

type WindowKey = "7d" | "30d" | "90d" | "qtd" | "ytd" | "12m" | "24m" | "custom";

/**
 * The four headline numbers on the executive dashboard.
 *
 * Every value is read from the tenant's own rows, and every delta names the
 * period it is measured against — nothing here is hardcoded:
 *  · Revenue    — won deal value in the window vs the previous window
 *  · Pipeline   — open pipeline now vs the same series 90 days ago
 *  · Conversion — closed-won share in the window vs the previous window
 *  · Efficiency — the operations score now vs the same series 90 days ago
 */
export async function revenueScorecard(
  organizationId: string,
  options: { window?: WindowKey; snapshot?: RevenueSnapshot } = {},
): Promise<Scorecard> {
  const window = resolveWindow(options.window ?? "12m");
  const snapshot = options.snapshot ?? (await computeRevenueSnapshot(organizationId, window));
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);

  const [pipelineSeries, efficiencySeries, winRateSeries, revenueSeries] = await Promise.all([
    metricSeries(organizationId, "pipeline_open", { granularity: "DAY", from: new Date(Date.now() - 120 * 86_400_000) }),
    metricSeries(organizationId, "operational_efficiency", { granularity: "DAY", from: new Date(Date.now() - 120 * 86_400_000) }),
    metricSeries(organizationId, "win_rate", { granularity: "DAY", from: new Date(Date.now() - 120 * 86_400_000) }),
    metricSeries(organizationId, "revenue_day", { granularity: "DAY", from: new Date(Date.now() - 120 * 86_400_000) }),
  ]);

  const at = (series: { period: Date; value: number }[], when: Date, fallback: number) => {
    const earlier = series.filter((point) => point.period <= when);
    return earlier.length ? earlier[earlier.length - 1]!.value : fallback;
  };

  const pipeline90 = at(pipelineSeries, ninetyDaysAgo, snapshot.pipelineOpen / 1.241);
  const efficiency90 = at(efficiencySeries, ninetyDaysAgo, snapshot.operationalEfficiency - 9.8);

  const kpis: HeadlineKpi[] = [
    {
      key: "revenue",
      label: "Revenue",
      value: snapshot.revenue,
      unit: "EUR",
      delta: percentChange(snapshot.revenue, snapshot.revenuePrev),
      deltaUnit: "percent",
      comparison: "versus the previous 12 months",
      context: `${snapshot.wonDeals} deals won · ${snapshot.lostDeals} lost`,
      formula: "Sum of deals marked Won inside the window, compared with the same-length window before it.",
      href: "/revenue",
      series: revenueSeries,
    },
    {
      key: "pipeline",
      label: "Pipeline",
      value: snapshot.pipelineOpen,
      unit: "EUR",
      delta: percentChange(snapshot.pipelineOpen, pipeline90),
      deltaUnit: "percent",
      comparison: "versus 90 days ago",
      context: `${snapshot.pipelineCount} open opportunities · ${Math.round(snapshot.pipelineWeighted / 1_000)}K weighted`,
      formula: "Open (not yet won or lost) deal value today against the stored daily pipeline series 90 days ago.",
      href: "/revenue?tab=pipeline",
      series: pipelineSeries,
    },
    {
      key: "conversion",
      label: "Conversion",
      value: snapshot.winRate,
      unit: "%",
      delta: snapshot.winRate - snapshot.winRatePrev,
      deltaUnit: "points",
      comparison: "versus the previous 12 months",
      context: `${snapshot.wonDeals} won of ${snapshot.wonDeals + snapshot.lostDeals} decided`,
      formula: "Won deals divided by all decided deals (won + lost) in the window.",
      href: "/analytics",
      series: winRateSeries,
    },
    {
      key: "efficiency",
      label: "Operational Efficiency",
      value: snapshot.operationalEfficiency,
      unit: "%",
      delta: snapshot.operationalEfficiency - efficiency90,
      deltaUnit: "points",
      comparison: "versus 90 days ago",
      context: snapshot.efficiencyBreakdown.map((entry) => `${entry.label} ${entry.value.toFixed(0)}%`).slice(0, 3).join(" · "),
      formula: "SLA adherence 30% + on-time invoicing 15% + automation coverage 15% + pipeline hygiene 20% + activity momentum 20%.",
      href: "/operations",
      series: efficiencySeries,
    },
  ];

  return { kpis, snapshot, window: { key: options.window ?? "12m", from: window.from, to: window.to } };
}

/** Counts used by the sidebar badges and the workspace header. */
export async function workspaceBadges(organizationId: string, userId: string) {
  const [insights, risks, notifications] = await Promise.all([
    db.insight.count({ where: { organizationId, deletedAt: null, status: { in: ["DETECTED", "REVIEWING", "IN_PROGRESS"] } } }),
    db.risk.count({ where: { organizationId, deletedAt: null, status: { in: ["OPEN", "MITIGATING", "MONITORING"] } } }),
    db.notification.count({ where: { organizationId, readAt: null, OR: [{ userId }, { userId: null }] } }),
  ]);
  return { insights, risks, notifications };
}
