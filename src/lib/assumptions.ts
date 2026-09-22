/**
 * Operating assumptions used by financial models.
 *
 * These are the inputs Nexus OS cannot read from a CRM (fully loaded cost of a
 * rep, marketing investment, gross margin). They are explicit, versioned and
 * surfaced in the UI so every derived metric — CAC, LTV, automation savings —
 * can be audited rather than trusted blindly. Organizations can override them
 * from Settings → Financial model.
 */
export const ASSUMPTIONS = {
  /** Fully loaded cost of one quota-carrying rep per year (salary, commission, tooling). */
  salesRepFullyLoadedCost: 96_000,
  /** Marketing investment as a share of revenue. */
  marketingSpendPercentOfRevenue: 0.12,
  /** Gross margin applied to LTV. */
  grossMargin: 0.78,
  /** Fully loaded cost of one hour of manual coordination work. */
  costPerHour: 45,
  /** Minutes saved per automated action step. */
  minutesSavedPerAutomationStep: 6,
  /** Cost of handling one SLA breach (support time + goodwill). */
  costPerSlaBreach: 180,
  /** Monthly logo churn benchmark for healthy B2B SaaS. */
  monthlyChurnBenchmark: 0.9,
} as const;

export const ASSUMPTION_LABELS: Record<keyof typeof ASSUMPTIONS, string> = {
  salesRepFullyLoadedCost: "Fully loaded cost per rep / year",
  marketingSpendPercentOfRevenue: "Marketing spend (% of revenue)",
  grossMargin: "Gross margin",
  costPerHour: "Cost of manual work / hour",
  minutesSavedPerAutomationStep: "Minutes saved per automation step",
  costPerSlaBreach: "Cost per SLA breach",
  monthlyChurnBenchmark: "Monthly logo churn benchmark",
};
