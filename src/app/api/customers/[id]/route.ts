import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { customerUpdateSchema } from "@/server/validation";
import { buildHealthFactors, healthBand } from "@/server/engines/health";

export const GET = route({
  handler: async ({ auth, params, db }) => {
    const organizationId = auth.organization.id;
    const customer = await db.customer.findFirst({
      where: { id: params.id, organizationId, deletedAt: null },
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        csm: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    if (!customer) throw AppError.notFound("Customer");

    const [
      contacts,
      opportunities,
      activities,
      tickets,
      invoices,
      risks,
      insights,
    ] = await Promise.all([
      db.contact.findMany({
        where: { customerId: customer.id, deletedAt: null },
        orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }],
      }),
      db.opportunity.findMany({
        where: { customerId: customer.id, deletedAt: null },
        orderBy: [{ closedAt: "desc" }, { createdAt: "desc" }],
        include: { owner: { select: { id: true, name: true } } },
      }),
      db.activity.findMany({
        where: { customerId: customer.id, deletedAt: null },
        orderBy: { occurredAt: "desc" },
        take: 40,
        include: {
          user: { select: { name: true } },
          contact: { select: { firstName: true, lastName: true } },
        },
      }),
      db.supportTicket.findMany({
        where: { customerId: customer.id },
        orderBy: { openedAt: "desc" },
        take: 25,
      }),
      db.invoice.findMany({
        where: { customerId: customer.id },
        orderBy: { issuedAt: "desc" },
        take: 25,
      }),
      db.risk.findMany({
        where: {
          customerId: customer.id,
          deletedAt: null,
          status: { in: ["OPEN", "MITIGATING", "MONITORING"] },
        },
        orderBy: { riskScore: "desc" },
        take: 10,
      }),
      db.insight.findMany({
        where: {
          organizationId,
          deletedAt: null,
          entityType: "Customer",
          entityId: customer.id,
          status: { in: ["DETECTED", "REVIEWING", "IN_PROGRESS"] },
        },
        take: 6,
      }),
    ]);

    const openDeals = opportunities.filter(
      (deal) => !["WON", "LOST"].includes(deal.stage),
    );
    const wonDeals = opportunities.filter((deal) => deal.stage === "WON");
    const invoicesTotal = invoices.reduce(
      (acc, invoice) => acc + Number(invoice.total),
      0,
    );
    const overdue = invoices
      .filter(
        (invoice) => invoice.status === "OPEN" && invoice.dueAt < new Date(),
      )
      .reduce((acc, invoice) => acc + Number(invoice.total), 0);
    const openTickets = tickets.filter(
      (ticket) => ticket.status === "OPEN" || ticket.status === "PENDING",
    );
    const breachedTickets = tickets.filter((ticket) => ticket.slaBreached);

    const factors = buildHealthFactors({
      engagementScore: customer.engagementScore,
      revenueScore: customer.revenueScore,
      usageScore: customer.usageScore,
      supportScore: customer.supportScore,
      activityScore: Math.round(
        (customer.engagementScore + customer.usageScore) / 2,
      ),
      details: {
        engagement: `${activities.filter((activity) => activity.type === "MEETING" || activity.type === "QBR" || activity.type === "DEMO").length} meetings and QBRs in the last 90 days`,
        revenue: `ARR ${Number(customer.arr).toLocaleString("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}${Number(customer.expansionMrr) > 0 ? ", expansion recognised" : ", no expansion yet"}`,
        usage: `${customer.activityCount} logged touches · ${openDeals.length} open opportunities`,
        support: `${openTickets.length} open tickets · ${breachedTickets.length} SLA breaches`,
        activity: customer.lastActivityAt
          ? `Last touch ${Math.round((Date.now() - customer.lastActivityAt.getTime()) / 86_400_000)} days ago`
          : "No activity recorded",
      },
    });

    const revenueSeries = await db.metric.findMany({
      where: {
        organizationId,
        key: "revenue_day",
        periodStart: { gte: new Date(Date.now() - 180 * 86_400_000) },
      },
      orderBy: { periodStart: "asc" },
      select: { periodStart: true, value: true },
    });

    return {
      data: {
        customer: {
          ...customer,
          arr: Number(customer.arr),
          mrr: Number(customer.mrr),
          lifetimeValue: Number(customer.lifetimeValue),
          expansionMrr: Number(customer.expansionMrr),
          churnedMrr: Number(customer.churnedMrr),
        },
        health: {
          score: customer.healthScore,
          band: healthBand(customer.healthScore),
          factors,
          churnProbability: customer.churnProbability,
          trend: customer.healthTrend,
        },
        contacts,
        opportunities: opportunities.map((deal) => ({
          ...deal,
          amount: Number(deal.amount),
          weightedAmount: Number(deal.weightedAmount),
        })),
        activities,
        tickets,
        invoices: invoices.map((invoice) => ({
          ...invoice,
          total: Number(invoice.total),
        })),
        risks: risks.map((risk) => ({ ...risk, impact: Number(risk.impact) })),
        insights: insights.map((insight) => ({
          ...insight,
          estimatedImpact: Number(insight.estimatedImpact),
        })),
        finance: {
          invoicesTotal,
          overdue,
          wonValue: wonDeals.reduce(
            (acc, deal) => acc + Number(deal.amount),
            0,
          ),
          openValue: openDeals.reduce(
            (acc, deal) => acc + Number(deal.amount),
            0,
          ),
        },
        revenueSeries: revenueSeries.map((point) => ({
          period: point.periodStart,
          value: Number(point.value),
        })),
      },
    };
  },
});

export const PATCH = route({
  permission: "customers:write",
  body: customerUpdateSchema,
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.customer.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Customer");

    const customer = await db.customer.update({
      where: { id: existing.id },
      data: {
        ...body,
        arr:
          body.arr === undefined || body.arr === null
            ? undefined
            : Number(body.arr),
        mrr:
          body.mrr !== undefined && body.mrr !== null
            ? Number(body.mrr)
            : body.arr !== undefined && body.arr !== null
              ? Math.round(Number(body.arr) / 12)
              : undefined,
        renewalDate: body.renewalDate
          ? new Date(body.renewalDate)
          : body.renewalDate === null
            ? null
            : undefined,
        contractStart: body.contractStart
          ? new Date(body.contractStart)
          : body.contractStart === null
            ? null
            : undefined,
      },
    });

    await auditAs(auth, {
      action: "customer.updated",
      entityType: "customer",
      entityId: existing.id,
      entityLabel: existing.name,
      before: {
        name: existing.name,
        status: existing.status,
        segment: existing.segment,
        arr: Number(existing.arr),
        ownerId: existing.ownerId,
        csmId: existing.csmId,
      },
      after: {
        name: customer.name,
        status: customer.status,
        segment: customer.segment,
        arr: Number(customer.arr),
        ownerId: customer.ownerId,
        csmId: customer.csmId,
      },
    });

    return {
      data: {
        ...customer,
        arr: Number(customer.arr),
        mrr: Number(customer.mrr),
      },
    };
  },
});

export const DELETE = route({
  permission: "customers:delete",
  rateLimit: "write",
  handler: async ({ auth, params, db }) => {
    const existing = await db.customer.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Customer");
    // Soft delete keeps history intact for audits and trend charts.
    await db.customer.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await auditAs(auth, {
      action: "customer.deleted",
      entityType: "customer",
      entityId: existing.id,
      entityLabel: existing.name,
      severity: "WARNING",
    });
    return { data: { id: existing.id, deleted: true } };
  },
});
