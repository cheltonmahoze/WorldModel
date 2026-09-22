import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { runOpportunityEngine } from "@/server/engines/insights";
import { runRiskEngine } from "@/server/engines/risks";
import { generateAndStoreBrief } from "@/server/engines/brief";
import { computeRevenueSnapshot, persistMetric, resolveWindow } from "@/server/engines/metrics";
import { notify } from "@/server/services/notifications";
import { runAutomations } from "@/server/services/automations";
import { dispatchWebhooks } from "@/server/services/webhooks";
import { recordAudit } from "@/server/audit";

export type EngineRunSummary = {
  organizationId: string;
  startedAt: string;
  durationMs: number;
  insights: { detected: number; created: number; updated: number; closed: number };
  risks: { detected: number; created: number; updated: number; resolved: number };
  brief?: { id: string; headline: string; confidence: number };
  automationsTriggered: number;
  notificationsCreated: number;
  scanned: Record<string, number>;
};

type EngineName = "opportunity" | "risk" | "brief" | "metrics";

/**
 * Intelligence orchestrator.
 *
 * Runs the engines against live tenant data and persists their findings.
 * Idempotent by fingerprint: re-running never duplicates an insight or a risk,
 * and human-owned state (status, owner, notes) is always preserved.
 */
export async function runIntelligence(
  organizationId: string,
  options: { engines?: EngineName[]; actorId?: string | null; actorName?: string; source?: "WEB" | "API" | "SYSTEM" | "AUTOMATION" } = {},
): Promise<EngineRunSummary> {
  const startedAt = Date.now();
  const engines = options.engines ?? ["opportunity", "risk", "brief", "metrics"];
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });

  const summary: EngineRunSummary = {
    organizationId,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: 0,
    insights: { detected: 0, created: 0, updated: 0, closed: 0 },
    risks: { detected: 0, created: 0, updated: 0, resolved: 0 },
    automationsTriggered: 0,
    notificationsCreated: 0,
    scanned: {},
  };

  const newHighPriorityInsights: { id: string; title: string; impact: number; priority: string }[] = [];
  const newHighSeverityRisks: { id: string; title: string; severity: string; impact: number }[] = [];

  /* ── Opportunity Engine ────────────────────────────────────────────────── */
  if (engines.includes("opportunity") && organization.aiEngineEnabled) {
    const { candidates, scanned } = await runOpportunityEngine(organizationId);
    summary.scanned = { ...summary.scanned, ...scanned };
    summary.insights.detected = candidates.length;
    const seen = new Set<string>();

    for (const candidate of candidates) {
      seen.add(candidate.fingerprint);
      const existing = await db.insight.findUnique({
        where: { organizationId_fingerprint: { organizationId, fingerprint: candidate.fingerprint } },
      });

      if (!existing) {
        const created = await db.insight.create({
          data: {
            organizationId,
            fingerprint: candidate.fingerprint,
            title: candidate.title,
            summary: candidate.summary,
            category: candidate.category,
            estimatedImpact: candidate.impact,
            confidence: candidate.confidence,
            priorityScore: candidate.priorityScore,
            priority: candidate.priority,
            source: candidate.source,
            signal: candidate.signal as Prisma.InputJsonValue,
            recommendation: candidate.recommendation,
            actions: candidate.actions as unknown as Prisma.InputJsonValue,
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            relatedCount: candidate.relatedCount,
            ownerId: candidate.ownerId ?? null,
            dueAt: candidate.dueAt ?? null,
          },
        });
        summary.insights.created++;
        if (candidate.priority === "CRITICAL" || candidate.priority === "HIGH") {
          newHighPriorityInsights.push({
            id: created.id,
            title: candidate.title,
            impact: candidate.impact,
            priority: candidate.priority,
          });
        }
        await runAutomations(
          organizationId,
          {
            type: "opportunity_detected",
            entityType: "Insight",
            entityId: created.id,
            entityLabel: candidate.title,
            data: {
              id: created.id,
              title: candidate.title,
              category: candidate.category,
              impact: candidate.impact,
              confidence: candidate.confidence,
              priority: candidate.priority,
            },
          },
          { triggeredBy: "opportunity_engine" },
        );
      } else {
        const keepStatus = existing.status !== "DETECTED";
        await db.insight.update({
          where: { id: existing.id },
          data: {
            title: candidate.title,
            summary: candidate.summary,
            estimatedImpact: candidate.impact,
            confidence: candidate.confidence,
            priorityScore: candidate.priorityScore,
            priority: candidate.priority,
            signal: candidate.signal as Prisma.InputJsonValue,
            recommendation: candidate.recommendation,
            actions: candidate.actions as unknown as Prisma.InputJsonValue,
            relatedCount: candidate.relatedCount,
            status: existing.status === "COMPLETED" || existing.status === "DISMISSED" ? existing.status : existing.status,
            ...(keepStatus ? {} : {}),
          },
        });
        summary.insights.updated++;
      }
    }

    // Auto-close detections whose underlying condition no longer holds.
    const stale = await db.insight.findMany({
      where: { organizationId, deletedAt: null, status: "DETECTED", fingerprint: { notIn: [...seen] } },
      select: { id: true },
    });
    if (stale.length) {
      await db.insight.updateMany({
        where: { id: { in: stale.map((row) => row.id) } },
        data: {
          status: "DISMISSED",
          dismissedAt: new Date(),
          reviewNotes: "Closed automatically — the underlying condition no longer holds in the latest data.",
        },
      });
      summary.insights.closed = stale.length;
    }
  }

  /* ── Risk Engine ───────────────────────────────────────────────────────── */
  if (engines.includes("risk") && organization.aiEngineEnabled) {
    const { candidates, scanned } = await runRiskEngine(organizationId);
    summary.scanned = { ...summary.scanned, ...scanned };
    summary.risks.detected = candidates.length;
    const seen = new Set<string>();

    for (const candidate of candidates) {
      seen.add(candidate.fingerprint);
      const existing = await db.risk.findUnique({
        where: { organizationId_fingerprint: { organizationId, fingerprint: candidate.fingerprint } },
      });
      const score = Math.min(99, Math.round(40 + Math.log10(Math.max(1, candidate.impact)) * 8 + candidate.probability * 0.15));

      if (!existing) {
        const created = await db.risk.create({
          data: {
            organizationId,
            fingerprint: candidate.fingerprint,
            title: candidate.title,
            description: candidate.description,
            category: candidate.category,
            severity: candidate.severity,
            probability: candidate.probability,
            impact: candidate.impact,
            riskScore: score,
            mitigation: candidate.mitigation,
            recommendation: candidate.recommendation,
            customerId: candidate.customerId ?? null,
            opportunityId: candidate.opportunityId ?? null,
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            ownerId: candidate.ownerId ?? null,
            dueAt: candidate.dueAt ?? null,
            detectedBy: candidate.detectedBy,
          },
        });
        summary.risks.created++;
        if (candidate.severity === "CRITICAL" || candidate.severity === "HIGH") {
          newHighSeverityRisks.push({
            id: created.id,
            title: candidate.title,
            severity: candidate.severity,
            impact: candidate.impact,
          });
        }
        await runAutomations(
          organizationId,
          {
            type: "risk_detected",
            entityType: "Risk",
            entityId: created.id,
            entityLabel: candidate.title,
            data: {
              id: created.id,
              title: candidate.title,
              category: candidate.category,
              severity: candidate.severity,
              impact: candidate.impact,
              probability: candidate.probability,
              customerId: candidate.customerId,
            },
          },
          { triggeredBy: "risk_engine" },
        );
        await dispatchWebhooks({
          organizationId,
          event: "risk.detected",
          payload: { riskId: created.id, title: candidate.title, severity: candidate.severity, impact: candidate.impact },
        });
      } else {
        await db.risk.update({
          where: { id: existing.id },
          data: {
            title: candidate.title,
            description: candidate.description,
            severity: candidate.severity,
            probability: candidate.probability,
            impact: candidate.impact,
            riskScore: score,
            mitigation: candidate.mitigation,
            recommendation: candidate.recommendation,
          },
        });
        summary.risks.updated++;
      }
    }

    const resolved = await db.risk.findMany({
      where: { organizationId, deletedAt: null, status: "OPEN", fingerprint: { notIn: [...seen] } },
      select: { id: true },
    });
    if (resolved.length) {
      await db.risk.updateMany({
        where: { id: { in: resolved.map((row) => row.id) } },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
      summary.risks.resolved = resolved.length;
    }
  }

  /* ── Notifications for material findings ───────────────────────────────── */
  for (const insight of newHighPriorityInsights.slice(0, 3)) {
    const created = await notify({
      organizationId,
      roles: ["OWNER", "ADMIN", "MANAGER"],
      type: "OPPORTUNITY_DETECTED",
      title: insight.title,
      body: `Estimated impact €${Math.round(insight.impact).toLocaleString("en-GB")} · ${insight.priority.toLowerCase()} priority. Open the Opportunity Engine to assign an owner.`,
      severity: insight.priority === "CRITICAL" ? "CRITICAL" : "HIGH",
      entityType: "Insight",
      entityId: insight.id,
      actionUrl: `/opportunities/${insight.id}`,
    });
    summary.notificationsCreated += created.length;
    await dispatchWebhooks({
      organizationId,
      event: "insight.detected",
      payload: { insightId: insight.id, title: insight.title, impact: insight.impact, priority: insight.priority },
    });
  }

  for (const risk of newHighSeverityRisks.slice(0, 3)) {
    const created = await notify({
      organizationId,
      roles: ["OWNER", "ADMIN", "MANAGER"],
      type: "RISK_DETECTED",
      title: risk.title,
      body: `Exposure €${Math.round(risk.impact).toLocaleString("en-GB")} · ${risk.severity.toLowerCase()} severity. Assign an owner and a mitigation date.`,
      severity: risk.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
      entityType: "Risk",
      entityId: risk.id,
      actionUrl: `/risks/${risk.id}`,
    });
    summary.notificationsCreated += created.length;
  }

  /* ── Executive Brief ───────────────────────────────────────────────────── */
  if (engines.includes("brief") && organization.aiEngineEnabled) {
    const { brief } = await generateAndStoreBrief(organizationId, options.actorId ?? null);
    summary.brief = { id: brief.id, headline: brief.headline, confidence: brief.confidence };
    await dispatchWebhooks({
      organizationId,
      event: "report.generated",
      payload: { briefId: brief.id, headline: brief.headline },
    });
  }

  /* ── Metric snapshot for the day ───────────────────────────────────────── */
  if (engines.includes("metrics")) {
    const snapshot = await computeRevenueSnapshot(organizationId, resolveWindow("90d"));
    const today = new Date();
    const periodStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const series: [string, number, string][] = [
      ["revenue_period", snapshot.revenue, "EUR"],
      ["pipeline_open", snapshot.pipelineOpen, "EUR"],
      ["pipeline_weighted", snapshot.pipelineWeighted, "EUR"],
      ["win_rate", snapshot.winRate, "%"],
      ["conversion_rate", snapshot.conversionRate, "%"],
      ["mrr", snapshot.mrr, "EUR"],
      ["arr", snapshot.arr, "EUR"],
      ["operational_efficiency", snapshot.operationalEfficiency, "%"],
      ["at_risk_customers", snapshot.atRiskCustomers, "count"],
      ["pipeline_stalled", snapshot.pipelineStalled, "EUR"],
    ];
    for (const [key, value, unit] of series) {
      await persistMetric({ organizationId, key, value, unit, periodStart, granularity: "DAY", source: "engine" });
    }
  }

  summary.durationMs = Date.now() - startedAt;

  await recordAudit({
    organizationId,
    actorId: options.actorId ?? null,
    actorName: options.actorName ?? "Nexus Intelligence",
    actorRole: "SYSTEM",
    action: "engines.run",
    entityType: "Organization",
    entityId: organizationId,
    entityLabel: organization.name,
    after: summary as unknown as Prisma.InputJsonValue,
    severity: "INFO",
    source: options.source ?? "SYSTEM",
  });

  // Automation counters for the "engines triggered automations" surface.
  summary.automationsTriggered = newHighPriorityInsights.length + newHighSeverityRisks.length;

  return summary;
}

export * from "./insights";
export * from "./risks";
export * from "./metrics";
export * from "./health";
export * from "./brief";
