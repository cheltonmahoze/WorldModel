import { route } from "@/server/api";
import { paginationFrom, paginated } from "@/server/api";
import { riskCreateSchema, riskFilterSchema } from "@/server/validation";
import { auditAs } from "@/server/audit";
import { riskScore, severityFromRiskScore } from "@/server/engines/risks";
import type { Prisma } from "@prisma/client";

export const GET = route({
  query: riskFilterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take, orderBy } = paginationFrom(query);
    const where: Prisma.RiskWhereInput = {
      organizationId: auth.organization.id,
      deletedAt: null,
      ...(query.status
        ? { status: query.status }
        : { status: { in: ["OPEN", "MITIGATING", "MONITORING"] } }),
      ...(query.category ? { category: query.category } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total, bySeverity, byCategory] = await Promise.all([
      db.risk.findMany({
        where,
        orderBy: { ...orderBy, riskScore: "desc" },
        skip,
        take,
        include: {
          owner: { select: { id: true, name: true, avatarUrl: true } },
          customer: { select: { id: true, name: true, arr: true } },
          opportunity: {
            select: { id: true, name: true, code: true, amount: true },
          },
        },
      }),
      db.risk.count({ where }),
      db.risk.groupBy({
        by: ["severity"],
        where: {
          organizationId: auth.organization.id,
          deletedAt: null,
          status: { in: ["OPEN", "MITIGATING", "MONITORING"] },
        },
        _count: true,
        _sum: { impact: true },
      }),
      db.risk.groupBy({
        by: ["category"],
        where: {
          organizationId: auth.organization.id,
          deletedAt: null,
          status: { in: ["OPEN", "MITIGATING", "MONITORING"] },
        },
        _count: true,
        _sum: { impact: true },
      }),
    ]);

    return paginated(
      items.map((risk) => ({ ...risk, impact: Number(risk.impact) })),
      total,
      page,
      pageSize,
      {
        bySeverity: bySeverity.map((row) => ({
          severity: row.severity,
          count: row._count,
          impact: Number(row._sum.impact ?? 0),
        })),
        byCategory: byCategory.map((row) => ({
          category: row.category,
          count: row._count,
          impact: Number(row._sum.impact ?? 0),
        })),
        totalImpact: byCategory.reduce(
          (acc, row) => acc + Number(row._sum.impact ?? 0),
          0,
        ),
      },
    );
  },
});

export const POST = route({
  permission: "risks:write",
  body: riskCreateSchema,
  rateLimit: "write",
  handler: async ({ auth, body, db }) => {
    const impact = Number(body.impact);
    const score = riskScore(impact, body.probability);
    const risk = await db.risk.create({
      data: {
        organizationId: auth.organization.id,
        title: body.title,
        description: body.description,
        category: body.category,
        severity: body.severity ?? severityFromRiskScore(score),
        probability: body.probability,
        impact,
        riskScore: score,
        mitigation: body.mitigation ?? null,
        recommendation: body.recommendation ?? null,
        ownerId: body.ownerId ?? auth.user.id,
        customerId: body.customerId ?? null,
        opportunityId: body.opportunityId ?? null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        detectedBy: "manual",
        fingerprint: `manual:${Date.now()}`,
      },
    });

    await auditAs(auth, {
      action: "risk.created",
      entityType: "risk",
      entityId: risk.id,
      entityLabel: risk.title,
      after: { severity: risk.severity, impact, category: risk.category },
    });

    return { data: { ...risk, impact: Number(risk.impact) } };
  },
});
