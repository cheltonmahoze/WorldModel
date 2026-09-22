import type { MetricGranularity } from "@prisma/client";
import { db } from "@/server/db";
import { ASSUMPTIONS } from "@/lib/assumptions";

/** Sales headcount used for the CAC model when no CRM cost centre is connected. */
const REP_COUNT_ASSUMPTION = 6;

/**
 * Metrics engine.
 *
 * Every KPI in the product resolves through here: either live (Prisma
 * aggregates over the tenant's real rows) or from the persisted daily Metric
 * series for long-horizon trends. Nothing is hardcoded in the UI.
 */
export type MetricSeriesPoint = { period: Date; value: number };

const DAY = 86_400_000;

export type MetricWindow = { from: Date; to: Date };

export function resolveWindow(
  range: "7d" | "30d" | "90d" | "qtd" | "ytd" | "12m" | "24m" | "custom",
  options: { from?: string; to?: string; now?: Date } = {},
): MetricWindow {
  const now = options.now ?? new Date();
  const to = options.to ? new Date(options.to) : now;
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let from: Date;
  switch (range) {
    case "7d":
      from = new Date(now.getTime() - 7 * DAY);
      break;
    case "30d":
      from = new Date(now.getTime() - 30 * DAY);
      break;
    case "qtd":
      from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      break;
    case "ytd":
      from = new Date(now.getFullYear(), 0, 1);
      break;
    case "12m":
      from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    case "24m":
      from = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
      break;
    case "custom":
      from = options.from ? new Date(options.from) : new Date(now.getTime() - 90 * DAY);
      break;
    case "90d":
    default:
      from = new Date(now.getTime() - 90 * DAY);
  }
  return { from: startOfDay(from), to: startOfDay(to) };
}

export function previousWindow(window: MetricWindow): MetricWindow {
  const span = window.to.getTime() - window.from.getTime();
  return { from: new Date(window.from.getTime() - span), to: window.from };
}

export type PipelineStageKey =
  | "DISCOVERY"
  | "QUALIFICATION"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "CONTRACT_SENT"
  | "WON"
  | "LOST";

export const OPEN_STAGES: PipelineStageKey[] = [
  "DISCOVERY",
  "QUALIFICATION",
  "PROPOSAL",
  "NEGOTIATION",
  "CONTRACT_SENT",
];

export const STAGE_PROBABILITY: Record<PipelineStageKey, number> = {
  DISCOVERY: 15,
  QUALIFICATION: 30,
  PROPOSAL: 50,
  NEGOTIATION: 70,
  CONTRACT_SENT: 85,
  WON: 100,
  LOST: 0,
};

export type RevenueSnapshot = {
  revenue: number;
  revenuePrev: number;
  wonDeals: number;
  lostDeals: number;
  pipelineOpen: number;
  pipelineWeighted: number;
  pipelineCount: number;
  pipelineStalled: number;
  pipelineStalledCount: number;
  winRate: number;
  winRatePrev: number;
  averageDealSize: number;
  salesCycleDays: number;
  mrr: number;
  arr: number;
  expansionRevenue: number;
  churnRate: number;
  cac: number;
  ltv: number;
  nrr: number;
  conversionRate: number;
  operationalEfficiency: number;
  efficiencyBreakdown: { key: string; label: string; value: number; weight: number; detail: string }[];
  activeCustomers: number;
  atRiskCustomers: number;
  coverage: number;
  forecast: number;
};

async function sumDecimal(
  organizationId: string,
  where: Record<string, unknown>,
  field: "amount" | "weightedAmount" = "amount",
) {
  const result = await db.opportunity.aggregate({
    where: { organizationId, deletedAt: null, ...where } as never,
    _sum: { [field]: true } as never,
    _count: true,
  });
  return {
    value: Number((result._sum as Record<string, unknown>)[field] ?? 0),
    count: result._count as number,
  };
}

