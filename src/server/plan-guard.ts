import type { OrgPlan } from "@prisma/client";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { planFor } from "@/lib/plans";

/**
 * Plan enforcement. Every write path that is metered by the commercial plan
 * calls into here, so a downgrade or an exhausted quota produces a clear,
 * actionable message instead of a silent failure.
 */
export type MeteredResource = "seats" | "customers" | "opportunities" | "automations" | "integrations" | "apiRequestsPerDay";

export async function assertWithinPlan(
  organizationId: string,
  plan: OrgPlan,
  resource: MeteredResource,
  currentCount?: number,
) {
  const definition = planFor(plan);
  const limit = definition.limits[resource];
  if (!Number.isFinite(limit)) return;

  let used = currentCount;
  if (used === undefined) {
    switch (resource) {
      case "seats":
        used = await db.membership.count({ where: { organizationId, deletedAt: null } });
        break;
      case "customers":
        used = await db.customer.count({ where: { organizationId, deletedAt: null } });
        break;
      case "opportunities":
        used = await db.opportunity.count({ where: { organizationId, deletedAt: null } });
        break;
      case "automations":
        used = await db.automation.count({ where: { organizationId, deletedAt: null } });
        break;
      case "integrations":
        used = await db.integration.count({ where: { organizationId } });
        break;
      case "apiRequestsPerDay": {
        const since = new Date(Date.now() - 86_400_000);
        const events = await db.usageEvent.aggregate({
          where: { organizationId, key: "api.request", recordedAt: { gte: since } },
          _sum: { quantity: true },
        });
        used = events._sum.quantity ?? 0;
        break;
      }
    }
  }

  if (used !== undefined && used >= limit) {
    throw AppError.planLimit(
      `Your ${definition.name} plan includes ${limit.toLocaleString("en-GB")} ${resource === "apiRequestsPerDay" ? "API requests per day" : resource}. Upgrade to keep growing.`,
      { resource, limit, used, plan, upgradeUrl: "/settings?tab=billing" },
    );
  }

  return { used: used ?? 0, limit, remaining: Math.max(0, limit - (used ?? 0)) };
}

export async function recordUsage(organizationId: string, key: string, quantity = 1, metadata?: Record<string, unknown>) {
  return db.usageEvent.create({
    data: { organizationId, key, quantity, metadata: (metadata ?? undefined) as never },
  });
}

/** Current consumption of every metered resource — powers the billing screen. */
export async function planUsage(organizationId: string, plan: OrgPlan) {
  const definition = planFor(plan);
  const since = new Date(Date.now() - 86_400_000);
  const [seats, customers, opportunities, automations, integrations, apiEvents, runsThisMonth] = await Promise.all([
    db.membership.count({ where: { organizationId, deletedAt: null } }),
    db.customer.count({ where: { organizationId, deletedAt: null } }),
    db.opportunity.count({ where: { organizationId, deletedAt: null } }),
    db.automation.count({ where: { organizationId, deletedAt: null } }),
    db.integration.count({ where: { organizationId } }),
    db.usageEvent.aggregate({ where: { organizationId, key: "api.request", recordedAt: { gte: since } }, _sum: { quantity: true } }),
    db.automationExecution.count({
      where: { organizationId, startedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
    }),
  ]);

  const items = [
    { key: "seats" as const, label: "Seats", used: seats, limit: definition.limits.seats },
    { key: "customers" as const, label: "Customers", used: customers, limit: definition.limits.customers },
    { key: "opportunities" as const, label: "Opportunities", used: opportunities, limit: definition.limits.opportunities },
    { key: "automations" as const, label: "Automations", used: automations, limit: definition.limits.automations },
    { key: "integrations" as const, label: "Integrations", used: integrations, limit: definition.limits.integrations },
    { key: "apiRequestsPerDay" as const, label: "API requests / day", used: apiEvents._sum.quantity ?? 0, limit: definition.limits.apiRequestsPerDay },
    { key: "automationRunsPerMonth" as const, label: "Automation runs this month", used: runsThisMonth, limit: definition.limits.automationRunsPerMonth },
  ];

  return {
    plan: definition,
    items: items.map((item) => ({
      ...item,
      percent: Number.isFinite(item.limit) && item.limit > 0 ? Math.min(100, (item.used / item.limit) * 100) : 0,
      unlimited: !Number.isFinite(item.limit),
    })),
  };
}
