import type { OrgPlan } from "@prisma/client";

/**
 * Commercial catalogue. Drives pricing pages, plan gates, usage limits and the
 * billing surface. Limits are enforced server-side (src/server/plan-guard.ts)
 * and mirrored in the UI so prospects see real numbers.
 */
export type PlanDefinition = {
  id: OrgPlan;
  name: string;
  tagline: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  currency: string;
  seatsIncluded: number;
  seatPrice: number;
  highlights: string[];
  features: {
    aiBriefs: boolean;
    opportunityEngine: boolean;
    riskEngine: boolean;
    automations: boolean;
    customReports: boolean;
    apiAccess: boolean;
    webhooks: boolean;
    sso: boolean;
    auditExport: boolean;
    dedicatedSupport: boolean;
    csmAssigned: boolean;
  };
  limits: {
    seats: number;
    customers: number;
    opportunities: number;
    automations: number;
    integrations: number;
    apiRequestsPerDay: number;
    dataRetentionDays: number;
    automationRunsPerMonth: number;
  };
  recommended?: boolean;
};

const UNLIMITED = Number.MAX_SAFE_INTEGER;

export const PLANS: Record<OrgPlan, PlanDefinition> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    tagline: "For founders putting their first revenue engine in place.",
    monthlyPrice: 99,
    annualPrice: 990,
    currency: "EUR",
    seatsIncluded: 3,
    seatPrice: 25,
    highlights: [
      "Executive dashboard with live pipeline and revenue",
      "Opportunity Engine — 20 signals recalculated hourly",
      "Weekly AI Executive Brief",
      "3 automations, 5 integrations",
    ],
    features: {
      aiBriefs: true,
      opportunityEngine: true,
      riskEngine: false,
      automations: true,
      customReports: false,
      apiAccess: false,
      webhooks: false,
      sso: false,
      auditExport: false,
      dedicatedSupport: false,
      csmAssigned: false,
    },
    limits: {
      seats: 3,
      customers: 250,
      opportunities: 750,
      automations: 3,
      integrations: 5,
      apiRequestsPerDay: 0,
      dataRetentionDays: 180,
      automationRunsPerMonth: 2_000,
    },
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    tagline: "For revenue teams scaling past €5M with disciplined execution.",
    monthlyPrice: 399,
    annualPrice: 3_990,
    currency: "EUR",
    seatsIncluded: 10,
    seatPrice: 35,
    highlights: [
      "Everything in Starter, plus:",
      "Risk Engine with churn and pipeline exposure",
      "Daily AI Executive Brief + recommended actions",
      "25 automations, unlimited integrations, CSV/API ingestion",
    ],
    features: {
      aiBriefs: true,
      opportunityEngine: true,
      riskEngine: true,
      automations: true,
      customReports: true,
      apiAccess: true,
      webhooks: true,
      sso: false,
      auditExport: true,
      dedicatedSupport: false,
      csmAssigned: false,
    },
    limits: {
      seats: 10,
      customers: 2_000,
      opportunities: 10_000,
      automations: 25,
      integrations: UNLIMITED,
      apiRequestsPerDay: 50_000,
      dataRetentionDays: 730,
      automationRunsPerMonth: 50_000,
    },
    recommended: true,
  },
  SCALE: {
    id: "SCALE",
    name: "Scale",
    tagline: "For multi-team organisations that need an operating system.",
    monthlyPrice: 999,
    annualPrice: 9_990,
    currency: "EUR",
    seatsIncluded: 25,
    seatPrice: 39,
    highlights: [
      "Everything in Growth, plus:",
      "Unlimited automations and cross-team scorecards",
      "Full audit trail with export, retention controls",
      "Priority support with 4h response SLA",
    ],
    features: {
      aiBriefs: true,
      opportunityEngine: true,
      riskEngine: true,
      automations: true,
      customReports: true,
      apiAccess: true,
      webhooks: true,
      sso: true,
      auditExport: true,
      dedicatedSupport: true,
      csmAssigned: false,
    },
    limits: {
      seats: 25,
      customers: 25_000,
      opportunities: 100_000,
      automations: UNLIMITED,
      integrations: UNLIMITED,
      apiRequestsPerDay: 500_000,
      dataRetentionDays: 1_460,
      automationRunsPerMonth: 500_000,
    },
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    tagline: "For groups needing governance, residency and custom models.",
    monthlyPrice: null,
    annualPrice: null,
    currency: "EUR",
    seatsIncluded: 100,
    seatPrice: 45,
    highlights: [
      "Everything in Scale, plus:",
      "SSO/SAML, SCIM provisioning, data residency (EU/US)",
      "Custom intelligence models and private deployment",
      "Named CSM, 99.95% uptime SLA, security review support",
    ],
    features: {
      aiBriefs: true,
      opportunityEngine: true,
      riskEngine: true,
      automations: true,
      customReports: true,
      apiAccess: true,
      webhooks: true,
      sso: true,
      auditExport: true,
      dedicatedSupport: true,
      csmAssigned: true,
    },
    limits: {
      seats: UNLIMITED,
      customers: UNLIMITED,
      opportunities: UNLIMITED,
      automations: UNLIMITED,
      integrations: UNLIMITED,
      apiRequestsPerDay: UNLIMITED,
      dataRetentionDays: 3_650,
      automationRunsPerMonth: UNLIMITED,
    },
  },
};

export const PLAN_ORDER: OrgPlan[] = ["STARTER", "GROWTH", "SCALE", "ENTERPRISE"];

export function planFor(plan: OrgPlan): PlanDefinition {
  return PLANS[plan] ?? PLANS.GROWTH;
}

export function formatLimit(value: number) {
  return value === UNLIMITED ? "Unlimited" : value.toLocaleString("en-GB");
}

export function monthlyPrice(plan: PlanDefinition, seats = plan.seatsIncluded) {
  if (plan.monthlyPrice === null) return null;
  const extraSeats = Math.max(0, seats - plan.seatsIncluded);
  return plan.monthlyPrice + extraSeats * plan.seatPrice;
}

export function planRank(plan: OrgPlan) {
  return PLAN_ORDER.indexOf(plan);
}

export function isUpgrade(from: OrgPlan, to: OrgPlan) {
  return planRank(to) > planRank(from);
}
