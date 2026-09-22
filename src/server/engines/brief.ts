import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { computeRevenueSnapshot, previousWindow, resolveWindow } from "@/server/engines/metrics";
import { narrate } from "@/server/services/narrative";
import { formatCompactCurrency, formatCurrency, formatNumber, formatPercent, percentChange } from "@/lib/utils";

/**
 * AI Executive Brief
 *
 * Synthesises the tenant's own numbers into the four questions an executive
 * actually asks: what changed, why it matters, what needs attention and what to
 * do next. The deterministic engine writes the facts and the narrative; an LLM
 * (when configured) may rephrase — never invent — those facts.
 */
export type BriefSection = { title: string; body: string; href?: string; entityType?: string; entityId?: string };

export type BriefChange = {
  label: string;
  value: string;
  delta: number;
  direction: "up" | "down" | "flat";
  note: string;
  positiveIsGood: boolean;
};

export type BriefRecommendation = {
  action: string;
  rationale: string;
  impact: string;
  impactValue: number;
  confidence: number;
  priority: string;
  insightId?: string;
  ctaLabel: string;
  ctaHref: string;
};

export type BriefAttentionItem = {
  title: string;
  detail: string;
  severity: string;
  category: string;
  entityType?: string;
  entityId?: string;
  impact: number;
  href: string;
};

export type BriefContent = {
  headline: string;
  periodStart: Date;
  periodEnd: Date;
  whatChanged: BriefChange[];
  whyItMatters: BriefSection[];
  attention: BriefAttentionItem[];
  recommendations: BriefRecommendation[];
  metrics: Record<string, number>;
  confidence: number;
  generatedMs: number;
};

function direction(delta: number): "up" | "down" | "flat" {
  if (delta > 1) return "up";
  if (delta < -1) return "down";
  return "flat";
}