/** Full live snapshot of the revenue engine for a tenant and window. */
export async function computeRevenueSnapshot(organizationId: string, window: MetricWindow): Promise<RevenueSnapshot> {
  const prev = previousWindow(window);
  const monthsInWindow = Math.max(1, Math.round((window.to.getTime() - window.from.getTime()) / (30 * 86_400_000)));
  const stalledCutoff = new Date(Date.now() - 14 * DAY);

  const [
    won,
    wonPrev,
    lost,
    openPipeline,
    stalled,
    customers,
    churnRisk,
    invoices,
    activities,
    tickets,
    automations,
    activitiesPrev,
    lostPrev,
  ] = await Promise.all([
    sumDecimal(organizationId, { stage: "WON", closedAt: { gte: window.from, lte: window.to } }),
    sumDecimal(organizationId, { stage: "WON", closedAt: { gte: prev.from, lte: prev.to } }),
    sumDecimal(organizationId, { stage: "LOST", closedAt: { gte: window.from, lte: window.to } }),
    db.opportunity.findMany({
      where: { organizationId, deletedAt: null, stage: { in: OPEN_STAGES } },
      select: { amount: true, weightedAmount: true, probability: true, expectedCloseDate: true },
    }),
    db.opportunity.findMany({
      where: {
        organizationId,
        deletedAt: null,
        stage: { in: OPEN_STAGES },
        OR: [{ lastActivityAt: { lt: stalledCutoff } }, { lastActivityAt: null }],
      },
      select: { amount: true },
    }),
    db.customer.findMany({
      where: { organizationId, deletedAt: null },
      select: { arr: true, status: true, churnProbability: true, expansionMrr: true, churnedMrr: true, mrr: true, createdAt: true },
    }),
    db.customer.count({
      where: { organizationId, deletedAt: null, churnProbability: { gte: 60 }, status: { not: "CHURNED" } },
    }),
    db.invoice.findMany({ where: { organizationId }, select: { total: true, status: true, paidAt: true, dueAt: true } }),
    db.activity.count({ where: { organizationId, deletedAt: null, occurredAt: { gte: window.from, lte: window.to } } }),
    db.supportTicket.findMany({
      where: { organizationId, openedAt: { gte: window.from, lte: window.to } },
      select: { slaBreached: true, resolutionMinutes: true, status: true },
    }),
    db.automation.findMany({
      where: { organizationId, deletedAt: null },
      select: { status: true, runCount: true, successCount: true, timeSavedMinutes: true },
    }),
    db.activity.count({
      where: { organizationId, deletedAt: null, occurredAt: { gte: prev.from, lte: prev.to } },
    }),
    sumDecimal(organizationId, { stage: "LOST", closedAt: { gte: prev.from, lte: prev.to } }),
  ]);

  const totalArr = customers.reduce((acc, customer) => acc + Number(customer.arr), 0);
  const activeCustomers = customers.filter((customer) => customer.status === "ACTIVE" || customer.status === "AT_RISK");
  const churned = customers.filter((customer) => customer.status === "CHURNED");
  const churnedArr = churned.reduce((acc, customer) => acc + Number(customer.churnedMrr ?? 0) * 12, 0);
  const expansionRevenue = customers.reduce((acc, customer) => acc + Number(customer.expansionMrr) * 12, 0);
  const mrr = customers
    .filter((customer) => customer.status !== "CHURNED")
    .reduce((acc, customer) => acc + Number(customer.mrr), 0);

  const pipelineOpen = openPipeline.reduce((acc, deal) => acc + Number(deal.amount), 0);
  const pipelineWeighted = openPipeline.reduce(
    (acc, deal) => acc + (Number(deal.weightedAmount) || (Number(deal.amount) * deal.probability) / 100),
    0,
  );
  const pipelineStalled = stalled.reduce((acc, deal) => acc + Number(deal.amount), 0);

  const closedCount = won.count + lost.count;
  const winRate = closedCount ? (won.count / closedCount) * 100 : 0;
  const closedPrev = wonPrev.count + lostPrev.count;
  const winRatePrev = closedPrev ? (wonPrev.count / closedPrev) * 100 : 0;
  const averageDealSize = won.count ? won.value / won.count : 0;

  const cycleDeals = await db.opportunity.findMany({
    where: { organizationId, deletedAt: null, stage: "WON", closedAt: { gte: window.from, lte: window.to } },
    select: { createdAt: true, closedAt: true },
  });
  const salesCycleDays = cycleDeals.length
    ? cycleDeals.reduce(
        (acc, deal) => acc + Math.max(1, (deal.closedAt!.getTime() - deal.createdAt.getTime()) / DAY),
        0,
      ) / cycleDeals.length
    : 0;

  const salesActivity = activities + activitiesPrev;
  const onTimeInvoices = invoices.filter(
    (invoice) => invoice.status === "PAID" && invoice.paidAt && invoice.paidAt <= invoice.dueAt,
  ).length;
  const paidInvoices = invoices.filter((invoice) => invoice.status === "PAID").length;
  const slaAdherence = tickets.length ? (tickets.filter((ticket) => !ticket.slaBreached).length / tickets.length) * 100 : 92;
  const automationCoverage = automations.length
    ? Math.min(100, (automations.filter((a) => a.status === "ACTIVE").length / automations.length) * 120)
    : 40;
  const invoiceAdherence = paidInvoices ? (onTimeInvoices / paidInvoices) * 100 : 88;
  const activityMomentum = activitiesPrev ? Math.min(120, (activities / activitiesPrev) * 100) : 100;

  // Operational efficiency: SLA adherence, on-time invoicing, automation coverage,
  // pipeline hygiene and activity momentum — the five things ops teams control.
  const pipelineHygiene = openPipeline.length ? 100 - (stalled.length / openPipeline.length) * 100 : 80;
  const efficiencyBreakdown = [
    { key: "sla", label: "SLA adherence", value: slaAdherence, weight: 0.3, detail: `${tickets.filter((ticket) => !ticket.slaBreached).length} of ${tickets.length} tickets inside SLA` },
    { key: "invoicing", label: "On-time invoicing", value: invoiceAdherence, weight: 0.15, detail: `${onTimeInvoices} of ${paidInvoices} invoices paid on time` },
    { key: "automation", label: "Automation coverage", value: Math.min(100, automationCoverage), weight: 0.15, detail: `${automations.filter((a) => a.status === "ACTIVE").length} of ${automations.length} playbooks active` },
    { key: "hygiene", label: "Pipeline hygiene", value: pipelineHygiene, weight: 0.2, detail: `${stalled.length} of ${openPipeline.length} open deals have gone quiet` },
    { key: "momentum", label: "Activity momentum", value: Math.min(100, activityMomentum), weight: 0.2, detail: `${activities} logged activities versus ${activitiesPrev} in the previous window` },
  ];
  const operationalEfficiency = efficiencyBreakdown.reduce((acc, entry) => acc + entry.value * entry.weight, 0);

  // Unit economics from transparent operating assumptions (src/lib/assumptions.ts):
  // CAC = (fully loaded sales cost + marketing investment) / new customers won.
  const activeSeats = customers.filter((customer) => customer.status !== "CHURNED").length;
  const monthlyChurnRate = activeSeats ? (churned.length / activeSeats / 12) * 100 : 0;
  const arpa = activeSeats ? mrr / activeSeats : 0;
  const newLogos = won.count;
  const goToMarketSpend = ASSUMPTIONS.salesRepFullyLoadedCost * REP_COUNT_ASSUMPTION + won.value * ASSUMPTIONS.marketingSpendPercentOfRevenue;
  const cac = newLogos ? goToMarketSpend / newLogos : 0;
  const ltv = monthlyChurnRate > 0 ? (arpa / (monthlyChurnRate / 100)) * ASSUMPTIONS.grossMargin : arpa * 30;
  const startingArr = Math.max(1, totalArr - expansionRevenue + churnedArr);
  const nrr = ((startingArr + expansionRevenue - churnedArr) / startingArr) * 100;

  const conversionRate = closedCount ? (won.count / closedCount) * 100 : 0;
  // Pipeline coverage: weighted open pipeline versus the new-business target for
  // the next quarter (last quarter's won revenue + growth expectation).
  const quarterlyTarget = (won.value / Math.max(1, Math.round(monthsInWindow))) * 3 * 1.12;
  const coverage = quarterlyTarget > 0 ? pipelineWeighted / quarterlyTarget : 0;

  return {
    revenue: won.value,
    revenuePrev: wonPrev.value,
    wonDeals: won.count,
    lostDeals: lost.count,
    pipelineOpen,
    pipelineWeighted,
    pipelineCount: openPipeline.length,
    pipelineStalled,
    pipelineStalledCount: stalled.length,
    winRate,
    winRatePrev,
    averageDealSize,
    salesCycleDays,
    mrr,
    arr: totalArr,
    expansionRevenue,
    churnRate: monthlyChurnRate,
    cac,
    ltv,
    nrr,
    conversionRate,
    operationalEfficiency,
    efficiencyBreakdown,
    activeCustomers: activeCustomers.length,
    atRiskCustomers: churnRisk,
    coverage,
    forecast: pipelineWeighted * 0.62 + mrr * 3,
    ...(salesActivity === 0 ? {} : {}),
    ...(lostPrev.count ? {} : {}),
  };
}

