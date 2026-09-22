import { route } from "@/server/api";
import { searchSchema } from "@/server/validation";

export const GET = route({
  query: searchSchema,
  handler: async ({ auth, query, db }) => {
    const organizationId = auth.organization.id;
    const contains = { contains: query.q, mode: "insensitive" as const };
    const limit = query.limit;

    const [customers, opportunities, risks, users, automations] =
      await Promise.all([
        db.customer.findMany({
          where: {
            organizationId,
            deletedAt: null,
            OR: [
              { name: contains },
              { domain: contains },
              { industry: contains },
            ],
          },
          take: limit,
          select: {
            id: true,
            name: true,
            segment: true,
            arr: true,
            healthScore: true,
          },
        }),
        db.opportunity.findMany({
          where: {
            organizationId,
            deletedAt: null,
            OR: [
              { name: contains },
              { code: contains },
              { customer: { name: contains } },
            ],
          },
          take: limit,
          select: {
            id: true,
            name: true,
            code: true,
            stage: true,
            amount: true,
          },
        }),
        db.risk.findMany({
          where: {
            organizationId,
            deletedAt: null,
            status: { in: ["OPEN", "MITIGATING", "MONITORING"] },
            OR: [{ title: contains }, { description: contains }],
          },
          take: limit,
          select: { id: true, title: true, severity: true, category: true },
        }),
        db.membership.findMany({
          where: {
            organizationId,
            status: "ACTIVE",
            deletedAt: null,
            user: { OR: [{ name: contains }, { email: contains }] },
          },
          take: limit,
          select: {
            user: {
              select: { id: true, name: true, email: true, jobTitle: true },
            },
          },
        }),
        db.automation.findMany({
          where: {
            organizationId,
            deletedAt: null,
            OR: [{ name: contains }, { description: contains }],
          },
          take: limit,
          select: { id: true, name: true, status: true, triggerType: true },
        }),
      ]);

    return {
      data: {
        groups: [
          {
            key: "customers",
            label: "Customers",
            items: customers.map((customer) => ({
              id: customer.id,
              label: customer.name,
              sublabel: `${customer.segment.replace("_", " ").toLowerCase()} · ${Math.round(Number(customer.arr)).toLocaleString("en-GB")} ARR · health ${customer.healthScore}`,
              href: `/customers/${customer.id}`,
            })),
          },
          {
            key: "opportunities",
            label: "Opportunities",
            items: opportunities.map((deal) => ({
              id: deal.id,
              label: deal.name,
              sublabel: `${deal.code} · ${deal.stage.replace("_", " ").toLowerCase()} · €${Math.round(Number(deal.amount)).toLocaleString("en-GB")}`,
              href: `/opportunities/${deal.id}`,
            })),
          },
          {
            key: "risks",
            label: "Risks",
            items: risks.map((risk) => ({
              id: risk.id,
              label: risk.title,
              sublabel: `${risk.severity.toLowerCase()} · ${risk.category.replace("_", " ").toLowerCase()}`,
              href: `/risks/${risk.id}`,
            })),
          },
          {
            key: "users",
            label: "People",
            items: users.map((row) => ({
              id: row.user.id,
              label: row.user.name,
              sublabel: row.user.jobTitle ?? row.user.email,
              href: `/team/${row.user.id}`,
            })),
          },
          {
            key: "automations",
            label: "Automations",
            items: automations.map((automation) => ({
              id: automation.id,
              label: automation.name,
              sublabel: `${automation.status.toLowerCase()} · triggered by ${automation.triggerType.replace(/_/g, " ")}`,
              href: `/automations/${automation.id}`,
            })),
          },
        ].filter((group) => group.items.length),
        query: query.q,
      },
    };
  },
});
