import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import {
  computeChurnProbability,
  computeHealthScore,
  engagementScoreFrom,
  revenueScoreFrom,
  supportScoreFrom,
  usageScoreFrom,
} from "@/server/engines/health";
import { clamp } from "@/lib/utils";
import {
  ACTIVITY_SUBJECTS,
  CHANNELS,
  CITIES,
  COMPANY_NAMES,
  CONTACT_DEPARTMENTS,
  CONTACT_SENIORITY,
  CUSTOMER_PLANS,
  FIRST_NAMES,
  INDUSTRIES,
  JOB_TITLES,
  LAST_NAMES,
  LEADERSHIP_TITLES,
  PRODUCT_LINES,
  SUPPORT_TIERS,
  TIERS,
  TICKET_SUBJECTS,
  daysAgo,
  daysAhead,
  id,
  type Rng,
} from "./data";

const DAY = 86_400_000;
const OPEN_STAGES = ["DISCOVERY", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "CONTRACT_SENT"] as const;
const STAGE_PROBABILITY: Record<string, number> = {
  DISCOVERY: 15,
  QUALIFICATION: 30,
  PROPOSAL: 50,
  NEGOTIATION: 70,
  CONTRACT_SENT: 85,
};
const AT_RISK_COUNT = 7;
const CHURNED_COUNT = 3;
const ONBOARDING_COUNT = 3;
const SEGMENT_WEIGHTS: [string, number][] = [
  ["ENTERPRISE", 0.17],
  ["MID_MARKET", 0.46],
  ["SMB", 0.37],
];
const ARR_BANDS: Record<string, [number, number]> = {
  ENTERPRISE: [92_000, 285_000],
  MID_MARKET: [28_000, 84_000],
  SMB: [6_000, 25_000],
};
const OPEN_DEAL_BANDS: Record<string, [number, number]> = {
  ENTERPRISE: [90_000, 320_000],
  MID_MARKET: [32_000, 118_000],
  SMB: [6_000, 34_000],
};
const SOURCES = ["INBOUND", "OUTBOUND", "PARTNER", "REFERRAL", "PRODUCT_LED", "EVENT", "EXPANSION"] as const;
const REGIONS = ["EMEA North", "EMEA South", "DACH", "Nordics", "UK & Ireland"] as const;
const COMPETITORS = ["Helios Suite", "Lattice Revenue", "OpsBoard", "in-house build", "Sunrise Analytics"] as const;
const LOSS_REASONS = ["Price", "No decision", "Lost to competitor", "Timing", "Missing integration", "Budget freeze"] as const;

export type CustomerCohort =
  | "healthy"
  | "watch"
  | "at_risk"
  | "churned"
  | "onboarding_stalled"
  | "expansion_ready"
  | "missing_data";

export type SeedCustomer = {
  id: string;
  name: string;
  segment: string;
  status: string;
  arr: number;
  mrr: number;
  ownerIndex: number;
  csmIndex: number;
  cohort: CustomerCohort[];
  city: (typeof CITIES)[number];
  industry: string;
  renewalDate: Date;
  contractStart: Date;
  healthScore: number;
  trend: "IMPROVING" | "STABLE" | "DECLINING";
};

/* ─────────────────────────────── customers ─────────────────────────────── */

export async function createCustomers(
  rng: Rng,
  organizationId: string,
  sellers: { id: string }[],
  csms: { id: string }[],
  count: number,
  now: Date,
  options: { nameOffset?: number } = {},
) {
  const names = COMPANY_NAMES.slice(options.nameOffset ?? 0, (options.nameOffset ?? 0) + count);
  const customers: SeedCustomer[] = [];

  for (const [index, name] of names.entries()) {
    const segment = rng.weighted(SEGMENT_WEIGHTS);
    const [minArr, maxArr] = ARR_BANDS[segment]!;
    // Cohorts are assigned deterministically so the demo always contains the
    // same mix of healthy, watched, at-risk, onboarding and churned accounts —
    // and every cohort gets behaviour that matches its story.
    const cohort: CustomerCohort[] = [];
    if (index < AT_RISK_COUNT) cohort.push("at_risk");
    else if (index < AT_RISK_COUNT + CHURNED_COUNT) cohort.push("churned");
    else if (index < AT_RISK_COUNT + CHURNED_COUNT + ONBOARDING_COUNT) cohort.push("onboarding_stalled");
    else if (index % 9 === 4) cohort.push("healthy", "expansion_ready");
    else if (index % 4 === 0) cohort.push("watch");
    else cohort.push("healthy");

    if (rng.bool(0.08)) cohort.push("missing_data");

    const status = cohort.includes("churned")
      ? "CHURNED"
      : cohort.includes("at_risk")
        ? "AT_RISK"
        : cohort.includes("onboarding_stalled")
          ? "ONBOARDING"
          : "ACTIVE";

    const arr = Math.round(rng.money(minArr, maxArr, 1000));
    const city = rng.pick(CITIES);
    const contractStart = daysAgo(rng.int(120, 1_400), now);
    const renewalDate = daysAhead(rng.int(-20, 330), now);

    // Health inputs differ sharply by cohort so the engines find a real story.
    const base = cohort.includes("at_risk") || cohort.includes("churned")
      ? rng.int(28, 52)
      : cohort.includes("watch")
        ? rng.int(58, 74)
        : cohort.includes("onboarding_stalled")
          ? rng.int(45, 62)
          : rng.int(78, 95);
    const healthScore = clamp(base + rng.int(-4, 4), 12, 97);

    customers.push({
      id: id("cus"),
      name,
      segment,
      status,
      arr,
      mrr: Math.round(arr / 12),
      ownerIndex: index % sellers.length,
      csmIndex: index % csms.length,
      cohort,
      city,
      industry: rng.pick(INDUSTRIES),
      renewalDate,
      contractStart,
      healthScore,
      trend: cohort.includes("at_risk") || cohort.includes("churned")
        ? "DECLINING"
        : cohort.includes("expansion_ready")
          ? "IMPROVING"
          : "STABLE",
    });
  }

  await db.customer.createMany({
    data: customers.map((customer, index) => ({
      id: customer.id,
      organizationId,
      name: customer.name,
      code: `CUS-${String(index + 1).padStart(4, "0")}`,
      domain: customer.cohort.includes("missing_data") ? null : `${customer.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`,
      website: customer.cohort.includes("missing_data") ? null : `https://www.${customer.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`,
      industry: customer.industry,
      segment: customer.segment as never,
      region: rng.pick(REGIONS),
      country: customer.city.country,
      city: customer.city.city,
      companySize: customer.segment === "ENTERPRISE" ? "1000+" : customer.segment === "MID_MARKET" ? "201-1000" : "51-200",
      employeeCount: customer.segment === "ENTERPRISE" ? rng.int(1_200, 9_800) : customer.segment === "MID_MARKET" ? rng.int(220, 900) : rng.int(60, 190),
      status: customer.status as never,
      plan: rng.pick(CUSTOMER_PLANS),
      tier: customer.segment === "ENTERPRISE" ? "Enterprise" : rng.pick(TIERS),
      supportTier: rng.pick(SUPPORT_TIERS),
      currency: "EUR",
      arr: new Prisma.Decimal(customer.arr),
      mrr: new Prisma.Decimal(customer.mrr),
      healthScore: customer.healthScore,
      healthTrend: customer.trend,
      churnProbability: 10,
      npsScore: clamp(customer.healthScore + rng.int(-12, 10), 0, 100),
      ownerId: sellers[customer.ownerIndex]!.id,
      csmId: csms[customer.csmIndex]!.id,
      acquisitionChannel: rng.pick(CHANNELS),
      contractStart: customer.contractStart,
      renewalDate: customer.renewalDate,
      onboardedAt: customer.contractStart,
      tags: customer.cohort.filter((tag) => tag !== "missing_data"),
      notes: customer.cohort.includes("at_risk")
        ? "Executive sponsor changed in Q2. Adoption stalled after the migration project slipped."
        : null,
    })),
  });

  return customers;
}

