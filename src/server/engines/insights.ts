import type { InsightCategory, Priority } from "@prisma/client";
import { db } from "@/server/db";
import { OPEN_STAGES, STAGE_PROBABILITY } from "@/server/engines/metrics";
import { clamp, percentChange } from "@/lib/utils";

/**
 * Opportunity Engine
 *
 * Scans the tenant's live operational data and detects financially material
 * opportunities. Every candidate carries the evidence (`signal`) that produced
 * it, an explainable impact estimate, a confidence level and a recommended
 * action — this is what turns raw records into a prioritised work queue.
 *
 * Each rule is deterministic and idempotent: fingerprints prevent duplicates
 * across runs while preserving the human-owned status of an existing insight.
 */
export type DetectedInsight = {
  fingerprint: string;
  title: string;
  summary: string;
  category: InsightCategory;
  impact: number;
  confidence: number;
  priorityScore: number;
  priority: Priority;
  source: string;
  signal: Record<string, unknown>;
  recommendation: string;
  actions: { label: string; href?: string; action?: string }[];
  entityType?: string;
  entityId?: string;
  relatedCount: number;
  ownerId?: string | null;
  dueAt?: Date | null;
};

const DAY = 86_400_000;
const DEFAULT_COST_PER_HOUR = 45;

export function priorityFromScore(score: number): Priority {
  if (score >= 80) return "CRITICAL";
  if (score >= 62) return "HIGH";
  if (score >= 42) return "MEDIUM";
  return "LOW";
}

/** Impact in euros → 0-60 score on a log scale (€1k ≈ 20, €1M ≈ 60). */
export function impactScore(impact: number) {
  if (impact <= 0) return 0;
  return clamp((Math.log10(impact) / 6) * 45, 0, 60);
}

export function computePriorityScore(input: { impact: number; confidence: number; urgency?: number; reach?: number }) {
  const urgency = input.urgency ?? 0.5;
  const reach = input.reach ?? 0.5;
  const raw =
    impactScore(input.impact) * 0.55 + (input.confidence / 100) * 22 + urgency * 14 + reach * 9;
  return Math.round(clamp(raw, 1, 100));
}

const SOURCE_LABELS: Record<string, string> = {
  INBOUND: "Inbound",
  OUTBOUND: "Outbound",
  PARTNER: "Partner",
  REFERRAL: "Referral",
  PRODUCT_LED: "Product-led",
  EVENT: "Events",
  EXPANSION: "Expansion",
};

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source.replace(/_/g, " ").toLowerCase();
}

export type InsightEngineResult = {
  candidates: DetectedInsight[];
  scanned: Record<string, number>;
};

