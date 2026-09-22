import { route } from "@/server/api";
import { auditAs } from "@/server/audit";
import { paginated, paginationFrom } from "@/server/api";
import { billingPlanChangeSchema, paginationSchema } from "@/server/validation";
import { AppError } from "@/server/errors";
import { PLANS, planFor } from "@/lib/plans";
import { z } from "zod";

const querySchema = paginationSchema.extend({});

export const GET = route({
  query: querySchema,
  handler: async ({ auth, db }) => {
    const [subscription, invoices, usage] = await Promise.all([
      db.subscription.findFirst({
        where: { organizationId: auth.organization.id },
        orderBy: { createdAt: "desc" },
      }),
      db.invoice.findMany({
        where: { organizationId: auth.organization.id, customerId: null },
        orderBy: { issuedAt: "desc" },
        take: 24,
      }),
      db.usageEvent.groupBy({
        by: ["key"],
        where: {
          organizationId: auth.organization.id,
          recordedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
        },
        _sum: { quantity: true },
      }),
    ]);

    const counts = {
      members: await db.membership.count({
        where: {
          organizationId: auth.organization.id,
          status: "ACTIVE",
          deletedAt: null,
        },
      }),
      customers: await db.customer.count({
        where: { organizationId: auth.organization.id, deletedAt: null },
      }),
      opportunities: await db.opportunity.count({
        where: { organizationId: auth.organization.id, deletedAt: null },
      }),
      automations: await db.automation.count({
        where: { organizationId: auth.organization.id, deletedAt: null },
      }),
      integrations: await db.integration.count({
        where: {
          organizationId: auth.organization.id,
          status: { not: "DISCONNECTED" },
        },
      }),
    };

    const plan = PLANS[auth.organization.plan];
    const limits = plan.limits;

    return {
      data: {
        plan: {
          id: plan.id,
          name: plan.name,
          tagline: plan.tagline,
          monthlyPrice: plan.monthlyPrice,
          annualPrice: plan.annualPrice,
          seatsIncluded: plan.seatsIncluded,
          seatPrice: plan.seatPrice,
          features: plan.features,
          limits,
        },
        catalogue: Object.values(PLANS).map((entry) => ({
          id: entry.id,
          name: entry.name,
          tagline: entry.tagline,
          monthlyPrice: entry.monthlyPrice,
          annualPrice: entry.annualPrice,
          seatsIncluded: entry.seatsIncluded,
          seatPrice: entry.seatPrice,
          features: entry.features,
          limits: entry.limits,
        })),
        subscription: subscription
          ? {
              ...subscription,
              mrr: Number(subscription.mrr),
              seatPrice: Number(subscription.seatPrice),
            }
          : null,
        invoices: invoices.map((invoice) => ({
          ...invoice,
          total: Number(invoice.total),
          subtotal: Number(invoice.subtotal),
          taxAmount: Number(invoice.taxAmount),
        })),
        usage: {
          members: { used: counts.members, limit: limits.seats },
          customers: { used: counts.customers, limit: limits.customers },
          opportunities: {
            used: counts.opportunities,
            limit: limits.opportunities,
          },
          automations: { used: counts.automations, limit: limits.automations },
          integrations: {
            used: counts.integrations,
            limit: limits.integrations,
          },
          apiRequests: {
            used:
              usage.find((row) => row.key === "api.requests")?._sum.quantity ??
              0,
            limit: limits.apiRequestsPerDay * 30,
          },
          seatsActive: {
            used:
              usage.find((row) => row.key === "seats.active")?._sum.quantity ??
              0,
            limit: limits.seats * 30,
          },
        },
      },
    };
  },
});

export const PATCH = route({
  body: billingPlanChangeSchema,
  rateLimit: "write",
  permission: "billing:manage",
  handler: async ({ auth, body, db }) => {
    const target = PLANS[body.plan];
    if (!target) throw AppError.notFound("Plan");
    const subscription = await db.subscription.findFirst({
      where: { organizationId: auth.organization.id },
      orderBy: { createdAt: "desc" },
    });
    if (!subscription) throw AppError.notFound("Subscription");

    const seats = body.seats ?? subscription.seats;
    const interval = body.billingInterval;
    const unit =
      interval === "annual"
        ? (planFor(body.plan).annualPrice ?? 0)
        : (target.monthlyPrice ?? 0);
    const mrr =
      interval === "annual"
        ? unit / 12 +
          Math.max(0, seats - target.seatsIncluded) * target.seatPrice
        : unit + Math.max(0, seats - target.seatsIncluded) * target.seatPrice;

    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: body.plan,
        seats,
        billingInterval: interval,
        mrr,
        status: "ACTIVE",
        canceledAt: null,
        cancelAtPeriodEnd: false,
      },
    });
    await db.organization.update({
      where: { id: auth.organization.id },
      data: { plan: body.plan },
    });

    await auditAs(auth, {
      action: "billing.plan_changed",
      entityType: "subscription",
      entityId: subscription.id,
      entityLabel: `${subscription.plan} → ${body.plan}`,
      before: {
        plan: subscription.plan,
        seats: subscription.seats,
        mrr: Number(subscription.mrr),
        billingInterval: subscription.billingInterval,
      },
      after: {
        plan: updated.plan,
        seats: updated.seats,
        mrr: Number(updated.mrr),
        billingInterval: updated.billingInterval,
      },
      severity: "WARNING",
    });

    return {
      data: {
        ...updated,
        mrr: Number(updated.mrr),
        seatPrice: Number(updated.seatPrice),
      },
    };
  },
});

