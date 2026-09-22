import { clamp } from "@/lib/utils";

/**
 * Customer Health Score (0–100)
 *
 * Five weighted factors, each normalised to 0–100, combined with a transparent
 * weight model so Customer Success can explain exactly why an account moved.
 *   engagement 25% · revenue 25% · product usage 20% · support 20% · activity 10%
 */
export type HealthFactor = {
  key: "engagement" | "revenue" | "usage" | "support" | "activity";
  label: string;
  score: number;
  weight: number;
  detail: string;
};

export type HealthInput = {
  engagementScore: number;
  revenueScore: number;
  usageScore: number;
  supportScore: number;
  activityScore: number;
};

export const HEALTH_WEIGHTS: Record<HealthFactor["key"], number> = {
  engagement: 0.25,
  revenue: 0.25,
  usage: 0.2,
  support: 0.2,
  activity: 0.1,
};

export const HEALTH_FACTOR_LABELS: Record<HealthFactor["key"], string> = {
  engagement: "Engagement",
  revenue: "Revenue",
  usage: "Product usage",
  support: "Support",
  activity: "Activity",
};

export function computeHealthScore(input: HealthInput) {
  const weighted =
    input.engagementScore * HEALTH_WEIGHTS.engagement +
    input.revenueScore * HEALTH_WEIGHTS.revenue +
    input.usageScore * HEALTH_WEIGHTS.usage +
    input.supportScore * HEALTH_WEIGHTS.support +
    input.activityScore * HEALTH_WEIGHTS.activity;
  return Math.round(clamp(weighted, 0, 100));
}

/** Churn probability rises as health falls, tempered by contract size and tenure. */
export function computeChurnProbability(input: {
  healthScore: number;
  trend: "IMPROVING" | "STABLE" | "DECLINING";
  renewalInDays: number | null;
  openTickets: number;
  arr: number;
}) {
  let probability = clamp(100 - input.healthScore, 0, 100) * 0.92;
  if (input.trend === "DECLINING") probability += 12;
  if (input.trend === "IMPROVING") probability -= 10;
  if (input.renewalInDays !== null) {
    if (input.renewalInDays <= 30) probability += 8;
    else if (input.renewalInDays <= 60) probability += 4;
  }
  probability += Math.min(12, input.openTickets * 2.5);
  if (input.arr > 100_000) probability -= 4; // large accounts get more attention
  return Math.round(clamp(probability, 1, 97));
}

export function healthTrendFromScores(previous: number, current: number) {
  const delta = current - previous;
  if (delta >= 4) return "IMPROVING" as const;
  if (delta <= -4) return "DECLINING" as const;
  return "STABLE" as const;
}

/** Support sub-score: faster resolution and fewer breaches ⇒ higher score. */
export function supportScoreFrom({
  openTickets,
  avgResolutionMinutes,
  slaBreaches,
  totalTickets,
  avgCsat,
}: {
  openTickets: number;
  avgResolutionMinutes: number;
  slaBreaches: number;
  totalTickets: number;
  avgCsat: number | null;
}) {
  let score = 88;
  score -= Math.min(30, openTickets * 4);
  if (avgResolutionMinutes > 0) score -= clamp((avgResolutionMinutes - 240) / 40, 0, 22);
  if (totalTickets > 0) score -= clamp((slaBreaches / totalTickets) * 60, 0, 30);
  if (avgCsat !== null) score += (avgCsat - 4) * 6;
  return Math.round(clamp(score, 5, 99));
}

export function usageScoreFrom({
  activityCount90d,
  contacts,
  openDeals,
  lastActivityDays,
}: {
  activityCount90d: number;
  contacts: number;
  openDeals: number;
  lastActivityDays: number | null;
}) {
  let score = 40;
  score += clamp(activityCount90d * 1.6, 0, 30);
  score += clamp(contacts * 2.2, 0, 14);
  score += clamp(openDeals * 3.5, 0, 14);
  if (lastActivityDays === null) score -= 18;
  else if (lastActivityDays > 45) score -= 20;
  else if (lastActivityDays > 21) score -= 10;
  else if (lastActivityDays < 7) score += 4;
  return Math.round(clamp(score, 5, 99));
}

export function engagementScoreFrom({
  meetings90d,
  emailReplies90d,
  decisionMakers,
  lastContactDays,
}: {
  meetings90d: number;
  emailReplies90d: number;
  decisionMakers: number;
  lastContactDays: number | null;
}) {
  let score = 42;
  score += clamp(meetings90d * 3.2, 0, 26);
  score += clamp(emailReplies90d * 1.4, 0, 18);
  score += clamp(decisionMakers * 4, 0, 12);
  if (lastContactDays === null) score -= 16;
  else if (lastContactDays > 30) score -= 18;
  else if (lastContactDays > 14) score -= 8;
  return Math.round(clamp(score, 5, 99));
}

export function revenueScoreFrom({
  arr,
  expansionMrr,
  onTimeInvoices,
  totalInvoices,
  arrDeltaPercent,
}: {
  arr: number;
  expansionMrr: number;
  onTimeInvoices: number;
  totalInvoices: number;
  arrDeltaPercent: number;
}) {
  let score = 55;
  if (arr > 250_000) score += 20;
  else if (arr > 100_000) score += 15;
  else if (arr > 50_000) score += 10;
  else if (arr > 10_000) score += 4;
  score += clamp(expansionMrr / 500, 0, 10);
  if (totalInvoices > 0) score += (onTimeInvoices / totalInvoices) * 10 - 5;
  score += clamp(arrDeltaPercent / 5, -12, 12);
  return Math.round(clamp(score, 5, 99));
}

export function buildHealthFactors(input: {
  engagementScore: number;
  revenueScore: number;
  usageScore: number;
  supportScore: number;
  activityScore: number;
  details?: Partial<Record<HealthFactor["key"], string>>;
}): HealthFactor[] {
  return (["engagement", "revenue", "usage", "support", "activity"] as const).map((key) => ({
    key,
    label: HEALTH_FACTOR_LABELS[key],
    weight: HEALTH_WEIGHTS[key],
    score: Math.round(clamp(input[`${key}Score` as keyof HealthInput], 0, 100)),
    detail: input.details?.[key] ?? "",
  }));
}

export function healthBand(score: number) {
  if (score >= 80) return { band: "healthy", label: "Healthy", tone: "success" as const };
  if (score >= 60) return { band: "watch", label: "Monitor", tone: "warning" as const };
  return { band: "at_risk", label: "At risk", tone: "danger" as const };
}