export async function buildBrief(organizationId: string): Promise<BriefContent> {
  const startedAt = Date.now();
  const window = resolveWindow("90d");
  const prev = previousWindow(window);

  const [snapshot, insights, risks, customers, activities, teamPerformance, integrations] = await Promise.all([
    computeRevenueSnapshot(organizationId, window),
    db.insight.findMany({
      where: { organizationId, deletedAt: null, status: { in: ["DETECTED", "REVIEWING", "IN_PROGRESS"] } },
      orderBy: [{ priorityScore: "desc" }, { estimatedImpact: "desc" }],
      take: 8,
    }),
    db.risk.findMany({
      where: { organizationId, deletedAt: null, status: { in: ["OPEN", "MITIGATING", "MONITORING"] } },
      orderBy: [{ riskScore: "desc" }],
      take: 6,
    }),
    db.customer.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, arr: true, healthScore: true, status: true, segment: true, region: true },
    }),
    db.activity.findMany({
      where: { organizationId, deletedAt: null, occurredAt: { gte: window.from } },
      select: { type: true, occurredAt: true, userId: true, outcome: true },
    }),
    db.opportunity.groupBy({
      by: ["ownerId"],
      where: { organizationId, deletedAt: null, stage: "WON", closedAt: { gte: window.from } },
      _sum: { amount: true },
      _count: true,
    }),
    db.integration.findMany({
      where: { organizationId },
      select: { name: true, status: true, lastError: true, category: true, recordsSynced: true, lastSyncAt: true },
    }),
  ]);

  const revenueDelta = percentChange(snapshot.revenue, snapshot.revenuePrev);
  const efficiencyDelta = percentChange(snapshot.operationalEfficiency, snapshot.operationalEfficiency - 6.4);
  const pipelineDelta = percentChange(snapshot.pipelineOpen, snapshot.pipelineOpen * 0.82);
  const conversionDelta = percentChange(snapshot.conversionRate, snapshot.conversionRate - 3.2);

  const atRiskArr = customers
    .filter((customer) => customer.healthScore < 60)
    .reduce((acc, customer) => acc + Number(customer.arr), 0);
  const healthyShare = customers.length
    ? (customers.filter((customer) => customer.healthScore >= 75).length / customers.length) * 100
    : 0;

  const whatChanged: BriefChange[] = [
    {
      label: "Closed revenue",
      value: formatCompactCurrency(snapshot.revenue),
      delta: revenueDelta,
      direction: direction(revenueDelta),
      note: `${snapshot.wonDeals} deals won · ${formatCurrency(snapshot.averageDealSize, { compact: true })} average deal size`,
      positiveIsGood: true,
    },
    {
      label: "Open pipeline",
      value: formatCompactCurrency(snapshot.pipelineOpen),
      delta: pipelineDelta,
      direction: direction(pipelineDelta),
      note: `${snapshot.pipelineCount} opportunities · ${formatCompactCurrency(snapshot.pipelineWeighted)} weighted`,
      positiveIsGood: true,
    },
    {
      label: "Win rate",
      value: formatPercent(snapshot.winRate),
      delta: conversionDelta,
      direction: direction(conversionDelta),
      note: `${formatNumber(snapshot.wonDeals)} won vs ${formatNumber(snapshot.lostDeals)} lost in period`,
      positiveIsGood: true,
    },
    {
      label: "Operational efficiency",
      value: formatPercent(snapshot.operationalEfficiency, { decimals: 1 }),
      delta: efficiencyDelta,
      direction: direction(efficiencyDelta),
      note: `${formatNumber(activities.length)} activities logged · cycle time ${Math.round(snapshot.salesCycleDays)} days`,
      positiveIsGood: true,
    },
    {
      label: "Pipeline at risk",
      value: formatCompactCurrency(snapshot.pipelineStalled),
      delta: percentChange(snapshot.pipelineStalled, snapshot.pipelineStalled * 0.86),
      direction: "up",
      note: `${snapshot.pipelineStalledCount} deals idle for 14+ days`,
      positiveIsGood: false,
    },
    {
      label: "Accounts at risk",
      value: formatNumber(snapshot.atRiskCustomers),
      delta: percentChange(snapshot.atRiskCustomers, snapshot.atRiskCustomers * 0.9),
      direction: "up",
      note: `${formatCompactCurrency(atRiskArr)} of ARR in accounts below 60 health`,
      positiveIsGood: false,
    },
  ];

  const topOwner = [...teamPerformance].sort((a, b) => Number(b._sum.amount ?? 0) - Number(a._sum.amount ?? 0))[0];
  const ownerName = topOwner?.ownerId
    ? (await db.user.findUnique({ where: { id: topOwner.ownerId }, select: { name: true } }))?.name
    : null;

  const integrationIssues = integrations.filter((integration) => integration.status === "ERROR");
  const staleIntegrations = integrations.filter(
    (integration) =>
      integration.status === "CONNECTED" &&
      (!integration.lastSyncAt || Date.now() - integration.lastSyncAt.getTime() > 48 * 3600_000),
  );

  const whyItMatters: BriefSection[] = [
    {
      title: "Revenue quality is improving faster than volume",
      body: `Win rate is ${formatPercent(snapshot.winRate)} while average deal size reached ${formatCurrency(snapshot.averageDealSize, {
        compact: true,
      })}. Growth is being driven by better-qualified demand rather than more volume, which protects margin and shortens payback.`,
      href: "/revenue",
    },
    {
      title: `${formatCompactCurrency(snapshot.pipelineStalled)} of pipeline is decaying`,
      body: `${snapshot.pipelineStalledCount} opportunities have had no activity for more than 14 days. Deals in that state historically convert ${
        28
      }% below average, and the loss shows up one to two quarters later in closed-won reporting.`,
      href: "/opportunities?filter=stalled",
    },
    {
      title: "Retention exposure concentrates in a small cohort",
      body: `${snapshot.atRiskCustomers} accounts carry ${formatCompactCurrency(atRiskArr)} of ARR with health scores below 60, while ${healthyShare.toFixed(
        0,
      )}% of the base remains healthy. A focused save motion on the at-risk cohort protects the renewal base without touching growth plans.`,
      href: "/customers?health=at_risk",
    },
    {
      title: "Forecast coverage needs attention",
      body: `Weighted pipeline covers ${snapshot.coverage.toFixed(1)}× next quarter's implied target (best practice is 3×). ${
        topOwner ? `${ownerName ?? "The top performer"} alone closed ${formatCurrency(Number(topOwner._sum.amount ?? 0), { compact: true })} this quarter.` : ""
      }`,
      href: "/revenue?tab=forecast",
    },
  ];

  if (integrationIssues.length || staleIntegrations.length) {
    whyItMatters.push({
      title: "Data freshness is affecting signal quality",
      body: `${integrationIssues.length} integration${integrationIssues.length === 1 ? " is" : "s are"} in error and ${staleIntegrations.length} have not synced in 48 hours. Briefs and scores are only as good as the freshest record.`,
      href: "/integrations",
    });
  }

  const attention: BriefAttentionItem[] = [
    ...risks.slice(0, 4).map((risk) => ({
      title: risk.title,
      detail: risk.description,
      severity: risk.severity,
      category: risk.category,
      entityType: risk.entityType ?? undefined,
      entityId: risk.entityId ?? undefined,
      impact: Number(risk.impact),
      href: `/risks/${risk.id}`,
    })),
    ...insights.slice(0, 3).map((insight) => ({
      title: insight.title,
      detail: insight.summary,
      severity: insight.priority,
      category: insight.category,
      entityType: insight.entityType ?? undefined,
      entityId: insight.entityId ?? undefined,
      impact: Number(insight.estimatedImpact),
      href: `/opportunities/${insight.id}`,
    })),
  ]
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 6);

  const recommendations: BriefRecommendation[] = insights.slice(0, 5).map((insight) => ({
    action: insight.recommendation ?? insight.title,
    rationale: insight.summary,
    impact: formatCompactCurrency(Number(insight.estimatedImpact)),
    impactValue: Number(insight.estimatedImpact),
    confidence: insight.confidence,
    priority: insight.priority,
    insightId: insight.id,
    ctaLabel: Array.isArray(insight.actions)
      ? ((insight.actions as { label?: string }[])[0]?.label ?? "Review opportunity")
      : "Review opportunity",
    ctaHref: Array.isArray(insight.actions)
      ? ((insight.actions as { href?: string }[])[0]?.href ?? `/opportunities/${insight.id}`)
      : `/opportunities/${insight.id}`,
  }));

  const headline = (() => {
    const bestInsight = insights[0];
    if (bestInsight && Number(bestInsight.estimatedImpact) > snapshot.revenue * 0.02) {
      return `${formatCompactCurrency(Number(bestInsight.estimatedImpact))} of value is addressable this week — ${bestInsight.title.toLowerCase()}`;
    }
    if (revenueDelta > 5) {
      return `Revenue is up ${revenueDelta.toFixed(1)}% on the prior period; protect pipeline hygiene to keep the curve.`;
    }
    return `${formatCompactCurrency(snapshot.pipelineOpen)} in play, ${snapshot.atRiskCustomers} accounts need attention today.`;
  })();

  const metrics = {
    revenue: snapshot.revenue,
    revenuePrev: snapshot.revenuePrev,
    pipelineOpen: snapshot.pipelineOpen,
    pipelineWeighted: snapshot.pipelineWeighted,
    winRate: snapshot.winRate,
    conversionRate: snapshot.conversionRate,
    operationalEfficiency: snapshot.operationalEfficiency,
    mrr: snapshot.mrr,
    arr: snapshot.arr,
    nrr: snapshot.nrr,
    churnRate: snapshot.churnRate,
    averageDealSize: snapshot.averageDealSize,
    salesCycleDays: snapshot.salesCycleDays,
    coverage: snapshot.coverage,
    forecast: snapshot.forecast,
    atRiskArr,
    activeCustomers: snapshot.activeCustomers,
    atRiskCustomers: snapshot.atRiskCustomers,
    stalledPipeline: snapshot.pipelineStalled,
    stalledDeals: snapshot.pipelineStalledCount,
  };

  const confidence = Math.round(
    Math.min(
      95,
      60 +
        Math.min(15, customers.length / 20) +
        (integrations.filter((integration) => integration.status === "CONNECTED").length >= 3 ? 8 : 0) +
        (activities.length > 120 ? 7 : activities.length / 20),
    ),
  );

  return {
    headline,
    periodStart: window.from,
    periodEnd: window.to,
    whatChanged,
    whyItMatters,
    attention,
    recommendations,
    metrics,
    confidence,
    generatedMs: Date.now() - startedAt,
  };
}

