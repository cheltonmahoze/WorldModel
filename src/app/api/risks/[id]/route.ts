import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { riskUpdateSchema } from "@/server/validation";
import { riskScore } from "@/server/engines/risks";

export const GET = route({
  handler: async ({ auth, params, db }) => {
    const risk = await db.risk.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        customer: {
          select: { id: true, name: true, arr: true, healthScore: true },
        },
        opportunity: {
          select: {
            id: true,
            name: true,
            code: true,
            amount: true,
            stage: true,
          },
        },
      },
    });
    if (!risk) throw AppError.notFound("Risk");
    const related = await db.risk.count({
      where: {
        organizationId: auth.organization.id,
        detectedBy: risk.detectedBy,
        deletedAt: null,
        status: { in: ["OPEN", "MITIGATING", "MONITORING"] },
      },
    });
    return {
      data: { ...risk, impact: Number(risk.impact), relatedCount: related },
    };
  },
});

export const PATCH = route({
  permission: "risks:write",
  body: riskUpdateSchema,
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.risk.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Risk");

    const impact =
      body.impact === undefined || body.impact === null
        ? Number(existing.impact)
        : Number(body.impact);
    const probability = body.probability ?? existing.probability;
    const updated = await db.risk.update({
      where: { id: existing.id },
      data: {
        ...body,
        impact:
          body.impact === undefined || body.impact === null
            ? undefined
            : Number(body.impact),
        dueAt: body.dueAt
          ? new Date(body.dueAt)
          : body.dueAt === null
            ? null
            : undefined,
        riskScore:
          body.impact !== undefined || body.probability !== undefined
            ? riskScore(impact, probability)
            : undefined,
        resolvedAt:
          body.status === "RESOLVED" || body.status === "ACCEPTED"
            ? new Date()
            : existing.resolvedAt,
      },
    });

    await auditAs(auth, {
      action: "risk.updated",
      entityType: "risk",
      entityId: existing.id,
      entityLabel: existing.title,
      before: {
        status: existing.status,
        severity: existing.severity,
        probability: existing.probability,
        impact: Number(existing.impact),
      },
      after: {
        status: updated.status,
        severity: updated.severity,
        probability: updated.probability,
        impact: Number(updated.impact),
      },
    });

    return { data: { ...updated, impact: Number(updated.impact) } };
  },
});