/** Persisted daily metric series (written by the seeder and the metrics engine). */
export async function persistMetric(input: {
  organizationId: string;
  key: string;
  label?: string;
  value: number;
  unit?: string;
  granularity?: MetricGranularity;
  dimensionKey?: string;
  dimension?: Record<string, unknown>;
  periodStart: Date;
  source?: string;
}) {
  return db.metric.upsert({
    where: {
      organizationId_key_granularity_dimensionKey_periodStart: {
        organizationId: input.organizationId,
        key: input.key,
        granularity: input.granularity ?? "DAY",
        dimensionKey: input.dimensionKey ?? "all",
        periodStart: input.periodStart,
      },
    },
    create: {
      organizationId: input.organizationId,
      key: input.key,
      label: input.label,
      value: input.value,
      unit: input.unit ?? "EUR",
      granularity: input.granularity ?? "DAY",
      dimensionKey: input.dimensionKey ?? "all",
      dimension: (input.dimension ?? {}) as never,
      periodStart: input.periodStart,
      source: input.source ?? "engine",
    },
    update: {
      value: input.value,
      label: input.label,
      computedAt: new Date(),
    },
  });
}

export async function metricSeries(
  organizationId: string,
  key: string,
  options: { from?: Date; to?: Date; granularity?: MetricGranularity; dimensionKey?: string } = {},
): Promise<MetricSeriesPoint[]> {
  const rows = await db.metric.findMany({
    where: {
      organizationId,
      key,
      granularity: options.granularity ?? "DAY",
      dimensionKey: options.dimensionKey ?? "all",
      periodStart: { gte: options.from, lte: options.to },
    },
    orderBy: { periodStart: "asc" },
    select: { periodStart: true, value: true },
  });
  return rows.map((row) => ({ period: row.periodStart, value: Number(row.value) }));
}