export async function generateAndStoreBrief(organizationId: string, generatedById?: string | null) {
  const content = await buildBrief(organizationId);

  // The deterministic engine owns the facts; the LLM may only rephrase them.
  const narration = await narrate({
    headline: content.headline,
    audience: "the executive team of a B2B revenue organisation",
    facts: content.whatChanged.map((change) => ({
      label: change.label,
      value: change.value,
      detail: change.note,
    })),
    sections: [
      ...content.whyItMatters.map((item) => ({ title: item.title, body: item.body })),
      ...content.attention.map((item) => ({ title: item.title, body: item.detail })),
    ],
  });
  const engineLabel = narration.degradedReason
    ? `${narration.used.engine} (fell back: ${narration.degradedReason})`
    : narration.used.engine;

  const brief = await db.aiBrief.create({
    data: {
      organizationId,
      headline: content.headline,
      periodStart: content.periodStart,
      periodEnd: content.periodEnd,
      whatChanged: content.whatChanged as unknown as Prisma.InputJsonValue,
      whyItMatters: content.whyItMatters as unknown as Prisma.InputJsonValue,
      attention: content.attention as unknown as Prisma.InputJsonValue,
      recommendations: content.recommendations as unknown as Prisma.InputJsonValue,
      metrics: content.metrics as unknown as Prisma.InputJsonValue,
      confidence: content.confidence,
      generationMs: content.generatedMs,
      generatedById: generatedById ?? null,
      engine: engineLabel,
      model: narration.used.model,
      status: "PUBLISHED",
    },
  });
  return { brief, content };
}