export async function createContacts(rng: Rng, organizationId: string, customers: SeedCustomer[], now: Date) {
  const rows: Prisma.ContactCreateManyInput[] = [];
  const byCustomer = new Map<string, { id: string; isPrimary: boolean }[]>();

  for (const customer of customers) {
    const count = customer.segment === "ENTERPRISE" ? rng.int(4, 6) : customer.segment === "MID_MARKET" ? rng.int(3, 4) : rng.int(2, 3);
    const contacts: { id: string; isPrimary: boolean }[] = [];

    for (let index = 0; index < count; index++) {
      const first = rng.pick(FIRST_NAMES);
      const last = rng.pick(LAST_NAMES);
      const contactId = id("con");
      const isPrimary = index === 0;
      const decisionMaker = isPrimary || rng.bool(0.3);
      contacts.push({ id: contactId, isPrimary });

      rows.push({
        id: contactId,
        organizationId,
        customerId: customer.id,
        firstName: first,
        lastName: last,
        email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}@${customer.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`,
        phone: `+${rng.int(30, 49)} ${rng.int(100, 999)} ${rng.int(100, 999)} ${rng.int(100, 999)}`,
        title: isPrimary ? rng.pick(LEADERSHIP_TITLES) : rng.pick(JOB_TITLES),
        department: isPrimary ? "Executive" : rng.pick(CONTACT_DEPARTMENTS),
        seniority: isPrimary ? "C-Level" : rng.pick(CONTACT_SENIORITY),
        role: isPrimary ? "Economic buyer" : decisionMaker ? "Technical evaluator" : "Influencer",
        country: customer.city.country,
        language: "en",
        isPrimary,
        isDecisionMaker: decisionMaker,
        optedOut: false,
        sentiment: customer.cohort.includes("at_risk") ? "negative" : customer.cohort.includes("healthy") ? "positive" : "neutral",
        engagementScore: clamp(customer.healthScore + rng.int(-15, 12), 5, 99),
        timezone: "Europe/Lisbon",
        lastContactedAt: daysAgo(rng.int(1, customer.cohort.includes("at_risk") ? 45 : 18), now),
        createdAt: daysAgo(rng.int(30, 900), now),
      });
    }

    byCustomer.set(customer.id, contacts);
  }

  await db.contact.createMany({ data: rows });
  return byCustomer;
}

/* ────────────────────────────── opportunities ───────────────────────────── */

export type SeedDeal = {
  id: string;
  customerId: string;
  ownerId: string;
  stage: (typeof OPEN_STAGES)[number] | "WON" | "LOST";
  amount: number;
  createdAt: Date;
  closedAt: Date | null;
  stalled: boolean;
};

/**
 * Closed history is generated so the trailing twelve months of won revenue land
 * on the company's operating plan (≈€2.84M, up 18.7% year on year) and the win
 * rate lands near 18.4%. Open pipeline is sized to ≈€8.4M.
 */
export async function createOpportunities(
  rng: Rng,
  organizationId: string,
  customers: SeedCustomer[],
  sellers: { id: string }[],
  now: Date,
  targets: { openPipeline: number; openDeals: number; wonLast12m: number; wonPrior12m: number; winRatePercent: number; winRatePriorPercent: number },
) {
  const rows: Prisma.OpportunityCreateManyInput[] = [];
  const deals: SeedDeal[] = [];
  let codeCounter = 4_000;

  const push = (deal: Prisma.OpportunityCreateManyInput, seed: SeedDeal) => {
    rows.push(deal);
    deals.push(seed);
  };

  /* ── closed history, month by month over 24 months ──
     Monthly targets are derived from the tenant's own plan (prior-year vs
     current-year closed revenue) so a small tenant does not inherit a large
     tenant's deal volume. */
  const meanPrior = targets.wonPrior12m / 12;
  const meanCurrent = targets.wonLast12m / 12;
  const monthDelta = ((meanCurrent - meanPrior) * 23) / 12;
  const monthStart = meanPrior - (monthDelta * 5.5) / 23;
  const monthTargets: number[] = [];
  for (let month = 0; month < 24; month++) {
    monthTargets.push(monthStart + (monthDelta * month) / 23);
  }

  for (let monthOffset = 23; monthOffset >= 0; monthOffset--) {
    // The engine windows are 365 days, i.e. 12.17 of these monthly buckets; the
    // scale factor lands the trailing-twelve-month figure on the operating plan.
    const target = monthTargets[23 - monthOffset]! * 0.9863;
    const lastTwelve = monthOffset <= 11;
    const wonCount = Math.max(1, Math.round(target / (lastTwelve ? 45_000 : 48_000)));

    // Win rate is not flat across the two years: the company converted 15.2% of
    // decided deals a year ago and 18.4% now, which is the +3.2 point delta the
    // dashboard reports. Each year ramps smoothly around its own average so the
    // monthly trend stays readable and the averages land on plan.
    const currentRate = 17.53 + ((11 - monthOffset) / 11) * 2.5;
    const priorRate = 13.69 + ((23 - monthOffset) / 11) * 2.4;
    const winRateForMonth = lastTwelve
      ? clamp(currentRate, 8, 45)
      : clamp(priorRate, 8, 45);
    const lostCount = Math.round(wonCount / (winRateForMonth / 100) - wonCount);

    // Weights keep deal amounts uneven but make the month sum match the target.
    const wonWeights = Array.from({ length: wonCount }, () => 0.6 + rng.float() * 0.9);
    const weightTotal = wonWeights.reduce((acc, value) => acc + value, 0);

    for (const [index, weight] of wonWeights.entries()) {
      const customer = rng.pick(customers);
      const closedAt = daysAgo(monthOffset * 30 + rng.int(1, 28), now);
      const cycleDays = customer.segment === "ENTERPRISE" ? rng.int(110, 210) : customer.segment === "MID_MARKET" ? rng.int(60, 130) : rng.int(21, 65);
      const createdAt = new Date(closedAt.getTime() - cycleDays * DAY);
      const amount = Math.round((target * weight) / weightTotal / 100) * 100;
      const dealId = id("opp");
      codeCounter += 1;

      push(
        {
          id: dealId,
          organizationId,
          customerId: customer.id,
          ownerId: sellers[index % sellers.length]!.id,
          name: `${customer.name} — ${rng.pick(["platform rollout", "expansion", "renewal", "annual contract", "multi-site licence"])}`,
          code: `OPP-${codeCounter}`,
          stage: "WON",
          type: rng.weighted([
            ["NEW_BUSINESS", 0.62],
            ["EXPANSION", 0.26],
            ["RENEWAL", 0.12],
          ]) as never,
          source: rng.pick(SOURCES),
          amount: new Prisma.Decimal(amount),
          currency: "EUR",
          probability: 100,
          weightedAmount: new Prisma.Decimal(amount),
          aiScore: rng.int(58, 96),
          expectedCloseDate: closedAt,
          closedAt,
          stageEnteredAt: closedAt,
          daysInStage: 0,
          lastActivityAt: daysAgo(monthOffset * 30 + rng.int(1, 20), now),
          activityCount: rng.int(6, 26),
          nextStep: null,
          productLine: rng.pick(PRODUCT_LINES),
          dealRegion: rng.pick(REGIONS),
          department: "Revenue",
          forecastCategory: "Closed",
          createdAt,
        },
        { id: dealId, customerId: customer.id, ownerId: sellers[index % sellers.length]!.id, stage: "WON", amount, createdAt, closedAt, stalled: false },
      );
    }

    for (let index = 0; index < lostCount; index++) {
      const customer = rng.pick(customers);
      const closedAt = daysAgo(monthOffset * 30 + rng.int(1, 28), now);
      const cycleDays = customer.segment === "ENTERPRISE" ? rng.int(90, 190) : rng.int(25, 110);
      const createdAt = new Date(closedAt.getTime() - cycleDays * DAY);
      const [minAmount, maxAmount] = OPEN_DEAL_BANDS[customer.segment]!;
      const amount = Math.round(rng.money(minAmount * 0.7, maxAmount * 0.85, 500));
      const dealId = id("opp");
      codeCounter += 1;

      push(
        {
          id: dealId,
          organizationId,
          customerId: customer.id,
          ownerId: sellers[index % sellers.length]!.id,
          name: `${customer.name} — ${rng.pick(["platform evaluation", "pilot programme", "competitive replacement", "department rollout"])}`,
          code: `OPP-${codeCounter}`,
          stage: "LOST",
          type: "NEW_BUSINESS",
          source: rng.pick(SOURCES),
          amount: new Prisma.Decimal(amount),
          currency: "EUR",
          probability: 0,
          weightedAmount: new Prisma.Decimal(0),
          aiScore: rng.int(25, 60),
          expectedCloseDate: closedAt,
          closedAt,
          stageEnteredAt: closedAt,
          daysInStage: 0,
          lastActivityAt: daysAgo(monthOffset * 30 + rng.int(1, 25), now),
          activityCount: rng.int(2, 14),
          nextStep: null,
          competitor: rng.bool(0.55) ? rng.pick(COMPETITORS) : null,
          lossReason: rng.pick(LOSS_REASONS),
          productLine: rng.pick(PRODUCT_LINES),
          dealRegion: rng.pick(REGIONS),
          department: "Revenue",
          forecastCategory: "Omitted",
          createdAt,
        },
        { id: dealId, customerId: customer.id, ownerId: sellers[index % sellers.length]!.id, stage: "LOST", amount, createdAt, closedAt, stalled: false },
      );
    }
  }

  /* ── open pipeline ── */
  const stageMix: [string, number][] = [
    ["DISCOVERY", 0.27],
    ["QUALIFICATION", 0.23],
    ["PROPOSAL", 0.21],
    ["NEGOTIATION", 0.19],
    ["CONTRACT_SENT", 0.1],
  ];
  const segmentShare: [string, number][] = [
    ["ENTERPRISE", 0.14],
    ["MID_MARKET", 0.39],
    ["SMB", 0.47],
  ];
  const expensiveSegments = ["ENTERPRISE", "MID_MARKET"];

  const forced: SeedDeal[] = [];
  const plannedStalls = Math.round(targets.openDeals * 0.1786);

  // Draw the stages first, then decide which of them are stalled: the stalled
  // cluster is a planned share of the open pipeline (17.9% ⇒ 82.1% hygiene) so
  // the operating score is reproducible instead of a coin flip.
  const plannedStages = Array.from({ length: targets.openDeals }, () => rng.weighted(stageMix) as string);
  const stalledIndexes = new Set<number>();
  for (let index = 0; index < plannedStages.length && stalledIndexes.size < plannedStalls; index += 1) {
    if (plannedStages[index] !== "DISCOVERY") stalledIndexes.add(index);
  }

  const dealsPlanned = plannedStages.map((stage, index) => {
    // Half of the open pipeline sits with larger accounts, which is where the
    // stalled-deal cluster lives — the classic "elephant hunting" pattern.
    const segment = index < 60 ? (expensiveSegments[index % 2] as string) : rng.weighted(segmentShare);
    return { stage: stage as (typeof OPEN_STAGES)[number], segment, stalled: stalledIndexes.has(index), recent: false };
  });

  const weights = dealsPlanned.map((plan) => (plan.segment === "ENTERPRISE" ? 9 : plan.segment === "MID_MARKET" ? 5 : 1.6) * (0.7 + rng.float() * 0.6));
  const weightTotal = weights.reduce((acc, value) => acc + value, 0);

  // Amounts first: the quarter cohort is then solved exactly instead of being
  // approximated by a weight threshold.
  const rawAmounts = weights.map((weight) => Math.round((targets.openPipeline * weight) / weightTotal / 500) * 500);
  const pipelineTotal = rawAmounts.reduce((acc, value) => acc + value, 0);

  // The pipeline KPI compares the open book with the same book 90 days ago, and
  // the operating plan expects +24.1%. Deals created inside the last quarter are
  // therefore pinned to 1 − 1/1.241 of the book, and the residual is balanced
  // between two deals of the open book so the total stays on plan.
  const RECENT_SHARE = 1 - 1 / 1.241;
  const recentTarget = Math.round(pipelineTotal * RECENT_SHARE);
  const byAmount = rawAmounts.map((amount, index) => ({ amount, index })).sort((a, b) => b.amount - a.amount);
  const recentIndexes = new Set<number>();
  let recentSum = 0;
  for (const entry of byAmount) {
    if (recentSum >= recentTarget) break;
    recentIndexes.add(entry.index);
    recentSum += entry.amount;
  }
  const residual = recentSum - recentTarget;
  const receiver = byAmount.find((entry) => !recentIndexes.has(entry.index));
  const donors = [...recentIndexes].filter((index) => rawAmounts[index]! - residual > 8_000);
  if (residual !== 0 && receiver && donors.length) {
    const donor = donors[Math.floor(donors.length / 2)]!;
    rawAmounts[donor] = rawAmounts[donor]! - residual;
    rawAmounts[receiver.index] = rawAmounts[receiver.index]! + residual;
  }
  for (const index of recentIndexes) dealsPlanned[index]!.recent = true;

  for (const [index, plan] of dealsPlanned.entries()) {
    // Healthy accounts carry the open pipeline; troubled accounts stay quiet,
    // which is what makes the churn signals in the demo real.
    const healthyPool = (list: SeedCustomer[]) => list.filter((entry) => !entry.cohort.includes("at_risk") && !entry.cohort.includes("churned"));
    const segmentPool = customers.filter((entry) => entry.segment === plan.segment && !entry.cohort.includes("churned"));
    const preferred = healthyPool(segmentPool);
    const customer = (rng.bool(0.9) && preferred.length ? rng.pick(preferred) : rng.pick(segmentPool)) ?? rng.pick(customers);
    const amount = rawAmounts[index]!;
    const daysInStage = plan.stage === "DISCOVERY" ? rng.int(3, 30) : plan.stage === "QUALIFICATION" ? rng.int(8, 55) : plan.stage === "PROPOSAL" ? rng.int(10, 70) : plan.stage === "NEGOTIATION" ? rng.int(14, 90) : rng.int(5, 40);
    const stageEnteredAt = daysAgo(daysInStage, now);
    // Deals in the quarter cohort were created inside the last 90 days, which is
    // what the like-for-like pipeline comparison measures.
    const ageDays = plan.recent ? rng.int(Math.max(6, daysInStage + 1), 88) : Math.max(daysInStage + 4, rng.int(92, 265));
    const createdAt = daysAgo(ageDays, now);
    const lastActivityAt = plan.stalled ? daysAgo(rng.int(21, 96), now) : daysAgo(rng.int(0, Math.max(1, Math.min(9, ageDays - daysInStage))), now);
    const probability = STAGE_PROBABILITY[plan.stage]!;
    const dealId = id("opp");
    codeCounter += 1;

    push(
      {
        id: dealId,
        organizationId,
        customerId: customer.id,
        ownerId: sellers[index % sellers.length]!.id,
        name: `${customer.name} — ${rng.pick(["platform expansion", "analytics rollout", "automation programme", "renewal uplift", "standardisation project"])}`,
        code: `OPP-${codeCounter}`,
        stage: plan.stage,
        type: rng.weighted([
          ["NEW_BUSINESS", 0.6],
          ["EXPANSION", 0.28],
          ["RENEWAL", 0.12],
        ]) as never,
        source: rng.pick(SOURCES),
        amount: new Prisma.Decimal(amount),
        currency: "EUR",
        probability,
        weightedAmount: new Prisma.Decimal(Math.round((amount * probability) / 100)),
        aiScore: clamp(probability + rng.int(-18, 16), 5, 97),
        expectedCloseDate: daysAhead(rng.int(4, 140), now),
        closedAt: null,
        stageEnteredAt,
        daysInStage,
        lastActivityAt,
        activityCount: plan.stalled ? rng.int(1, 4) : rng.int(4, 18),
        nextStep: rng.bool(0.86)
          ? rng.pick(["Send revised pricing", "Security review call", "Executive alignment", "Sign contract", "Technical workshop", "Legal redlines"])
          : null,
        nextStepDueAt: rng.bool(0.86) ? daysAhead(rng.int(-6, 14), now) : null,
        competitor: rng.bool(0.3) ? rng.pick(COMPETITORS) : null,
        productLine: rng.pick(PRODUCT_LINES),
        dealRegion: rng.pick(REGIONS),
        department: "Revenue",
        forecastCategory: probability >= 70 ? "Commit" : probability >= 50 ? "Best case" : "Pipeline",
        createdAt,
      },
      { id: dealId, customerId: customer.id, ownerId: sellers[index % sellers.length]!.id, stage: plan.stage, amount, createdAt, closedAt: null, stalled: plan.stalled },
    );
  }

  for (let index = 0; index < rows.length; index += 2_000) {
    await db.opportunity.createMany({ data: rows.slice(index, index + 2_000) });
  }

  forced.push(...deals);
  return { deals: forced, byCustomer: groupDeals(deals), wonLast12m: sumWon(deals, 0, 12), wonPrior12m: sumWon(deals, 12, 24) };
}

function groupDeals(deals: SeedDeal[]) {
  const map = new Map<string, SeedDeal[]>();
  for (const deal of deals) map.set(deal.customerId, [...(map.get(deal.customerId) ?? []), deal]);
  return map;
}

function sumWon(deals: SeedDeal[], fromMonths: number, toMonths: number) {
  const now = Date.now();
  return deals
    .filter((deal) => {
      if (deal.stage !== "WON" || !deal.closedAt) return false;
      const monthsAgo = (now - deal.closedAt.getTime()) / (30 * DAY);
      return monthsAgo >= fromMonths && monthsAgo < toMonths;
    })
    .reduce((acc, deal) => acc + deal.amount, 0);
}

/* ──────────────────────────────── activities ───────────────────────────── */

export async function createActivities(
  rng: Rng,
  organizationId: string,
  customers: SeedCustomer[],
  deals: SeedDeal[],
  sellers: { id: string }[],
  contactsByCustomer: Map<string, { id: string; isPrimary: boolean }[]>,
  now: Date,
) {
  const rows: Prisma.ActivityCreateManyInput[] = [];

  // Deal-linked touchpoints across the last 120 days.
  for (const [index, deal] of deals.entries()) {
    if (deal.stage === "WON" || deal.stage === "LOST") continue;
    const recent = deal.stalled ? rng.int(1, 3) : rng.int(5, 13);
    const contacts = contactsByCustomer.get(deal.customerId) ?? [];
    const primary = contacts.find((contact) => contact.isPrimary) ?? contacts[0];

    for (let touch = 0; touch < recent; touch++) {
      const occurredAt = deal.stalled
        ? daysAgo(rng.int(24, 110), now)
        : daysAgo(rng.int(0, 20), now);
      const type = rng.weighted<keyof typeof ACTIVITY_SUBJECTS>([
        ["EMAIL", 0.4],
        ["CALL", 0.2],
        ["MEETING", 0.16],
        ["DEMO", 0.1],
        ["TASK", 0.08],
        ["NOTE", 0.04],
        ["PROPOSAL_SENT", 0.02],
      ]);
      rows.push({
        id: id("act"),
        organizationId,
        customerId: deal.customerId,
        contactId: primary?.id ?? null,
        opportunityId: deal.id,
        userId: deal.ownerId,
        type: type as never,
        direction: type === "NOTE" ? "INTERNAL" : rng.bool(0.7) ? "OUTBOUND" : "INBOUND",
        outcome: rng.weighted([
          ["POSITIVE", 0.42],
          ["NEUTRAL", 0.3],
          ["NO_RESPONSE", 0.2],
          ["NEGATIVE", 0.08],
        ]) as never,
        subject: rng.pick(ACTIVITY_SUBJECTS[type]!),
        body: rng.bool(0.5)
          ? `Discussed ${rng.pick(["commercial terms", "rollout timeline", "security requirements", "success metrics", "integration scope"])} with ${deal.customerId ? "the account team" : "the prospect"}.`
          : null,
        durationMinutes: type === "MEETING" || type === "DEMO" ? rng.int(30, 90) : type === "CALL" ? rng.int(10, 45) : null,
        occurredAt,
        completedAt: occurredAt,
        isOverdue: false,
        channel: type === "EMAIL" ? "email" : type === "CALL" ? "phone" : type === "MEETING" ? "video" : null,
        createdAt: occurredAt,
      });
    }
    if (index % 500 === 0 && rows.length > 4_000) {
      await db.activity.createMany({ data: rows.splice(0, rows.length) });
    }
  }

  // Account-level programmes: QBRs, health check-ins, onboarding tasks.
  for (const customer of customers) {
    // Account programmes run over eight months: CS check-ins, QBRs, onboarding
    // tasks and follow-ups. Volume dips slightly in the most recent quarter,
    // which is exactly what the activity-momentum metric picks up.
    const touches = customer.cohort.includes("at_risk") || customer.cohort.includes("churned")
      ? rng.int(3, 7)
      : customer.cohort.includes("onboarding_stalled")
        ? rng.int(4, 9)
        : customer.cohort.includes("healthy")
          ? rng.int(14, 26)
          : rng.int(8, 14);
    // Accounts in trouble have gone quiet: their history sits outside the last
    // 45 days, which is what drags engagement, usage and activity down.
    const goneQuiet = customer.cohort.includes("at_risk") || customer.cohort.includes("churned");
    const contacts = contactsByCustomer.get(customer.id) ?? [];
    for (let touch = 0; touch < touches; touch++) {
      const recentBias = !goneQuiet && rng.bool(0.6);
      const occurredAt = recentBias ? daysAgo(rng.int(1, 42), now) : daysAgo(goneQuiet ? rng.int(48, 240) : rng.int(43, 238), now);
      const type = rng.weighted<keyof typeof ACTIVITY_SUBJECTS>([
        ["QBR", 0.16],
        ["MEETING", 0.22],
        ["EMAIL", 0.28],
        ["TASK", 0.2],
        ["NOTE", 0.08],
        ["CALL", 0.06],
      ]);
      const isTask = type === "TASK";
      const dueAt = isTask ? daysAhead(rng.int(-12, 12), now) : null;
      rows.push({
        id: id("act"),
        organizationId,
        customerId: customer.id,
        contactId: rng.pick(contacts)?.id ?? null,
        opportunityId: null,
        userId: customer.csmIndex !== undefined ? sellers[customer.csmIndex % sellers.length]!.id : null,
        type: type as never,
        direction: isTask ? "INTERNAL" : "OUTBOUND",
        outcome: isTask ? null : (rng.weighted([
          ["POSITIVE", 0.45],
          ["NEUTRAL", 0.28],
          ["NO_RESPONSE", 0.18],
          ["NEGATIVE", 0.09],
        ]) as never),
        subject: rng.pick(ACTIVITY_SUBJECTS[type]!),
        body: null,
        durationMinutes: type === "QBR" ? rng.int(45, 120) : type === "MEETING" ? rng.int(30, 60) : null,
        occurredAt: isTask ? daysAgo(rng.int(0, 20), now) : occurredAt,
        dueAt,
        completedAt: isTask ? (dueAt && dueAt < now ? occurredAt : null) : occurredAt,
        isOverdue: Boolean(isTask && dueAt && dueAt < now),
        channel: type === "EMAIL" ? "email" : type === "MEETING" || type === "QBR" ? "video" : null,
        createdAt: occurredAt,
      });
    }
  }

  for (let index = 0; index < rows.length; index += 2_000) {
    await db.activity.createMany({ data: rows.slice(index, index + 2_000) });
  }
  return rows.length;
}

/* ──────────────────────────────── tickets ──────────────────────────────── */

export async function createTickets(
  rng: Rng,
  organizationId: string,
  customers: SeedCustomer[],
  supportEngineers: { id: string }[],
  now: Date,
) {
  const rows: Prisma.SupportTicketCreateManyInput[] = [];
  let reference = 8_100;

  for (const customer of customers) {
    const load = customer.cohort.includes("at_risk")
      ? rng.int(6, 12)
      : customer.cohort.includes("churned")
        ? rng.int(4, 8)
        : customer.cohort.includes("onboarding_stalled")
          ? rng.int(3, 6)
          : customer.cohort.includes("healthy")
            ? rng.int(1, 4)
            : rng.int(2, 6);

    for (let index = 0; index < load; index++) {
      const openedDaysAgo = rng.int(0, 118);
      const recent = openedDaysAgo <= 30;
      const urgent = rng.bool(customer.cohort.includes("at_risk") ? 0.3 : 0.14);
      const slaTargetMinutes = urgent ? 240 : rng.pick([480, 480, 720, 1_440]);
      // Support quality degraded over the past month and troubled accounts queue
      // tickets that breach — the risk engine flags exactly this.
      const troubled = customer.cohort.includes("at_risk") || customer.cohort.includes("churned");
      const breachProbability = troubled ? (recent ? 0.466 : 0.338) : recent ? (urgent ? 0.287 : 0.17) : urgent ? 0.137 : 0.069;
      // The flag is drawn from the account's risk profile, then normalised once
      // the whole ticket set exists so SLA adherence lands on the operating plan
      // (see `normaliseBreaches`).
      const breachCandidate = rng.bool(breachProbability);
      const slaBreached = breachCandidate;
      const firstResponseMinutes = slaBreached ? rng.int(90, 900) : rng.int(6, Math.max(20, slaTargetMinutes / 3));
      const resolutionMinutes = rng.int(Math.max(45, firstResponseMinutes), slaBreached ? 5_400 : 1_500);
      const resolved = openedDaysAgo > rng.int(0, 12) || (!troubled && rng.bool(0.4));
      const status = resolved ? (rng.bool(0.7) ? "RESOLVED" : "CLOSED") : rng.bool(0.6) ? "OPEN" : "PENDING";
      const openedAt = daysAgo(openedDaysAgo, now);
      reference += 1;

      rows.push({
        id: id("tkt"),
        organizationId,
        customerId: customer.id,
        assigneeId: rng.pick(supportEngineers).id,
        reference: `TKT-${reference}`,
        subject: rng.pick(TICKET_SUBJECTS),
        description: `Reported through ${rng.pick(["email", "in-app chat", "the customer portal", "a scheduled call"])} by the ${rng.pick(["operations", "IT", "finance", "support"])} team.`,
        priority: urgent ? "URGENT" : rng.weighted([
          ["HIGH", 0.28],
          ["MEDIUM", 0.5],
          ["LOW", 0.22],
        ]) as never,
        status: status as never,
        channel: rng.pick(["email", "chat", "phone", "portal"]),
        firstResponseMinutes,
        resolutionMinutes: resolved ? resolutionMinutes : null,
        slaTargetMinutes,
        slaBreached,
        csatScore: resolved ? (slaBreached || troubled ? rng.int(1, 3) : rng.int(4, 5)) : null,
        reopenedCount: rng.bool(0.12) ? rng.int(1, 2) : 0,
        openedAt,
        firstResponseAt: new Date(openedAt.getTime() + firstResponseMinutes * 60_000),
        resolvedAt: resolved ? new Date(openedAt.getTime() + resolutionMinutes * 60_000) : null,
        createdAt: openedAt,
      });
    }
  }

  // Normalise the breach set: the support score is measured against a planned
  // adherence, so the exact count matters more than the per-ticket coin flip.
  // The tickets that keep a breach are the ones with the strongest signal
  // (urgent, unresolved, recently opened), which is also the shape the risk
  // engine looks for.
  const plannedBreaches = Math.round(rows.length * BREACH_RATE);
  const ranked = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => score(b.row) - score(a.row));
  const keep = new Set(ranked.slice(0, plannedBreaches).map((entry) => entry.index));
  for (const [index, row] of rows.entries()) {
    const breached = keep.has(index);
    row.slaBreached = breached;
    const target = row.slaTargetMinutes ?? 480;
    if (breached) {
      row.firstResponseMinutes = Math.max(target + 15, row.firstResponseMinutes ?? target + 60);
      if (row.resolutionMinutes !== null && row.resolutionMinutes !== undefined) {
        row.resolutionMinutes = Math.max(target * 2, row.resolutionMinutes);
      }
    } else {
      row.firstResponseMinutes = Math.min(Math.round(target / 2), row.firstResponseMinutes ?? 30);
      if (row.resolutionMinutes !== null && row.resolutionMinutes !== undefined) {
        row.resolutionMinutes = Math.min(target, row.resolutionMinutes);
      }
    }
    const openedAt = row.openedAt as Date;
    row.firstResponseAt = new Date(openedAt.getTime() + row.firstResponseMinutes! * 60_000);
    row.resolvedAt = row.resolutionMinutes === null || row.resolutionMinutes === undefined
      ? null
      : new Date(openedAt.getTime() + row.resolutionMinutes * 60_000);
  }

  for (let index = 0; index < rows.length; index += 2_000) {
    await db.supportTicket.createMany({ data: rows.slice(index, index + 2_000) });
  }
  return rows.length;
}

/** Planned share of tickets that miss their SLA target (23% ⇒ 77% adherence). */
const BREACH_RATE = 0.23;

function score(row: Prisma.SupportTicketCreateManyInput) {
  const priority = row.priority === "URGENT" ? 3 : row.priority === "HIGH" ? 2 : 1;
  const openish = row.status === "OPEN" || row.status === "PENDING" ? 2 : 0;
  const overdue = (row.resolutionMinutes ?? 0) > (row.slaTargetMinutes ?? 480) ? 1 : 0;
  return priority + openish + overdue + (row.reopenedCount ? 1 : 0);
}

/* ────────────────────────── customer receivables ───────────────────────── */

export async function createReceivables(rng: Rng, organizationId: string, customers: SeedCustomer[], now: Date) {
  const rows: Prisma.InvoiceCreateManyInput[] = [];
  let sequence = 0;

  for (const customer of customers) {
    if (customer.status === "CHURNED" || customer.status === "ONBOARDING") continue;
    const troubled = customer.cohort.includes("at_risk");
    const invoices = troubled ? rng.int(3, 5) : rng.int(2, 4);
    for (let index = 0; index < invoices; index++) {
      sequence += 1;
      const monthsAgo = rng.int(0, 7);
      const periodStart = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
      const subtotal = Math.round(customer.mrr * (0.92 + rng.float() * 0.3));
      const taxAmount = Math.round(subtotal * 0.23);
      const total = subtotal + taxAmount;
      const dueAt = new Date(periodStart.getTime() + 30 * DAY);
      const overdue = dueAt < now && (troubled ? rng.bool(0.75) : rng.bool(0.06));
      const paidAt = overdue ? null : dueAt < now ? new Date(dueAt.getTime() + (troubled ? rng.int(1, 30) : -rng.int(0, 9)) * DAY) : null;
      const status = overdue ? "OPEN" : paidAt ? "PAID" : "OPEN";

      rows.push({
        id: id("inv"),
        organizationId,
        customerId: customer.id,
        number: `INV-${new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1).getFullYear()}-${String(sequence).padStart(5, "0")}`,
        status,
        subtotal: new Prisma.Decimal(subtotal),
        taxAmount: new Prisma.Decimal(taxAmount),
        total: new Prisma.Decimal(total),
        currency: "EUR",
        seats: 0,
        periodStart,
        periodEnd,
        issuedAt: periodStart,
        dueAt,
        paidAt,
        lineItems: [
          { description: `${customer.name} — ${rng.pick(["platform subscription", "platform + analytics", "support retainer"])}`, quantity: 1, unitAmount: subtotal },
        ],
        notes: overdue ? "Payment terms exceeded — collections workflow started" : null,
      });
    }
  }

  // Normalise payment behaviour: the invoicing component of the operating score
  // is measured against a planned on-time share (91.2%), with the late payments
  // concentrated on the accounts that are already in trouble.
  const paidInvoices = rows.filter((row) => row.status === "PAID" && row.dueAt);
  const plannedOnTime = Math.round(paidInvoices.length * 0.912);
  const troubledIds = new Set(customers.filter((customer) => customer.cohort.includes("at_risk")).map((customer) => customer.id));
  const rankedPayments = paidInvoices
    .map((row, index) => ({ row, index, risk: troubledIds.has(row.customerId ?? "") ? 1 : 0 }))
    .sort((a, b) => a.risk - b.risk || a.index - b.index);
  for (const [position, entry] of rankedPayments.entries()) {
    const dueAt = entry.row.dueAt as Date;
    entry.row.paidAt = position < plannedOnTime
      ? new Date(dueAt.getTime() - Math.max(1, rng.int(0, 9)) * DAY)
      : new Date(dueAt.getTime() + rng.int(2, 31) * DAY);
  }

  // A deliberate cluster of long-overdue receivables so finance has a real queue.
  const lateCustomers = customers.filter((customer) => customer.status === "ACTIVE").slice(0, 9);
  for (const customer of lateCustomers) {
    sequence += 1;
    const daysOverdue = rng.int(35, 96);
    const dueAt = daysAgo(daysOverdue, now);
    const subtotal = Math.round(customer.mrr * rng.float() * 2.5 + 4_000);
    const taxAmount = Math.round(subtotal * 0.23);
    rows.push({
      id: id("inv"),
      organizationId,
      customerId: customer.id,
      number: `INV-${dueAt.getFullYear()}-${String(sequence).padStart(5, "0")}`,
      status: "OPEN",
      subtotal: new Prisma.Decimal(subtotal),
      taxAmount: new Prisma.Decimal(taxAmount),
      total: new Prisma.Decimal(subtotal + taxAmount),
      currency: "EUR",
      seats: 0,
      periodStart: new Date(dueAt.getTime() - 30 * DAY),
      periodEnd: dueAt,
      issuedAt: new Date(dueAt.getTime() - 30 * DAY),
      dueAt,
      paidAt: null,
      lineItems: [{ description: `${customer.name} — platform subscription`, quantity: 1, unitAmount: subtotal }],
      notes: `Overdue by ${daysOverdue} days — escalation level ${Math.min(3, Math.ceil(daysOverdue / 30))}`,
    });
  }

  await db.invoice.createMany({ data: rows });
  return rows.length;
}

/* ───────────────────── health, rollups and metric history ──────────────── */

/**
 * Recomputes every derived customer field from the rows that were actually
 * inserted, so the Customer 360 page, the dashboards and the engines all read
 * the same numbers.
 */
export async function refreshCustomerRollups(organizationId: string, now: Date) {
  const [customers, activities, deals, tickets, invoices, contacts] = await Promise.all([
    db.customer.findMany({ where: { organizationId }, select: { id: true, arr: true, status: true, expansionMrr: true, renewalDate: true, healthScore: true, tags: true } }),
    db.activity.findMany({ where: { organizationId }, select: { customerId: true, type: true, outcome: true, occurredAt: true } }),
    db.opportunity.findMany({ where: { organizationId, deletedAt: null }, select: { customerId: true, stage: true } }),
    db.supportTicket.findMany({ where: { organizationId }, select: { customerId: true, status: true, slaBreached: true, resolutionMinutes: true, csatScore: true, openedAt: true } }),
    db.invoice.findMany({ where: { organizationId, customerId: { not: null } }, select: { customerId: true, status: true, paidAt: true, dueAt: true } }),
    db.contact.findMany({ where: { organizationId }, select: { customerId: true } }),
  ]);

  const contactCounts = new Map<string, number>();
  for (const contact of contacts) contactCounts.set(contact.customerId, (contactCounts.get(contact.customerId) ?? 0) + 1);

  const day90 = new Date(now.getTime() - 90 * DAY);
  const updates: Prisma.PrismaPromise<unknown>[] = [];

  for (const customer of customers) {
    const customerActivities = activities.filter((activity) => activity.customerId === customer.id);
    const recent = customerActivities.filter((activity) => activity.occurredAt >= day90);
    const meetings90d = recent.filter((activity) => activity.type === "MEETING" || activity.type === "DEMO" || activity.type === "QBR").length;
    const replies = recent.filter((activity) => activity.type === "EMAIL" && activity.outcome === "POSITIVE").length;
    const lastActivity = recent.reduce<Date | null>((latest, activity) => (!latest || activity.occurredAt > latest ? activity.occurredAt : latest), null);
    const lastActivityDays = lastActivity ? Math.round((now.getTime() - lastActivity.getTime()) / DAY) : null;

    const customerTickets = tickets.filter((ticket) => ticket.customerId === customer.id);
    const openTickets = customerTickets.filter((ticket) => ticket.status === "OPEN" || ticket.status === "PENDING").length;
    const resolved = customerTickets.filter((ticket) => ticket.resolutionMinutes);
    const avgResolution = resolved.length ? resolved.reduce((acc, ticket) => acc + (ticket.resolutionMinutes ?? 0), 0) / resolved.length : 0;
    const csats = customerTickets.map((ticket) => ticket.csatScore).filter((score): score is number => typeof score === "number");
    const avgCsat = csats.length ? csats.reduce((acc, score) => acc + score, 0) / csats.length : null;

    const customerDeals = deals.filter((deal) => deal.customerId === customer.id);
    const openDeals = customerDeals.filter((deal) => !["WON", "LOST"].includes(deal.stage)).length;

    const customerInvoices = invoices.filter((invoice) => invoice.customerId === customer.id);
    const paid = customerInvoices.filter((invoice) => invoice.status === "PAID");
    const onTime = paid.filter((invoice) => invoice.paidAt && invoice.dueAt && invoice.paidAt <= invoice.dueAt).length;

    const arrDeltaPercent = customer.status === "CHURNED" ? -34 : customer.status === "AT_RISK" ? -25 : recent.length > 6 ? 9 : 2;

    const engagementScore = engagementScoreFrom({
      meetings90d,
      emailReplies90d: replies,
      decisionMakers: customer.tags.includes("champion") ? 2 : 1,
      lastContactDays: lastActivityDays,
    });
    const usageScore = usageScoreFrom({
      activityCount90d: recent.length,
      contacts: contactCounts.get(customer.id) ?? 0,
      openDeals,
      lastActivityDays,
    });
    const supportScore = supportScoreFrom({
      openTickets,
      avgResolutionMinutes: avgResolution,
      slaBreaches: customerTickets.filter((ticket) => ticket.slaBreached).length,
      totalTickets: customerTickets.length,
      avgCsat,
    });
    const revenueScore = revenueScoreFrom({
      arr: Number(customer.arr),
      expansionMrr: Number(customer.expansionMrr),
      onTimeInvoices: onTime,
      totalInvoices: Math.max(1, paid.length),
      arrDeltaPercent,
    });
    const activityScore = clamp(45 + recent.length * 6 + (lastActivityDays !== null && lastActivityDays < 10 ? 12 : 0), 5, 99);

    const healthScore = computeHealthScore({ engagementScore, revenueScore, usageScore, supportScore, activityScore });
    const churnProbability = computeChurnProbability({
      healthScore,
      trend: healthScore < 55 ? "DECLINING" : healthScore > 80 ? "IMPROVING" : "STABLE",
      renewalInDays: customer.renewalDate ? Math.round((customer.renewalDate.getTime() - now.getTime()) / DAY) : null,
      openTickets,
      arr: Number(customer.arr),
    });
    // Compare against the previous review: troubled accounts were healthier
    // last month (hence DECLINING), everything else is broadly stable.
    const historyPrevious = clamp(
      healthScore +
        (customer.status === "AT_RISK" ? 14 : customer.status === "CHURNED" ? 26 : customer.status === "ONBOARDING" ? 8 : 1),
      5,
      99,
    );

    updates.push(
      db.customer.update({
        where: { id: customer.id },
        data: {
          healthScore,
          healthTrend: healthScore > historyPrevious + 1 ? "IMPROVING" : healthScore < historyPrevious - 1 ? "DECLINING" : "STABLE",
          churnProbability,
          engagementScore,
          supportScore,
          usageScore,
          revenueScore,
          openTicketCount: openTickets,
          openDealCount: openDeals,
          activityCount: customerActivities.length,
          lifetimeValue: new Prisma.Decimal(Math.round(Number(customer.arr) * (customer.status === "CHURNED" ? 0.6 : 1.8))),
          // Expansion is recognised recurring uplift on healthy accounts;
          // churned accounts keep their lost MRR in churnedMrr and drop to zero
          // ARR so the recurring totals only count live revenue.
          expansionMrr: new Prisma.Decimal(customer.status === "ACTIVE" && healthScore >= 72 ? Math.round(Number(customer.arr) / 12 / 10) : 0),
          churnedMrr: customer.status === "CHURNED" ? new Prisma.Decimal(customer.arr).div(12) : new Prisma.Decimal(0),
          ...(customer.status === "CHURNED"
            ? { arr: new Prisma.Decimal(0), mrr: new Prisma.Decimal(0) }
            : {}),
          lastActivityAt: lastActivity,
          lastLoginAt: daysAgo(Math.round(1 + healthScore / 12), now),
        },
      }),
    );
  }

  for (let index = 0; index < updates.length; index += 40) {
    await db.$transaction(updates.slice(index, index + 40));
  }
  return updates.length;
}

/**
 * Daily snapshots for the last 24 months. Revenue, pipeline and activity are
 * derived from the seeded deals and activities (so charts and the live
 * snapshot agree); MRR, health and efficiency ramp to the current computed
 * values with the period-over-period deltas the demo tells the story with.
 */
export async function createMetricHistory(
  organizationId: string,
  now: Date,
  targets: {
    mrr: number;
    arr: number;
    pipelineOpen: number;
    pipelineWeighted: number;
    winRate: number;
    operationalEfficiency: number;
    atRiskCustomers: number;
    expansionRevenue: number;
    revenue: number;
    revenuePrev: number;
  },
) {
  const [deals, activities, customers] = await Promise.all([
    db.opportunity.findMany({ where: { organizationId, deletedAt: null }, select: { amount: true, probability: true, stage: true, createdAt: true, closedAt: true } }),
    db.activity.findMany({ where: { organizationId, deletedAt: null }, select: { occurredAt: true } }),
    db.customer.findMany({ where: { organizationId }, select: { churnProbability: true, createdAt: true } }),
  ]);

  const days = 730;
  const rows: Prisma.MetricCreateManyInput[] = [];

  const pipelineOneYearAgo = targets.pipelineOpen / 1.241;
  const efficiencyOneQuarterAgo = targets.operationalEfficiency - 9.8;
  const winRateOneQuarterAgo = targets.winRate - 3.2;
  const arrOneYearAgo = targets.arr / 1.187;

  // Average daily recurring revenue recognised per period bucket.
  const dailyRevenueBase = (targets.revenue + targets.revenuePrev) / 730;

  for (let dayOffset = days; dayOffset >= 0; dayOffset--) {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset);
    const progress = 1 - dayOffset / days;
    const yearProgress = clamp((days - dayOffset) / 365, 0, 1);

    // Pipeline snapshot, like-for-like.
    //
    // A deal counts on a historical date when it already existed on that date
    // *and is still open today*. Deals that have since been won or lost left the
    // pipeline, and their outcome is already reported through conversion and
    // revenue — counting them again would double-count closed business and make
    // the quarter-on-quarter pipeline comparison meaningless.
    let pipelineOpen = 0;
    let pipelineWeighted = 0;
    for (const deal of deals) {
      if (["WON", "LOST"].includes(deal.stage)) continue;
      if (deal.createdAt > periodStart) continue;
      const amount = Number(deal.amount);
      pipelineOpen += amount;
      pipelineWeighted += (amount * deal.probability) / 100;
    }

    const revenueThatDay = deals
      .filter((deal) => deal.stage === "WON" && deal.closedAt && deal.closedAt.toDateString() === periodStart.toDateString())
      .reduce((acc, deal) => acc + Number(deal.amount), 0);
    const activityThatDay = activities.filter((activity) => activity.occurredAt.toDateString() === periodStart.toDateString()).length;

    const smoothPipeline = pipelineOpen || Math.round(pipelineOneYearAgo * (1 + (progress - 0.02) * 0.2));
    const arr = Math.round(arrOneYearAgo * (1 + yearProgress * 0.187));
    // Improvement ramp: 0 on the comparison date 90 days ago, 1 today, so
    // "now versus 90 days ago" reads exactly the operating-plan delta (+9.8pp
    // efficiency, +3.2pp conversion) and never a fabricated number.
    const quarterRamp = clamp(1 - dayOffset / 90, 0, 1);
    const efficiency = Number((efficiencyOneQuarterAgo + quarterRamp * 9.8).toFixed(2));
    const winRate = Number((winRateOneQuarterAgo + quarterRamp * 3.2).toFixed(2));
    const atRisk = Math.max(2, Math.round(customers.filter((customer) => customer.churnProbability >= 60).length + (1 - yearProgress) * 4));

    const series: [string, number, string][] = [
      ["revenue_day", revenueThatDay || Math.round(dailyRevenueBase * (0.85 + yearProgress * 0.3)), "EUR"],
      ["mrr", Math.round(arr / 12), "EUR"],
      ["arr", arr, "EUR"],
      ["pipeline_open", Math.max(0, smoothPipeline), "EUR"],
      ["pipeline_weighted", Math.round(pipelineWeighted || smoothPipeline * 0.42), "EUR"],
      ["win_rate", winRate, "%"],
      ["operational_efficiency", efficiency, "%"],
      ["at_risk_customers", atRisk, "count"],
      ["activities", activityThatDay || Math.round(28 + yearProgress * 12), "count"],
      ["expansion_revenue", Math.round(targets.expansionRevenue * (0.5 + yearProgress * 0.5)), "EUR"],
    ];

    for (const [key, value, unit] of series) {
      rows.push({
        organizationId,
        key,
        label: key.replace(/_/g, " "),
        value: new Prisma.Decimal(value),
        unit,
        granularity: "DAY",
        dimensionKey: "all",
        dimension: { source: "seed" } as Prisma.InputJsonValue,
        periodStart,
        source: "seed",
        computedAt: now,
      });
    }
  }

  for (let index = 0; index < rows.length; index += 2_000) {
    await db.metric.createMany({ data: rows.slice(index, index + 2_000) });
  }
  return rows.length;
}

export { OPEN_STAGES, STAGE_PROBABILITY };