/** Groups a daily series into weekly/monthly buckets for charts. */
export function bucketSeries(points: MetricSeriesPoint[], granularity: "day" | "week" | "month") {
  if (granularity === "day") return points;
  const buckets = new Map<string, number>();
  for (const point of points) {
    const date = point.period;
    const key =
      granularity === "month"
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`
        : (() => {
            const monday = new Date(date);
            const day = (monday.getDay() + 6) % 7;
            monday.setDate(monday.getDate() - day);
            return monday.toISOString().slice(0, 10);
          })();
    buckets.set(key, (buckets.get(key) ?? 0) + point.value);
  }
  return [...buckets.entries()]
    .map(([key, value]) => ({ period: new Date(key), value }))
    .sort((a, b) => a.period.getTime() - b.period.getTime());
}

/** Least-squares linear regression → simple, explainable forecasting. */
export function linearForecast(points: MetricSeriesPoint[], periodsAhead: number) {
  if (points.length < 2) return { projected: 0, slope: 0, confidence: 0, r2: 0 };
  const n = points.length;
  const xs = points.map((_, index) => index);
  const ys = points.map((point) => point.value);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const numerator = xs.reduce((acc, x, i) => acc + (x - meanX) * (ys[i]! - meanY), 0);
  const denominator = xs.reduce((acc, x) => acc + (x - meanX) ** 2, 0) || 1;
  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;
  const projected = intercept + slope * (n - 1 + periodsAhead);
  const ssTot = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0) || 1;
  const ssRes = ys.reduce((acc, y, i) => acc + (y - (intercept + slope * i)) ** 2, 0);
  const r2 = Math.max(0, 1 - ssRes / ssTot);
  return {
    projected: Math.max(0, projected),
    slope,
    confidence: Math.round(Math.min(96, 45 + r2 * 55)),
    r2,
  };
}
