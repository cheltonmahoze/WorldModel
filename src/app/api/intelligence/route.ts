import { route } from "@/server/api";
import { z } from "zod";

const querySchema = z.object({
  window: z.enum(["30d", "90d", "qtd", "ytd", "12m"]).default("90d"),
});

export const GET = route({
  query: querySchema,
  handler: async ({ auth, db }) => {
    const organizationId = auth.organization.id;
    const [brief, insights, risks, lastRun] = await Promise.all([
      db.aiBrief.findFirst({
        where: { organizationId },
        orderBy: { generatedAt: "desc" },
      }),
      db.insight.findMany({
        where: {
          organizationId,
          status: { in: ["DETECTED", "REVIEWING", "IN_PROGRESS"] },
        },
        orderBy: [{ priorityScore: "desc" }],
        take: 12,
      }),
      db.risk.findMany({
        where: {
          organizationId,
          status: { in: ["OPEN", "MITIGATING", "MONITORING"] },
        },
        orderBy: [{ riskScore: "desc" }],
        take: 6,
        select: {
          id: true,
          title: true,
          severity: true,
          category: true,
          impact: true,
          probability: true,
          riskScore: true,
        },
      }),
      db.auditLog.findFirst({
        where: { organizationId, action: "engines.run" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, actorName: true },
      }),
    ]);

    const totals = insights.reduce(
      (acc, insight) => {
        acc.impact += Number(insight.estimatedImpact);
        acc.byCategory[insight.category] =
          (acc.byCategory[insight.category] ?? 0) + 1;
        return acc;
      },
      { impact: 0, byCategory: {} as Record<string, number> },
    );

    return {
      data: {
        brief: brief
          ? {
              id: brief.id,
              headline: brief.headline,
              periodStart: brief.periodStart,
              periodEnd: brief.periodEnd,
              whatChanged: brief.whatChanged,
              whyItMatters: brief.whyItMatters,
              attention: brief.attention,
              recommendations: brief.recommendations,
              metrics: brief.metrics,
              engine: brief.engine,
              confidence: brief.confidence,
              generatedAt: brief.generatedAt,
            }
          : null,
        insights,
        risks,
        totals,
        lastRun,
      },
    };
  },
});