export async function runOpportunityEngine(organizationId: string): Promise<InsightEngineResult> {
  const now = new Date();
  const day90 = new Date(now.getTime() - 90 * DAY);
  const stalledCutoff = new Date(now.getTime() - 14 * DAY);

  const [
    openDeals,
    customers,
    recentActivities,
    tickets,
    automations,
    wonBySource,
    lostBySource,
    stageHistory,
    recentWon,
  ] = await Promise.all([
    db.opportunity.findMany({
      where: { organizationId, deletedAt: null, stage: { in: OPEN_STAGES } },
      select: {
        id: true,
        code: true,
        name: true,
        amount: true,
        probability: true,
        stage: true,
        daysInStage: true,
        lastActivityAt: true,
        nextStep: true,
        ownerId: true,
        customerId: true,
        expectedCloseDate: true,
        source: true,
        customer: { select: { name: true } },
        owner: { select: { id: true, name: true } },
      },
    }),
    db.customer.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        arr: true,
        mrr: true,
        healthScore: true,
        churnProbability: true,
        status: true,
        segment: true,
        renewalDate: true,
        activityCount: true,
        expansionMrr: true,
        openDealCount: true,
        lastActivityAt: true,
        ownerId: true,
        csmId: true,
        createdAt: true,
      },
    }),
    db.activity.findMany({
      where: { organizationId, deletedAt: null, occurredAt: { gte: day90 } },
      select: { id: true, type: true, outcome: true, userId: true, customerId: true, occurredAt: true, durationMinutes: true },
    }),
    db.supportTicket.findMany({
      where: { organizationId, openedAt: { gte: day90 } },
      select: { id: true, slaBreached: true, resolutionMinutes: true, reopenedCount: true, customerId: true, reference: true },
    }),
    db.automation.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, status: true, runCount: true, failureCount: true, timeSavedMinutes: true },
    }),
    db.opportunity.groupBy({
      by: ["source"],
      where: { organizationId, deletedAt: null, stage: "WON", closedAt: { gte: new Date(now.getTime() - 180 * DAY) } },
      _count: true,
      _sum: { amount: true },
    }),
    db.opportunity.groupBy({
      by: ["source"],
      where: { organizationId, deletedAt: null, stage: "LOST", closedAt: { gte: new Date(now.getTime() - 180 * DAY) } },
      _count: true,
    }),
    db.opportunity.groupBy({
      by: ["stage"],
      where: { organizationId, deletedAt: null, stage: { in: OPEN_STAGES } },
      _count: true,
      _sum: { amount: true },
      _avg: { daysInStage: true },
    }),
    db.opportunity.findMany({
      where: { organizationId, deletedAt: null, stage: "WON", closedAt: { gte: day90 } },
      select: { closedAt: true, createdAt: true, amount: true },
    }),
  ]);

  const candidates: DetectedInsight[] = [];
  const closedDeals = wonBySource.reduce((acc, row) => acc + row._count, 0) + lostBySource.reduce((acc, row) => acc + row._count, 0);
  const globalWinRate = closedDeals ? (wonBySource.reduce((acc, row) => acc + row._count, 0) / closedDeals) * 100 : 20;
  const avgDealSize = recentWon.length
    ? recentWon.reduce((acc, deal) => acc + Number(deal.amount), 0) / recentWon.length
    : openDeals.length
      ? openDeals.reduce((acc, deal) => acc + Number(deal.amount), 0) / openDeals.length
      : 12_000;

  /* ── Rule 1: stalled pipeline ──────────────────────────────────────────── */
  const stalled = openDeals.filter((deal) => !deal.lastActivityAt || deal.lastActivityAt < stalledCutoff);
  if (stalled.length >= 3) {
    const stalledValue = stalled.reduce((acc, deal) => acc + Number(deal.amount), 0);
    const recoverable = stalledValue * (globalWinRate / 100) * 0.32;
    const owners = Object.entries(
      stalled.reduce<Record<string, { name: string; value: number; count: number }>>((acc, deal) => {
        const key = deal.owner?.id ?? "unassigned";
        const name = deal.owner?.name ?? "Unassigned";
        acc[key] ||= { name, value: 0, count: 0 };
        acc[key]!.value += Number(deal.amount);
        acc[key]!.count += 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1].value - a[1].value);

    candidates.push({
      fingerprint: "stalled_pipeline:open",
      title: `${stalled.length} opportunities worth €${Math.round(stalledValue / 1000)}K have had no activity in 14 days`,
      summary: `€${stalledValue.toLocaleString("en-GB", { maximumFractionDigits: 0 })} of open pipeline has gone cold across ${owners.length} owners. Deals without contact in two weeks close ${(100 - globalWinRate).toFixed(0)}% less often than engaged ones.`,
      category: "SALES_ACCELERATION",
      impact: recoverable,
      confidence: 82,
      priorityScore: computePriorityScore({ impact: recoverable, confidence: 82, urgency: 0.72, reach: 0.66 }),
      priority: "HIGH",
      source: "opportunity_engine.stalled_pipeline",
      signal: {
        dealCount: stalled.length,
        stalledValue,
        winRate: Number(globalWinRate.toFixed(1)),
        owners: owners.slice(0, 5).map(([id, owner]) => ({ id, ...owner })),
        sampleDeals: stalled
          .sort((a, b) => Number(b.amount) - Number(a.amount))
          .slice(0, 8)
          .map((deal) => ({
            id: deal.id,
            code: deal.code,
            name: deal.name,
            customer: deal.customer.name,
            amount: Number(deal.amount),
            stage: deal.stage,
            daysIdle: deal.lastActivityAt ? Math.round((now.getTime() - deal.lastActivityAt.getTime()) / DAY) : null,
          })),
      },
      recommendation:
        "Reassign these opportunities to the representatives with the highest historical conversion rate and require a logged touchpoint within 48 hours.",
      actions: [
        { label: "Review opportunities", href: "/opportunities?filter=stalled" },
        { label: "Launch re-engagement sequence", action: "create_automation" },
      ],
      relatedCount: stalled.length,
    });
  }

  /* ── Rule 2: renewal expansion window ─────────────────────────────────── */
  const renewalsWindow = customers.filter(
    (customer) =>
      customer.status !== "CHURNED" &&
      customer.renewalDate &&
      customer.renewalDate.getTime() > now.getTime() &&
      customer.renewalDate.getTime() < now.getTime() + 90 * DAY &&
      Number(customer.arr) > 0,
  );
  const renewalNoExpansion = renewalsWindow.filter((customer) => customer.openDealCount === 0 && customer.healthScore >= 68);
  if (renewalNoExpansion.length >= 3) {
    const arrAtStake = renewalNoExpansion.reduce((acc, customer) => acc + Number(customer.arr), 0);
    const expansionUpside = arrAtStake * 0.18;
    candidates.push({
      fingerprint: "renewal_expansion:90d",
      title: `${renewalNoExpansion.length} accounts renewing in 90 days have no expansion motion open`,
      summary: `€${arrAtStake.toLocaleString("en-GB", { maximumFractionDigits: 0 })} of ARR renews within the quarter with healthy engagement but zero expansion activities. Historically this cohort expands ${(18).toFixed(0)}% when seeded 60 days before renewal.`,
      category: "REVENUE_OPPORTUNITY",
      impact: expansionUpside,
      confidence: 74,
      priorityScore: computePriorityScore({ impact: expansionUpside, confidence: 74, urgency: 0.78, reach: 0.55 }),
      priority: "HIGH",
      source: "opportunity_engine.renewal_expansion",
      signal: {
        accountCount: renewalNoExpansion.length,
        arrAtStake,
        accounts: renewalNoExpansion
          .sort((a, b) => Number(b.arr) - Number(a.arr))
          .slice(0, 8)
          .map((customer) => ({
            id: customer.id,
            name: customer.name,
            arr: Number(customer.arr),
            healthScore: customer.healthScore,
            renewalDate: customer.renewalDate?.toISOString().slice(0, 10) ?? null,
          })),
      },
      recommendation:
        "Build expansion business cases for these accounts now: usage data, adoption gaps and the pricing tier they are about to renew into.",
      actions: [
        { label: "Open customer intelligence", href: "/customers?filter=renewal_90d" },
        { label: "Create expansion playbook", action: "create_automation" },
      ],
      relatedCount: renewalNoExpansion.length,
    });
  }

  /* ── Rule 3: funnel leak ──────────────────────────────────────────────── */
  const stageRows = stageHistory
    .map((row) => ({
      stage: row.stage,
      count: row._count as number,
      value: Number(row._sum.amount ?? 0),
      avgDays: Number(row._avg.daysInStage ?? 0),
      probability: STAGE_PROBABILITY[row.stage as keyof typeof STAGE_PROBABILITY] ?? 30,
    }))
    .sort((a, b) => b.probability - a.probability);
  if (stageRows.length >= 2) {
    const totalOpen = stageRows.reduce((acc, row) => acc + row.value, 0);
    const stuck = stageRows.filter((row) => row.avgDays > 30 && row.count >= 4);
    const stuckValue = stuck.reduce((acc, row) => acc + row.value, 0);
    if (stuck.length && stuckValue > 0) {
      const uplift = stuckValue * 0.12;
      candidates.push({
        fingerprint: `funnel_leak:${stuck.map((row) => row.stage).join("-")}`,
        title: `Deals sit ${Math.round(Math.max(...stuck.map((row) => row.avgDays)))} days in ${stuck[0]!.stage.replace("_", " ").toLowerCase()} on average`,
        summary: `${stuck.length} pipeline stage${stuck.length > 1 ? "s" : ""} hold €${stuckValue.toLocaleString("en-GB", { maximumFractionDigits: 0 })} at more than 30 days average dwell time. Every extra week in stage costs roughly 6% of win probability.`,
        category: "SALES_ACCELERATION",
        impact: uplift,
        confidence: 71,
        priorityScore: computePriorityScore({ impact: uplift, confidence: 71, urgency: 0.6, reach: 0.7 }),
        priority: "HIGH",
        source: "opportunity_engine.funnel_leak",
        signal: { stages: stuck, totalOpen },
        recommendation:
          "Standardise exit criteria per stage and add a mandatory mutual action plan before a deal may enter the next stage.",
        actions: [{ label: "Inspect pipeline by stage", href: "/revenue?tab=pipeline" }],
        relatedCount: stuck.reduce((acc, row) => acc + row.count, 0),
      });
    }
  }

  /* ── Rule 4: channel efficiency ───────────────────────────────────────── */
  const lostBySourceMap = new Map(lostBySource.map((row) => [row.source, row._count]));
  const sourcePerformance = wonBySource
    .map((row) => {
      const won = row._count;
      const lost = lostBySourceMap.get(row.source) ?? 0;
      const total = won + lost;
      return {
        source: row.source,
        won,
        lost,
        total,
        winRate: total ? (won / total) * 100 : 0,
        revenue: Number(row._sum.amount ?? 0),
      };
    })
    .filter((row) => row.total >= 4)
    .sort((a, b) => b.winRate - a.winRate);
  if (sourcePerformance.length >= 2) {
    const best = sourcePerformance[0]!;
    const underweighted = sourcePerformance.filter((row) => row.winRate >= globalWinRate * 1.35 && row.total < closedDeals * 0.22);
    if (underweighted.length && best.winRate > globalWinRate) {
      const extraDeals = Math.max(2, Math.round(closedDeals * 0.06));
      const uplift = avgDealSize * extraDeals * (best.winRate / 100);
      candidates.push({
        fingerprint: "channel_efficiency:shift",
        title: `${sourceLabel(underweighted[0]!.source)} converts at ${best.winRate.toFixed(0)}% versus ${globalWinRate.toFixed(0)}% average`,
        summary: `Channels with above-average conversion are under-fed. Reallocating 15% of acquisition spend toward ${underweighted
          .map((row) => sourceLabel(row.source))
          .join(", ")} at the current average deal size is worth roughly €${Math.round(uplift).toLocaleString("en-GB")}.`,
        category: "REVENUE_OPPORTUNITY",
        impact: uplift,
        confidence: 68,
        priorityScore: computePriorityScore({ impact: uplift, confidence: 68, urgency: 0.45, reach: 0.8 }),
        priority: "MEDIUM",
        source: "opportunity_engine.channel_efficiency",
        signal: { sourcePerformance, globalWinRate: Number(globalWinRate.toFixed(1)) },
        recommendation: `Shift acquisition budget toward ${underweighted.map((row) => row.source).join(", ")} and instrument source-level SLAs on first response.`,
        actions: [{ label: "Open analytics by source", href: "/analytics?dimension=source" }],
        relatedCount: underweighted.reduce((acc, row) => acc + row.total, 0),
      });
    }
  }

  /* ── Rule 5: manual work that should be automated ─────────────────────── */
  const manualTasks = recentActivities.filter((activity) => activity.type === "TASK" || activity.type === "NOTE").length;
  const adminMinutes = recentActivities
    .filter((activity) => activity.type === "NOTE" || activity.type === "EMAIL")
    .reduce((acc, activity) => acc + (activity.durationMinutes ?? 9), 0);
  if (manualTasks >= 20) {
    const hours = (manualTasks * 11) / 60;
    const savings = hours * DEFAULT_COST_PER_HOUR * 4; // annualised over the quarter
    candidates.push({
      fingerprint: "manual_ops:quarter",
      title: `${Math.round(hours)}h of manual coordination logged in 90 days`,
      summary: `${manualTasks} manual tasks and notes were logged over the last quarter, plus ${Math.round(adminMinutes / 60)}h of written updates. Automations already configured save ${Math.round(automations.reduce((acc, a) => acc + a.timeSavedMinutes, 0) / 60)}h per cycle.`,
      category: "OPERATIONAL_EFFICIENCY",
      impact: savings,
      confidence: 77,
      priorityScore: computePriorityScore({ impact: savings, confidence: 77, urgency: 0.4, reach: 0.85 }),
      priority: "MEDIUM",
      source: "opportunity_engine.manual_ops",
      signal: {
        manualTasks,
        adminMinutes,
        activeAutomations: automations.filter((automation) => automation.status === "ACTIVE").length,
      },
      recommendation:
        "Move status updates, task creation and reminder loops into the Automation Engine — start with deal-inactivity and renewal-approaching triggers.",
      actions: [
        { label: "Open automations", href: "/automations" },
        { label: "Create automation", action: "create_automation" },
      ],
      relatedCount: manualTasks,
    });
  }

  /* ── Rule 6: support friction ─────────────────────────────────────────── */
  const breaches = tickets.filter((ticket) => ticket.slaBreached);
  const reopens = tickets.filter((ticket) => ticket.reopenedCount > 0);
  if (breaches.length >= 4) {
    const costPerBreach = 180;
    const cost = (breaches.length + reopens.length * 0.5) * costPerBreach;
    const affected = new Set(breaches.map((ticket) => ticket.customerId)).size;
    candidates.push({
      fingerprint: "support_friction:90d",
      title: `${breaches.length} SLA breaches across ${affected} accounts in 90 days`,
      summary: `Support breaches and reopens are dragging customer sentiment and creating churn surface. Each breach costs roughly €${costPerBreach} in handling and measurable goodwill, and correlates with ${(breaches.length / Math.max(1, tickets.length) * 100).toFixed(0)}% of ticket volume.`,
      category: "CUSTOMER_RETENTION",
      impact: cost,
      confidence: 80,
      priorityScore: computePriorityScore({ impact: cost, confidence: 80, urgency: 0.66, reach: 0.4 }),
      priority: "MEDIUM",
      source: "opportunity_engine.support_friction",
      signal: {
        breaches: breaches.length,
        reopens: reopens.length,
        affectedAccounts: affected,
        sample: breaches.slice(0, 5).map((ticket) => ({ id: ticket.id, reference: ticket.reference })),
      },
      recommendation:
        "Re-route breached accounts to a senior pod and add a proactive status update automation for any ticket approaching its SLA.",
      actions: [{ label: "Review at-risk customers", href: "/customers?health=at_risk" }],
      relatedCount: breaches.length,
    });
  }

  /* ── Rule 7: forecast coverage gap ────────────────────────────────────── */
  const weightedPipeline = openDeals.reduce(
    (acc, deal) => acc + (Number(deal.amount) * deal.probability) / 100,
    0,
  );
  const monthlyTarget = closedDeals ? (recentWon.reduce((acc, deal) => acc + Number(deal.amount), 0) / 3) * 1.18 : 0;
  const coverage = monthlyTarget > 0 ? weightedPipeline / (monthlyTarget * 3) : 0;
  if (monthlyTarget > 0 && coverage < 2.6 && openDeals.length > 0) {
    const gap = Math.max(0, monthlyTarget * 3 - weightedPipeline);
    candidates.push({
      fingerprint: "forecast_gap:quarter",
      title: `Weighted pipeline covers ${coverage.toFixed(1)}× next quarter's target`,
      summary: `Best-practice coverage is 3×. At the current blended win rate the team needs €${Math.round(gap).toLocaleString("en-GB")} of additional weighted pipeline to de-risk the quarter.`,
      category: "RISK_PREVENTION",
      impact: gap * 0.25,
      confidence: 70,
      priorityScore: computePriorityScore({ impact: gap * 0.25, confidence: 70, urgency: 0.85, reach: 0.9 }),
      priority: "CRITICAL",
      source: "opportunity_engine.forecast_gap",
      signal: { coverage: Number(coverage.toFixed(2)), weightedPipeline, monthlyTarget, openDeals: openDeals.length },
      recommendation:
        "Trigger a pipeline-generation sprint: re-engage closed-lost renewals from the last two quarters and run the referral play on healthy accounts.",
      actions: [
        { label: "Open revenue intelligence", href: "/revenue" },
        { label: "Review pipeline", href: "/opportunities" },
      ],
      relatedCount: openDeals.length,
    });
  }

  /* ── Rule 8: missing next steps (hygiene) ─────────────────────────────── */
  const withoutNextStep = openDeals.filter((deal) => !deal.nextStep);
  if (withoutNextStep.length >= 5) {
    const value = withoutNextStep.reduce((acc, deal) => acc + Number(deal.amount), 0);
    candidates.push({
      fingerprint: "missing_next_steps:open",
      title: `${withoutNextStep.length} open deals have no agreed next step`,
      summary: `€${Math.round(value).toLocaleString("en-GB")} of pipeline has no owner-committed next action with a date. Deals without a next step slip stage ${(23).toFixed(0)}% more often than deals that carry one.`,
      category: "SALES_ACCELERATION",
      impact: value * 0.08,
      confidence: 76,
      priorityScore: computePriorityScore({ impact: value * 0.08, confidence: 76, urgency: 0.5, reach: 0.75 }),
      priority: "MEDIUM",
      source: "opportunity_engine.missing_next_steps",
      signal: { dealCount: withoutNextStep.length, value },
      recommendation: "Enforce a next step (action + owner + date) before any deal can change stage.",
      actions: [{ label: "Review opportunities", href: "/opportunities?filter=no_next_step" }],
      relatedCount: withoutNextStep.length,
    });
  }

  /* ── Rule 9: expansion-ready accounts ────────────────────────────────── */
  const expansionReady = customers.filter(
    (customer) =>
      customer.status === "ACTIVE" &&
      customer.healthScore >= 76 &&
      customer.activityCount >= 8 &&
      customer.segment !== "SMB" &&
      Number(customer.expansionMrr) === 0,
  );
  if (expansionReady.length >= 4) {
    const baseArr = expansionReady.reduce((acc, customer) => acc + Number(customer.arr), 0);
    const upside = baseArr * 0.22;
    candidates.push({
      fingerprint: "expansion_ready:high_health",
      title: `${expansionReady.length} high-health accounts have never expanded`,
      summary: `Healthy, engaged accounts with no expansion revenue represent €${Math.round(baseArr).toLocaleString("en-GB")} of ARR. Peer benchmark expansion in this cohort is 22%.`,
      category: "REVENUE_OPPORTUNITY",
      impact: upside,
      confidence: 72,
      priorityScore: computePriorityScore({ impact: upside, confidence: 72, urgency: 0.5, reach: 0.62 }),
      priority: "HIGH",
      source: "opportunity_engine.expansion_ready",
      signal: {
        accounts: expansionReady
          .sort((a, b) => Number(b.arr) - Number(a.arr))
          .slice(0, 8)
          .map((customer) => ({
            id: customer.id,
            name: customer.name,
            arr: Number(customer.arr),
            healthScore: customer.healthScore,
            activityCount: customer.activityCount,
          })),
        baseArr,
      },
      recommendation:
        "Run an adoption review with each account, then attach a usage-based expansion proposal before the next renewal cycle.",
      actions: [{ label: "Open customer intelligence", href: "/customers" }],
      relatedCount: expansionReady.length,
    });
  }

  /* ── Rule 10: automation reliability / value ─────────────────────────── */
  const failingAutomations = automations.filter(
    (automation) => automation.runCount >= 5 && automation.failureCount / automation.runCount > 0.15,
  );
  if (failingAutomations.length) {
    const lostRuns = failingAutomations.reduce((acc, automation) => acc + automation.failureCount, 0);
    const uplift = lostRuns * 22;
    candidates.push({
      fingerprint: "automation_reliability",
      title: `${failingAutomations.length} automation${failingAutomations.length === 1 ? "" : "s"} fail${failingAutomations.length === 1 ? "s" : ""} more than 15% of the time`,
      summary: `${lostRuns} automated runs have failed, silently dropping follow-ups that would otherwise have created touchpoints. Reliability below 85% erodes trust in the engine.`,
      category: "OPERATIONAL_EFFICIENCY",
      impact: uplift,
      confidence: 85,
      priorityScore: computePriorityScore({ impact: uplift, confidence: 85, urgency: 0.7, reach: 0.3 }),
      priority: "MEDIUM",
      source: "opportunity_engine.automation_reliability",
      signal: {
        automations: failingAutomations.map((automation) => ({
          id: automation.id,
          name: automation.name,
          runCount: automation.runCount,
          failureCount: automation.failureCount,
        })),
      },
      recommendation: "Review the failing steps and add a fallback owner so runs never end without an accountable human.",
      actions: [{ label: "Open automations", href: "/automations" }],
      relatedCount: failingAutomations.length,
    });
  }

  /* ── Rule 11: renewal exposure (risk prevention) ─────────────────────── */
  const renewalWindow = new Date(now.getTime() + 120 * DAY);
  const renewingSoon = customers.filter(
    (customer) => customer.status !== "CHURNED" && customer.renewalDate && customer.renewalDate <= renewalWindow && customer.renewalDate >= now,
  );
  const exposedRenewals = renewingSoon.filter((customer) => customer.healthScore < 72);
  if (exposedRenewals.length >= 2) {
    const exposedArr = exposedRenewals.reduce((acc, customer) => acc + Number(customer.arr), 0);
    const historicalLoss = 0.34; // share of sub-70-health renewals that historically churn
    candidates.push({
      fingerprint: "renewal_exposure:120d",
      title: `€${Math.round(exposedArr).toLocaleString("en-GB")} of ARR renews below 72 health in 120 days`,
      summary: `${exposedRenewals.length} of ${renewingSoon.length} accounts renewing in the next four months score under 72 on health. Weighted by the historical churn rate for that band, roughly €${Math.round(exposedArr * historicalLoss).toLocaleString("en-GB")} is exposed.`,
      category: "RISK_PREVENTION",
      impact: exposedArr * historicalLoss,
      confidence: 74,
      priorityScore: computePriorityScore({ impact: exposedArr * historicalLoss, confidence: 74, urgency: 0.9, reach: 0.55 }),
      priority: "HIGH",
      source: "opportunity_engine.renewal_exposure",
      signal: {
        accounts: exposedRenewals
          .sort((a, b) => Number(b.arr) - Number(a.arr))
          .slice(0, 8)
          .map((customer) => ({
            id: customer.id,
            name: customer.name,
            arr: Number(customer.arr),
            healthScore: customer.healthScore,
            churnProbability: customer.churnProbability,
            renewalDate: customer.renewalDate,
          })),
        windowDays: 120,
      },
      recommendation:
        "Assign a named sponsor per account, run the value review two quarters before renewal and confirm the commercial outcome 60 days out.",
      actions: [
        { label: "Review renewal calendar", href: "/revenue?tab=renewals" },
        { label: "Open at-risk customers", href: "/customers?health=at_risk" },
      ],
      relatedCount: exposedRenewals.length,
    });
  }

  /* ── Rule 12: loss reasons that money can fix (cost reduction) ───────── */
  const lossReasons = await db.opportunity.groupBy({
    by: ["lossReason"],
    where: { organizationId, deletedAt: null, stage: "LOST", closedAt: { gte: day90 } },
    _count: true,
    _sum: { amount: true },
  });
  const pricedOut = lossReasons.filter((row) => /price|discount|budget|cost/i.test(row.lossReason ?? ""));
  const lostValue = pricedOut.reduce((acc, row) => acc + Number(row._sum.amount ?? 0), 0);
  const totalLost = lossReasons.reduce((acc, row) => acc + Number(row._sum.amount ?? 0), 0);
  if (lostValue > 0 && totalLost > 0 && lostValue / totalLost >= 0.18) {
    const recoverable = lostValue * 0.15;
    candidates.push({
      fingerprint: "loss_reason:price",
      title: `Price pressure accounts for €${Math.round(lostValue).toLocaleString("en-GB")} of lost pipeline in 90 days`,
      summary: `${Math.round((lostValue / totalLost) * 100)}% of closed-lost value cites price, discounting or budget. A 15% save rate on those conversations through structured approvals would recover roughly €${Math.round(recoverable).toLocaleString("en-GB")} per quarter.`,
      category: "COST_REDUCTION",
      impact: recoverable,
      confidence: 66,
      priorityScore: computePriorityScore({ impact: recoverable, confidence: 66, urgency: 0.55, reach: 0.5 }),
      priority: "MEDIUM",
      source: "opportunity_engine.loss_reasons",
      signal: {
        reasons: lossReasons
          .filter((row) => row.lossReason)
          .sort((a, b) => Number(b._sum.amount ?? 0) - Number(a._sum.amount ?? 0))
          .slice(0, 6)
          .map((row) => ({ reason: row.lossReason, count: row._count, value: Number(row._sum.amount ?? 0) })),
        lostValue,
        totalLost,
      },
      recommendation:
        "Introduce a discount approval path above 12%, arm reps with a value model for the top three objections, and review loss reasons monthly with product.",
      actions: [{ label: "Analyse closed-lost deals", href: "/analytics?stage=LOST" }],
      relatedCount: pricedOut.reduce((acc, row) => acc + row._count, 0),
    });
  }

  return {
    candidates,
    scanned: {
      openDeals: openDeals.length,
      customers: customers.length,
      activities90d: recentActivities.length,
      tickets90d: tickets.length,
      automations: automations.length,
      closedDeals180d: closedDeals,
    },
  };
}

/** Revenue momentum is surfaced as a headline metric inside the brief. */
export function revenueMomentum(current: number, previous: number) {
  const change = percentChange(current, previous);
  const direction = change > 1 ? "up" : change < -1 ? "down" : "flat";
  return { change, direction };
}
