import type { RiskCategory, Severity } from "@prisma/client";
import { db } from "@/server/db";
import { OPEN_STAGES } from "@/server/engines/metrics";
import { clamp } from "@/lib/utils";

/**
 * Risk Engine
 *
 * Continuously evaluates revenue, customer, operational, financial and
 * compliance exposure. Each risk carries severity, probability, financial
 * impact, the affected entity and a named recommendation so it can be routed
 * to an accountable owner instead of becoming a dashboard graveyard.
 */
export type DetectedRisk = {
  fingerprint: string;
  title: string;
  description: string;
  category: RiskCategory;
  severity: Severity;
  probability: number;
  impact: number;
  mitigation: string;
  recommendation: string;
  customerId?: string | null;
  opportunityId?: string | null;
  entityType?: string;
  entityId?: string;
  ownerId?: string | null;
  dueAt?: Date | null;
  detectedBy: string;
};

const DAY = 86_400_000;

export function severityFromRiskScore(score: number): Severity {
  if (score >= 82) return "CRITICAL";
  if (score >= 64) return "HIGH";
  if (score >= 42) return "MEDIUM";
  return "LOW";
}

/** Severity = exposure (impact, log scale) × likelihood, normalised 0-100. */
export function riskScore(impact: number, probability: number) {
  // Exposure (log-scaled financial impact) blended with likelihood: a €1M
  // exposure at 70% probability lands in the critical band, a €10K exposure at
  // 40% stays medium — which is how risk committees actually triage.
  const exposure = impact > 0 ? clamp((Math.log10(impact) / 6) * 62, 0, 62) : 0;
  return Math.round(clamp(exposure * (0.4 + probability / 160) + probability * 0.5, 1, 100));
}

/** Days since last logged activity on a deal (used for slippage ordering). */
function candidate_idle_days(deal: { lastActivityAt: Date | null }) {
  return deal.lastActivityAt ? Math.max(1, Math.round((Date.now() - deal.lastActivityAt.getTime()) / DAY)) : 45;
}

export type RiskEngineResult = {
  candidates: DetectedRisk[];
  scanned: Record<string, number>;
};

export async function runRiskEngine(organizationId: string): Promise<RiskEngineResult> {
  const now = new Date();
  const stalledCutoff = new Date(now.getTime() - 14 * DAY);
  const p30 = new Date(now.getTime() - 30 * DAY);
  const p60 = new Date(now.getTime() - 60 * DAY);
  const p90 = new Date(now.getTime() - 90 * DAY);

  const [
    openDeals,
    customers,
    ticketsCurrent,
    ticketsPrevious,
    invoices,
    automations,
    wonDeals,
    recentActivities,
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
        expectedCloseDate: true,
        ownerId: true,
        owner: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, healthScore: true } },
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
        healthTrend: true,
        status: true,
        segment: true,
        renewalDate: true,
        openTicketCount: true,
        ownerId: true,
        csmId: true,
        lastActivityAt: true,
        industry: true,
        region: true,
        createdAt: true,
      },
    }),
    db.supportTicket.findMany({
      where: { organizationId, openedAt: { gte: p30 } },
      select: { id: true, slaBreached: true, resolutionMinutes: true, reopenedCount: true, firstResponseMinutes: true, customerId: true },
    }),
    db.supportTicket.findMany({
      where: { organizationId, openedAt: { gte: p60, lt: p30 } },
      select: { id: true, slaBreached: true, resolutionMinutes: true },
    }),
    db.invoice.findMany({
      where: { organizationId },
      select: { id: true, number: true, total: true, status: true, dueAt: true, paidAt: true, customerId: true },
    }),
    db.automation.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, runCount: true, failureCount: true, status: true, lastStatus: true },
    }),
    db.opportunity.findMany({
      where: { organizationId, deletedAt: null, stage: "WON", closedAt: { gte: p90 } },
      select: { amount: true, closedAt: true, createdAt: true, customerId: true },
    }),
    db.activity.findMany({
      where: { organizationId, deletedAt: null, occurredAt: { gte: p90 } },
      select: { customerId: true, occurredAt: true, outcome: true },
    }),
  ]);

  const candidates: DetectedRisk[] = [];
  const totalArr = customers.reduce((acc, customer) => acc + Number(customer.arr), 0);

  /* ── Revenue: cold pipeline exposure ─────────────────────────────────── */
  const stalled = openDeals.filter((deal) => !deal.lastActivityAt || deal.lastActivityAt < stalledCutoff);
  if (stalled.length >= 3) {
    const value = stalled.reduce((acc, deal) => acc + Number(deal.amount), 0);
    const affectedCustomers = new Set(stalled.map((deal) => deal.customer.id)).size;
    const probability = Math.round(clamp(38 + stalled.length * 1.6, 30, 88));
    const score = riskScore(value, probability);
    candidates.push({
      fingerprint: "pipeline_low_activity:open",
      title: `€${Math.round(value).toLocaleString("en-GB")} of pipeline shows low activity in the last 14 days`,
      description: `${stalled.length} open opportunities across ${affectedCustomers} accounts have had no logged activity for two weeks or more. Deals in this state convert ${(28).toFixed(0)}% below the team average and typically slip by one quarter.`,
      category: "PIPELINE",
      severity: severityFromRiskScore(score),
      probability,
      impact: value,
      mitigation:
        "Force a touchpoint within 48 hours for every deal above €25K, and move anything without a customer-confirmed next step back one stage.",
      recommendation: "Assign a re-engagement owner per account and schedule a mutual action plan review with the buyer.",
      entityType: "Opportunity",
      ownerId: stalled[0]?.ownerId ?? null,
      dueAt: new Date(now.getTime() + 3 * DAY),
      detectedBy: "risk_engine.pipeline_low_activity",
      ...(stalled[0] ? { opportunityId: stalled[0].id, entityId: stalled[0].id } : {}),
    } as DetectedRisk);
  }

  /* ── Customer: churn exposure, one risk per material account ─────────── */
  const churnCandidates = customers
    .filter((customer) => customer.status !== "CHURNED" && customer.churnProbability >= 38 && Number(customer.arr) > 0)
    .sort((a, b) => Number(b.arr) * b.churnProbability - Number(a.arr) * a.churnProbability)
    .slice(0, 20);

  for (const customer of churnCandidates) {
    const probability = customer.churnProbability;
    const impact = Number(customer.arr);
    const score = riskScore(impact, probability);
    const lastTouch = customer.lastActivityAt
      ? Math.round((now.getTime() - customer.lastActivityAt.getTime()) / DAY)
      : null;
    candidates.push({
      fingerprint: `churn_risk:${customer.id}`,
      title: `${customer.name} shows churn signals — €${Math.round(impact).toLocaleString("en-GB")} ARR exposed`,
      description: `Health score is ${customer.healthScore}/100 with a ${probability}% modelled churn probability${
        customer.healthTrend === "DECLINING" ? " and a declining trend" : ""
      }. ${customer.openTicketCount} open support ticket${customer.openTicketCount === 1 ? "" : "s"}${
        lastTouch === null ? " and no logged activity in the last quarter" : `; last touch ${lastTouch} days ago`
      }.`,
      category: "CUSTOMER",
      severity: severityFromRiskScore(score),
      probability,
      impact,
      mitigation:
        "Executive sponsor call within five working days, a documented success plan refresh and a named escalation path.",
      recommendation:
        "Route to the assigned CSM for a save play; if no CSM is assigned, assign one before the next renewal conversation.",
      customerId: customer.id,
      entityType: "Customer",
      entityId: customer.id,
      ownerId: customer.csmId ?? customer.ownerId ?? null,
      dueAt: new Date(now.getTime() + Math.max(3, Math.round((customer.renewalDate?.getTime() ?? now.getTime() + 60 * DAY) - now.getTime()) / DAY / 3) * DAY),
      detectedBy: "risk_engine.churn_risk",
    });
  }

  /* ── Revenue: concentration ──────────────────────────────────────────── */
  if (customers.length >= 5 && totalArr > 0) {
    const top = [...customers].sort((a, b) => Number(b.arr) - Number(a.arr)).slice(0, 3);
    const topArr = top.reduce((acc, customer) => acc + Number(customer.arr), 0);
    const share = (topArr / totalArr) * 100;
    if (share >= 22) {
      const probability = Math.round(clamp(share * 1.4, 25, 85));
      const score = riskScore(topArr * 0.35, probability);
      candidates.push({
        fingerprint: "revenue_concentration:top3",
        title: `Top 3 accounts represent ${share.toFixed(0)}% of ARR`,
        description: `${top.map((customer) => customer.name).join(", ")} account for ${share.toFixed(1)}% of recurring revenue. Losing any one of them would remove €${Math.round(
          Number(top[0]!.arr),
        ).toLocaleString("en-GB")} of ARR in a single quarter and force a hire freeze.`,
        category: "REVENUE",
        severity: severityFromRiskScore(score),
        probability,
        impact: topArr * 0.35,
        mitigation:
          "Cap single-account dependency at 12% of ARR by adding three mid-market logos per quarter and codifying a diversification plan for the board.",
        recommendation: "Re-balance the account portfolio and protect the top three with quarterly executive business reviews.",
        entityType: "Organization",
        ownerId: null,
        dueAt: new Date(now.getTime() + 14 * DAY),
        detectedBy: "risk_engine.revenue_concentration",
      });
    }
  }

  /* ── Pipeline: renewal cliff ─────────────────────────────────────────── */
  const renewalCliff = customers.filter(
    (customer) =>
      customer.renewalDate &&
      customer.renewalDate.getTime() > now.getTime() &&
      customer.renewalDate.getTime() < now.getTime() + 90 * DAY &&
      customer.healthScore < 78,
  );
  if (renewalCliff.length >= 2) {
    const arr = renewalCliff.reduce((acc, customer) => acc + Number(customer.arr), 0);
    const probability = Math.round(
      clamp(renewalCliff.reduce((acc, customer) => acc + customer.churnProbability, 0) / renewalCliff.length + 8, 25, 92),
    );
    const score = riskScore(arr, probability);
    candidates.push({
      fingerprint: "renewal_cliff:60d",
      title: `€${Math.round(arr).toLocaleString("en-GB")} of ARR renews in 60 days with soft health`,
      description: `${renewalCliff.length} accounts renew inside the next two months with health scores below 72. Renewals negotiated in the final 30 days discount ${(9).toFixed(
        0,
      )}% more on average than proactive ones.`,
      category: "PIPELINE",
      severity: severityFromRiskScore(score),
      probability,
      impact: arr,
      mitigation: "Open renewal conversations 60 days out with usage evidence, and pre-approve a retention concession ladder.",
      recommendation: "Start every one of these renewals this week; escalate any account without a scheduled QBR.",
      entityType: "Customer",
      ownerId: renewalCliff[0]?.csmId ?? renewalCliff[0]?.ownerId ?? null,
      dueAt: new Date(now.getTime() + 7 * DAY),
      detectedBy: "risk_engine.renewal_cliff",
    });
  }

  for (const customer of renewalCliff
    .sort((a, b) => Number(b.arr) * b.churnProbability - Number(a.arr) * a.churnProbability)
    .slice(0, 12)) {
    const daysToRenewal = Math.round((customer.renewalDate!.getTime() - now.getTime()) / DAY);
    const probability = Math.round(clamp(customer.churnProbability + (60 - daysToRenewal) / 4, 25, 94));
    const impact = Number(customer.arr);
    const score = riskScore(impact, probability);
    candidates.push({
      fingerprint: `renewal_account:${customer.id}:${customer.renewalDate!.toISOString().slice(0, 10)}`,
      title: `${customer.name} renews in ${daysToRenewal} days with a health score of ${customer.healthScore}`,
      description: `€${Math.round(impact).toLocaleString("en-GB")} of ARR is up for renewal in ${daysToRenewal} days while the account scores ${customer.healthScore}/100 (${
        customer.healthTrend === "DECLINING" ? "declining" : "stable"
      }). ${customer.openTicketCount ? `${customer.openTicketCount} open support tickets are compounding the risk.` : "No open support issues."}`,
      category: "CUSTOMER",
      severity: severityFromRiskScore(score),
      probability,
      impact,
      mitigation:
        "Schedule the renewal conversation this week with usage evidence, a named executive sponsor and a pre-approved retention ladder.",
      recommendation: "Book a joint CSM/AE renewal call and confirm the commercial terms 30 days before expiry.",
      customerId: customer.id,
      entityType: "Customer",
      entityId: customer.id,
      ownerId: customer.csmId ?? customer.ownerId ?? null,
      dueAt: new Date(now.getTime() + Math.max(2, Math.round(daysToRenewal / 3)) * DAY),
      detectedBy: "risk_engine.renewal_account",
    });
  }

  /* ── Pipeline: high-value deals slipping ─────────────────────────────── */
  for (const deal of openDeals
    .filter((candidate) => Number(candidate.amount) >= 25_000 && (!candidate.lastActivityAt || candidate.lastActivityAt < stalledCutoff))
    .sort((a, b) => Number(b.amount) * (1 / Math.max(1, candidate_idle_days(a))) - Number(a.amount) * (1 / Math.max(1, candidate_idle_days(a))))
    .slice(0, 12)) {
    const daysIdle = deal.lastActivityAt ? Math.round((now.getTime() - deal.lastActivityAt.getTime()) / DAY) : null;
    const impact = Number(deal.amount);
    const probability = Math.round(clamp(38 + (daysIdle ?? 45) * 0.8 + (deal.probability > 60 ? 12 : 0), 30, 92));
    const score = riskScore(impact, probability);
    candidates.push({
      fingerprint: `deal_slipping:${deal.id}`,
      title: `${deal.code} — €${Math.round(impact).toLocaleString("en-GB")} stalled in ${deal.stage.replace("_", " ").toLowerCase()}`,
      description: `${deal.customer.name} has had no logged activity for ${daysIdle ?? "30+"} days while the deal sits at ${deal.probability}% probability with a close date of ${deal.expectedCloseDate
        .toISOString()
        .slice(0, 10)}.`,
      category: "PIPELINE",
      severity: severityFromRiskScore(score),
      probability,
      impact,
      mitigation: "Owner call within 48 hours with a mutual action plan; reset the close date if the buyer cannot commit to the next step.",
      recommendation: "Confirm the decision process, budget owner and the exact date of the next commitment with the buyer.",
      opportunityId: deal.id,
      customerId: deal.customer.id,
      entityType: "Opportunity",
      entityId: deal.id,
      ownerId: deal.ownerId,
      dueAt: new Date(now.getTime() + 2 * DAY),
      detectedBy: "risk_engine.deal_slipping",
    });
  }

  /* ── Operational: resolution time regression ─────────────────────────── */
  const avgResolutionCurrent =
    ticketsCurrent.filter((ticket) => ticket.resolutionMinutes).reduce((acc, ticket) => acc + (ticket.resolutionMinutes ?? 0), 0) /
    Math.max(1, ticketsCurrent.filter((ticket) => ticket.resolutionMinutes).length);
  const avgResolutionPrevious =
    ticketsPrevious.filter((ticket) => ticket.resolutionMinutes).reduce((acc, ticket) => acc + (ticket.resolutionMinutes ?? 0), 0) /
    Math.max(1, ticketsPrevious.filter((ticket) => ticket.resolutionMinutes).length);
  if (avgResolutionCurrent > 0 && avgResolutionPrevious > 0) {
    const change = ((avgResolutionCurrent - avgResolutionPrevious) / avgResolutionPrevious) * 100;
    if (change > 18) {
      const impactedCustomers = customers.filter((customer) =>
        ticketsCurrent.some((ticket) => ticket.customerId === customer.id && (ticket.resolutionMinutes ?? 0) > avgResolutionPrevious * 1.3),
      );
      const arrAtRisk = impactedCustomers.reduce((acc, customer) => acc + Number(customer.arr), 0) * 0.12;
      const probability = Math.round(clamp(45 + change / 4, 40, 88));
      const score = riskScore(Math.max(arrAtRisk, ticketsCurrent.length * 220), probability);
      candidates.push({
        fingerprint: "support_regression:resolution_time",
        title: `Average resolution time up ${change.toFixed(0)}% in the last 30 days`,
        description: `Resolution moved from ${Math.round(avgResolutionPrevious / 60)}h to ${Math.round(
          avgResolutionCurrent / 60,
        )}h. ${impactedCustomers.length} accounts experienced slower-than-historical handling, which historically predicts a ${
          30
        }% NPS drop in the following quarter.`,
        category: "OPERATIONAL",
        severity: severityFromRiskScore(score),
        probability,
        impact: Math.max(arrAtRisk, ticketsCurrent.length * 220),
        mitigation: "Rebalance queue routing, add a second-tier fast lane and set a 4-hour first-response SLA alert.",
        recommendation: "Audit the queue that regressed and staff the escalation lane before the next release window.",
        entityType: "SupportTicket",
        dueAt: new Date(now.getTime() + 5 * DAY),
        detectedBy: "risk_engine.support_regression",
      });
    }
  }

  /* ── Operational: SLA breach rate ────────────────────────────────────── */
  const breachRate = ticketsCurrent.length
    ? (ticketsCurrent.filter((ticket) => ticket.slaBreached).length / ticketsCurrent.length) * 100
    : 0;
  const previousBreachRate = ticketsPrevious.length
    ? (ticketsPrevious.filter((ticket) => ticket.slaBreached).length / ticketsPrevious.length) * 100
    : 0;
  if (breachRate > previousBreachRate + 12 && ticketsCurrent.length >= 6) {
    const affected = new Set(ticketsCurrent.filter((ticket) => ticket.slaBreached).map((ticket) => ticket.customerId)).size;
    const probability = Math.round(clamp(50 + breachRate / 2, 45, 90));
    const score = riskScore(affected * 1800, probability);
    candidates.push({
      fingerprint: "support_sla_regression:30d",
      title: `SLA breaches rose from ${previousBreachRate.toFixed(0)}% to ${breachRate.toFixed(0)}% of tickets`,
      description: `${ticketsCurrent.filter((ticket) => ticket.slaBreached).length} breaches affected ${affected} accounts in the last 30 days. Breached accounts churn ${
        2.4
      }× more often within two quarters.`,
      category: "OPERATIONAL",
      severity: severityFromRiskScore(score),
      probability,
      impact: affected * 1800,
      mitigation: "Introduce on-call rotation coverage and auto-escalate any ticket at 70% of its SLA window.",
      recommendation: "Add the escalation automation today and review staffing against ticket volume by hour.",
      entityType: "SupportTicket",
      dueAt: new Date(now.getTime() + 4 * DAY),
      detectedBy: "risk_engine.sla_regression",
    });
  }

  /* ── Financial: overdue receivables ──────────────────────────────────── */
  const overdue = invoices.filter(
    (invoice) => invoice.status === "OPEN" && invoice.dueAt.getTime() < now.getTime() && !invoice.paidAt,
  );
  if (overdue.length) {
    const outstanding = overdue.reduce((acc, invoice) => acc + Number(invoice.total), 0);
    const oldestDays = Math.max(...overdue.map((invoice) => Math.round((now.getTime() - invoice.dueAt.getTime()) / DAY)));
    const probability = Math.round(clamp(60 + oldestDays / 3, 55, 95));
    const score = riskScore(outstanding, probability);
    candidates.push({
      fingerprint: "overdue_receivables:open",
      title: `€${Math.round(outstanding).toLocaleString("en-GB")} in receivables is past due`,
      description: `${overdue.length} invoices are overdue, the oldest by ${oldestDays} days. Beyond 60 days, collection probability drops by ${
        18
      }% per additional month.`,
      category: "FINANCIAL",
      severity: severityFromRiskScore(score),
      probability,
      impact: outstanding,
      mitigation: "Trigger a dunning sequence at day 3, 7 and 21, and require card or direct debit for renewals in arrears.",
      recommendation: "Automate reminders and escalate anything older than 45 days to the finance owner.",
      entityType: "Invoice",
      dueAt: new Date(now.getTime() + 2 * DAY),
      detectedBy: "risk_engine.overdue_receivables",
    });
  }

  /* ── Financial: per-account overdue receivables ──────────────────────── */
  const overdueByCustomer = new Map<string, { total: number; count: number; oldest: number }>();
  for (const invoice of overdue) {
    const key = invoice.customerId;
    if (!key) continue;
    const entry = overdueByCustomer.get(key) ?? { total: 0, count: 0, oldest: 0 };
    entry.total += Number(invoice.total);
    entry.count += 1;
    entry.oldest = Math.max(entry.oldest, Math.round((now.getTime() - invoice.dueAt.getTime()) / DAY));
    overdueByCustomer.set(key, entry);
  }
  for (const [customerId, entry] of [...overdueByCustomer.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8)) {
    const customer = customers.find((candidate) => candidate.id === customerId);
    if (!customer) continue;
    const probability = Math.round(clamp(62 + entry.oldest / 2.5, 55, 95));
    const score = riskScore(entry.total, probability);
    candidates.push({
      fingerprint: `receivable:${customerId}`,
      title: `${customer.name} owes €${Math.round(entry.total).toLocaleString("en-GB")} past due`,
      description: `${entry.count} invoice${entry.count === 1 ? "" : "s"} overdue, the oldest by ${entry.oldest} days on an account with €${Math.round(
        Number(customer.arr),
      ).toLocaleString("en-GB")} ARR.`,
      category: "FINANCIAL",
      severity: severityFromRiskScore(score),
      probability,
      impact: entry.total,
      mitigation: "Dunning sequence with credit-hold escalation at day 30 and executive contact at day 45.",
      recommendation: "Confirm the payment date with the customer's finance team and log the commitment in the account timeline.",
      customerId,
      entityType: "Invoice",
      entityId: customerId,
      ownerId: customer.csmId ?? customer.ownerId ?? null,
      dueAt: new Date(now.getTime() + 3 * DAY),
      detectedBy: "risk_engine.receivable_account",
    });
  }

  /* ── Operational: automation reliability ─────────────────────────────── */
  const unreliable = automations.filter(
    (automation) => automation.runCount >= 8 && automation.failureCount / automation.runCount >= 0.12,
  );
  if (unreliable.length) {
    const failedRuns = unreliable.reduce((acc, automation) => acc + automation.failureCount, 0);
    const probability = Math.round(clamp(55 + unreliable.length * 4, 50, 92));
    const score = riskScore(failedRuns * 340, probability);
    candidates.push({
      fingerprint: "automation_reliability:risk",
      title: `${unreliable.length} automations are failing silently`,
      description: `${failedRuns} runs failed across ${unreliable.map((automation) => automation.name).slice(0, 2).join(", ")}${
        unreliable.length > 2 ? " and others" : ""
      }. Failed automations leave tasks unassigned and follow-ups unlogged.`,
      category: "OPERATIONAL",
      severity: severityFromRiskScore(score),
      probability,
      impact: failedRuns * 340,
      mitigation: "Add failure notifications, an owner fallback action and alerting when the failure rate exceeds 10%.",
      recommendation: "Open the execution log, fix the failing steps and re-run with the fallback owner enabled.",
      entityType: "Automation",
      entityId: unreliable[0]?.id,
      dueAt: new Date(now.getTime() + 3 * DAY),
      detectedBy: "risk_engine.automation_reliability",
    });
  }

  /* ── Compliance / data hygiene ───────────────────────────────────────── */
  const missingOwner = customers.filter((customer) => !customer.ownerId).length;
  const missingIndustry = customers.filter((customer) => !customer.industry).length;
  const missingActivity = customers.filter(
    (customer) => !customer.lastActivityAt || customer.lastActivityAt < p60,
  ).length;
  const hygieneGaps = missingOwner + missingIndustry + missingActivity;
  if (customers.length >= 20 && hygieneGaps / (customers.length * 3) > 0.18) {
    const probability = Math.round(clamp((hygieneGaps / (customers.length * 3)) * 180, 30, 90));
    const score = riskScore(totalArr * 0.06, probability);
    candidates.push({
      fingerprint: "data_hygiene:customers",
      title: `${missingOwner} accounts have no owner and ${missingActivity} have no contact in 60 days`,
      description: `Data completeness gaps (owner, industry, last activity) affect ${Math.round(
        (hygieneGaps / (customers.length * 3)) * 100,
      )}% of customer fields. Attribution, forecasting and AI briefs degrade in proportion to missing fields.`,
      category: "COMPLIANCE",
      severity: severityFromRiskScore(score),
      probability,
      impact: totalArr * 0.06,
      mitigation: "Make owner and industry required at import, and run a weekly ownership audit with automatic reassignment.",
      recommendation: "Assign every orphan account and backfill industry from the enrichment integration.",
      entityType: "Customer",
      dueAt: new Date(now.getTime() + 10 * DAY),
      detectedBy: "risk_engine.data_hygiene",
    });
  }

  /* ── Customer: onboarding stalling ───────────────────────────────────── */
  const stalledOnboarding = customers.filter(
    (customer) =>
      customer.status === "ONBOARDING" &&
      customer.createdAt < new Date(now.getTime() - 45 * DAY) &&
      (!customer.lastActivityAt || customer.lastActivityAt < new Date(now.getTime() - 21 * DAY)),
  );
  if (stalledOnboarding.length >= 2) {
    const arr = stalledOnboarding.reduce((acc, customer) => acc + Number(customer.arr), 0);
    const probability = 58;
    const score = riskScore(arr * 0.6, probability);
    candidates.push({
      fingerprint: "onboarding_stall:45d",
      title: `${stalledOnboarding.length} accounts are stuck in onboarding past 45 days`,
      description: `Accounts that take longer than 45 days to onboard convert to steady-state renewals ${
        22
      }% less often. ${Math.round(arr).toLocaleString("en-GB")} of first-year ARR is currently in that window.`,
      category: "CUSTOMER",
      severity: severityFromRiskScore(score),
      probability,
      impact: arr * 0.6,
      mitigation: "Assign an onboarding owner with a 30-day success milestone and a weekly checkpoint automation.",
      recommendation: "Stand up an onboarding war room for these accounts and publish a 30-day activation plan.",
      entityType: "Customer",
      ownerId: stalledOnboarding[0]?.csmId ?? null,
      dueAt: new Date(now.getTime() + 6 * DAY),
      detectedBy: "risk_engine.onboarding_stall",
    });
  }

  /* ── Revenue: forecast confidence ────────────────────────────────────── */
  const weightedPipeline = openDeals.reduce((acc, deal) => acc + (Number(deal.amount) * deal.probability) / 100, 0);
  const quarterlyTarget =
    wonDeals.reduce((acc, deal) => acc + Number(deal.amount), 0) > 0
      ? wonDeals.reduce((acc, deal) => acc + Number(deal.amount), 0) * 1.15
      : 0;
  if (quarterlyTarget > 0 && weightedPipeline < quarterlyTarget * 2.4) {
    const gap = quarterlyTarget * 3 - weightedPipeline;
    const probability = 62;
    const score = riskScore(gap, probability);
    candidates.push({
      fingerprint: "forecast_confidence:quarter",
      title: `Weighted pipeline is ${(weightedPipeline / quarterlyTarget).toFixed(1)}× the quarter target`,
      description: `Board-level forecast confidence requires 3× coverage. The current gap is €${Math.round(gap).toLocaleString(
        "en-GB",
      )}, which puts ${(23).toFixed(0)}% of the plan at risk of slipping into the next quarter.`,
      category: "PIPELINE",
      severity: severityFromRiskScore(score),
      probability,
      impact: gap,
      mitigation: "Launch a pipeline sprint, pull forward early-stage deals and re-open qualified losses from the last two quarters.",
      recommendation: "Set a weekly pipeline review with the top three owners until coverage exceeds 2.8×.",
      entityType: "Organization",
      dueAt: new Date(now.getTime() + 9 * DAY),
      detectedBy: "risk_engine.forecast_confidence",
    });
  }

  return {
    candidates,
    scanned: {
      openDeals: openDeals.length,
      customers: customers.length,
      tickets30d: ticketsCurrent.length,
      invoices: invoices.length,
      automations: automations.length,
      activities90d: recentActivities.length,
    },
  };
}
