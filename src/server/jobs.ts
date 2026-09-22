import type { Job, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { auditSystem } from "@/server/audit";
import { notify } from "@/server/services/notifications";
import { runReport } from "@/server/services/reports";
import { syncIntegration } from "@/server/services/integrations";
import { runIntelligence } from "@/server/engines";
import { computeRevenueSnapshot, persistMetric, resolveWindow } from "@/server/engines/metrics";
import { planFor } from "@/lib/plans";

export type JobType =
  | "INTELLIGENCE"
  | "METRICS"
  | "INTEGRATION_SYNC"
  | "REPORT"
  | "WEBHOOK"
  | "MAINTENANCE"
  | "BILLING"
  | "NOTIFICATION";

export type JobHandler = {
  /** Canonical name stored on the Job row. `*` matches a provider segment. */
  name: string;
  type: JobType;
  title: string;
  description: string;
  /** Human schedule hint shown in the operations console. */
  cadence: string;
  /** True when the handler needs an organizationId in `payload`. */
  requiresOrganization?: boolean;
};

/**
 * The worker's contract. Anything the platform needs to do off-request is
 * declared here, seeded into `Job` rows and executed by `scripts/worker.ts`, so
 * there is one vocabulary for queueing, retrying and observing background work.
 */
export const JOB_HANDLERS: JobHandler[] = [
  {
    name: "intelligence.engines",
    type: "INTELLIGENCE",
    title: "Intelligence scan",
    description: "Re-runs the opportunity, risk and brief engines against live tenant data and stores the findings.",
    cadence: "Every 6 hours",
    requiresOrganization: true,
  },
  {
    name: "risk-engine.rescore",
    type: "INTELLIGENCE",
    title: "Risk rescore",
    description: "Recomputes risk scores and exposure after data changes, preserving human-owned status and owners.",
    cadence: "Every hour",
    requiresOrganization: true,
  },
  {
    name: "metrics.rollup",
    type: "METRICS",
    title: "Metrics rollup",
    description: "Snapshots revenue, pipeline, win rate and MRR into the metric store for trend and cohort analysis.",
    cadence: "Daily at 02:00",
    requiresOrganization: true,
  },
  {
    name: "integrations.*.sync",
    type: "INTEGRATION_SYNC",
    title: "Connector sync",
    description: "Runs the incremental sync for a connector (Salesforce, HubSpot, Stripe, Zendesk…) and records failures.",
    cadence: "Per connector frequency",
    requiresOrganization: true,
  },
  {
    name: "reports.scheduled.daily",
    type: "REPORT",
    title: "Scheduled reports",
    description: "Generates every report marked DAILY, stores the run and notifies the recipients.",
    cadence: "Daily at 07:00",
    requiresOrganization: true,
  },
  {
    name: "webhooks.dispatch.retry",
    type: "WEBHOOK",
    title: "Webhook retry",
    description: "Retries webhook deliveries that failed with a 4xx/5xx or a timeout, with the original payload.",
    cadence: "Every 15 minutes",
    requiresOrganization: true,
  },
  {
    name: "billing.usage.rollup",
    type: "BILLING",
    title: "Usage rollup",
    description: "Reconciles seats, records and connector usage against the plan limits and writes usage events.",
    cadence: "Hourly",
    requiresOrganization: true,
  },
  {
    name: "notifications.digest",
    type: "NOTIFICATION",
    title: "Notification digest",
    description: "Builds the unread digest for owners and admins so nothing critical sits unseen.",
    cadence: "Daily at 08:00",
    requiresOrganization: true,
  },
  {
    name: "audit.retention.prune",
    type: "MAINTENANCE",
    title: "Audit retention prune",
    description: "Deletes audit entries older than the retention window of the workspace plan.",
    cadence: "Weekly",
    requiresOrganization: true,
  },
];

/**
 * Resolves the handler for a job name. Exact matches win, then wildcard matches with the same
 * number of segments (`integrations.salesforce.sync` → `integrations.*.sync`), then prefix matches
 * so queued variants such as `reports.scheduled.sprint` still land on the scheduled reporter.
 */
export function handlerFor(name: string) {
  const exact = JOB_HANDLERS.find((handler) => handler.name === name);
  if (exact) return exact;

  const segments = name.split(".");
  const wildcard = JOB_HANDLERS.find((handler) => {
    const pattern = handler.name.split(".");
    return pattern.length === segments.length
      && pattern.every((segment, index) => segment === "*" || segment === segments[index]);
  });
  if (wildcard) return wildcard;

  const prefix = segments[0];
  return JOB_HANDLERS.find((handler) => handler.name.startsWith(`${prefix}.`));
}

export type JobOutcome = {
  ok: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
};

/** Executes one queued job. Handlers are idempotent: retries are always safe. */
export async function runJob(job: Job): Promise<JobOutcome> {
  const organizationId = job.organizationId;
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const requireOrg = () => {
    if (!organizationId) throw new Error(`Job ${job.name} requires an organizationId`);
    return organizationId;
  };

  switch (job.name) {
    case "intelligence.engines":
    case "risk-engine.rescore": {
      const orgId = requireOrg();
      const engines = job.name === "intelligence.engines" ? undefined : (["risk"] as const);
      const run = await runIntelligence(orgId, {
        engines: engines ? [...engines] : undefined,
        source: "SYSTEM",
        actorName: "Nexus Worker",
      });
      return {
        ok: true,
        summary: job.name === "intelligence.engines"
          ? `Scanned ${Object.values(run.scanned).reduce((acc, value) => acc + value, 0)} records · ${run.insights.created + run.insights.updated} opportunities · ${run.risks.created + run.risks.updated} risks`
          : `Re-scored risks: ${run.risks.detected} evaluated, ${run.risks.updated} updated`,
        data: {
          insights: run.insights,
          risks: run.risks,
          automationsTriggered: run.automationsTriggered,
          durationMs: run.durationMs,
        },
      };
    }

    case "metrics.rollup": {
      const orgId = requireOrg();
      const snapshot = await computeRevenueSnapshot(orgId, resolveWindow("12m"));
      const periodStart = new Date();
      periodStart.setUTCHours(0, 0, 0, 0);
      const metrics: [string, string, number, string][] = [
        ["revenue", "Revenue (12m)", snapshot.revenue, "EUR"],
        ["pipeline", "Open pipeline", snapshot.pipelineOpen, "EUR"],
        ["win_rate", "Win rate", snapshot.winRate, "%"],
        ["mrr", "MRR", snapshot.mrr, "EUR"],
        ["arr", "ARR", snapshot.arr, "EUR"],
        ["nrr", "Net revenue retention", snapshot.nrr, "%"],
      ];
      await Promise.all(
        metrics.map(([key, label, value, unit]) =>
          persistMetric({ organizationId: orgId, key, label, value, unit, periodStart, source: "worker" }),
        ),
      );
      return {
        ok: true,
        summary: `Rolled up ${metrics.length} metrics for ${periodStart.toISOString().slice(0, 10)}`,
        data: { metrics: metrics.map(([key, , value]) => ({ key, value })) },
      };
    }

    case "integrations.*.sync": {
      const orgId = requireOrg();
      const provider = typeof payload.provider === "string"
        ? payload.provider
        : job.name.split(".")[1];
      const integration = await db.integration.findFirst({
        where: { organizationId: orgId, provider },
      });
      if (!integration) {
        return { ok: false, summary: `No ${provider} connector is configured in this workspace`, error: "CONNECTOR_NOT_FOUND" };
      }
      const result = await syncIntegration({
        organizationId: orgId,
        integrationId: integration.id,
        source: "SYSTEM",
      });
      return {
        ok: result.status === "SUCCEEDED",
        summary: result.summary,
        data: { provider, recordsSynced: result.recordsSynced, durationMs: result.durationMs, status: result.status },
        error: result.status === "FAILED" ? "SYNC_FAILED" : undefined,
      };
    }

    case "reports.scheduled.daily":
    case "reports.scheduled.weekly":
    case "reports.scheduled.monthly": {
      const orgId = requireOrg();
      const schedule = job.name.endsWith("daily") ? "DAILY" : job.name.endsWith("weekly") ? "WEEKLY" : "MONTHLY";
      const reports = await db.report.findMany({
        where: { organizationId: orgId, deletedAt: null, schedule },
        take: 25,
      });
      if (!reports.length) return { ok: true, summary: `No ${schedule.toLowerCase()} reports are scheduled`, data: { reportCount: 0 } };

      const runs: { name: string; rows: number }[] = [];
      for (const report of reports) {
        const result = await runReport(orgId, report.id);
        runs.push({ name: report.name, rows: result.rows.length });
        await notify({
          organizationId: orgId,
          type: "REPORT_GENERATED",
          title: `${report.name} is ready`,
          body: `${result.rows.length} rows generated by the ${schedule.toLowerCase()} schedule.`,
          entityType: "report",
          entityId: report.id,
          actionUrl: `/reports?report=${report.id}`,
          metadata: { rows: result.rows.length, schedule },
        }).catch(() => undefined);
      }
      return { ok: true, summary: `Generated ${runs.length} ${schedule.toLowerCase()} report(s)`, data: { runs } };
    }

    case "webhooks.dispatch.retry": {
      const orgId = requireOrg();
      const failed = await db.webhookDelivery.findMany({
        where: { organizationId: orgId, status: "failed" },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      if (!failed.length) return { ok: true, summary: "No failed deliveries to retry", data: { retried: 0 } };

      const results = await Promise.all(
        failed.map(async (delivery) => {
          const webhook = await db.webhook.findFirst({ where: { id: delivery.webhookId, organizationId: orgId } });
          if (!webhook || !webhook.active) return { id: delivery.id, status: "skipped" };
          const startedAt = Date.now();
          let status = "failed";
          let responseCode: number | null = null;
          let error: string | null = null;
          try {
            const response = await fetch(webhook.url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "user-agent": "NexusOS-Webhooks/1.0",
                "x-nexus-event": delivery.event,
                "x-nexus-retry": delivery.id,
              },
              body: JSON.stringify(delivery.payload ?? {}),
              signal: AbortSignal.timeout(5000),
            });
            responseCode = response.status;
            status = response.ok ? "delivered" : "failed";
          } catch (cause) {
            error = cause instanceof Error ? cause.message : "network error";
          }
          await db.webhookDelivery.create({
            data: {
              organizationId: orgId,
              webhookId: webhook.id,
              event: delivery.event,
              status,
              responseCode,
              durationMs: Date.now() - startedAt,
              payload: (delivery.payload ?? {}) as Prisma.InputJsonValue,
              error,
            },
          });
          return { id: delivery.id, status, responseCode };
        }),
      );
      const delivered = results.filter((row) => row.status === "delivered").length;
      return {
        ok: true,
        summary: `Retried ${results.length} delivery(s) — ${delivered} delivered`,
        data: { retried: results.length, delivered, results },
      };
    }

    case "billing.usage.rollup": {
      const orgId = requireOrg();
      const organization = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
      const plan = planFor(organization.plan);
      const [seats, customers, records, connectorRuns] = await Promise.all([
        db.membership.count({ where: { organizationId: orgId, status: "ACTIVE", deletedAt: null } }),
        db.customer.count({ where: { organizationId: orgId, deletedAt: null } }),
        db.opportunity.count({ where: { organizationId: orgId } }),
        db.integration.count({ where: { organizationId: orgId, status: "CONNECTED" } }),
      ]);
      const limits = plan.limits;
      const inclusive = (limit: number) => limit >= Number.MAX_SAFE_INTEGER;
      const overage = (used: number, limit: number) =>
        !inclusive(limit) && limit > 0 && used > limit ? used - limit : 0;
      const overages = {
        seats: overage(seats, limits.seats),
        customers: overage(customers, limits.customers),
        opportunities: overage(records, limits.opportunities),
      };
      await db.usageEvent.createMany({
        data: [
          { organizationId: orgId, key: "active_seats", quantity: seats, metadata: { plan: organization.plan } },
          { organizationId: orgId, key: "customers", quantity: customers, metadata: { plan: organization.plan } },
          { organizationId: orgId, key: "tracked_records", quantity: records + customers, metadata: { plan: organization.plan } },
          { organizationId: orgId, key: "connected_connectors", quantity: connectorRuns, metadata: { plan: organization.plan } },
        ],
      });
      const totalOverages = overages.seats + overages.customers + overages.opportunities;
      return {
        ok: true,
        summary: totalOverages
          ? `${totalOverages} unit(s) above the ${organization.plan} allowance — billing review recommended`
          : `Usage within the ${organization.plan} allowance`,
        data: { seats, customers, records, connectorRuns, overages },
        // Seats, tracked customers and opportunities compared against the plan allowance.
      };
    }

    case "notifications.digest": {
      const orgId = requireOrg();
      const unread = await db.notification.count({
        where: { organizationId: orgId, readAt: null, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
      });
      const critical = await db.notification.count({
        where: { organizationId: orgId, readAt: null, severity: { in: ["HIGH", "CRITICAL"] } },
      });
      if (!unread) return { ok: true, summary: "Nothing unread in the last 24h — no digest sent", data: { unread: 0 } };
      await notify({
        organizationId: orgId,
        roles: ["OWNER", "ADMIN"],
        type: "SYSTEM",
        title: `Daily digest: ${unread} unread update${unread === 1 ? "" : "s"}`,
        body: critical
          ? `${critical} of them are high severity. Open the notification centre to triage.`
          : "Open the notification centre to review this morning's intelligence, risks and automation runs.",
        entityType: "notification",
        actionUrl: "/notifications",
        metadata: { unread, critical, window: "24h" },
      });
      return { ok: true, summary: `Digest sent for ${unread} unread notification(s)`, data: { unread, critical } };
    }

    case "audit.retention.prune": {
      const orgId = requireOrg();
      const organization = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
      const days = planFor(organization.plan).limits.dataRetentionDays;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60_000);
      const result = await db.auditLog.deleteMany({
        where: { organizationId: orgId, createdAt: { lt: cutoff }, severity: "INFO" },
      });
      return {
        ok: true,
        summary: result.count
          ? `Pruned ${result.count} audit entry(ies) older than ${days} days`
          : `Nothing to prune — retention is ${days} days on the ${organization.plan.toLowerCase()} plan`,
        data: { deleted: result.count, retentionDays: days, cutoff: cutoff.toISOString() },
      };
    }

    default:
      return { ok: false, summary: `No worker handler is registered for “${job.name}”`, error: "HANDLER_NOT_FOUND" };
  }
}

/** Queues a job for the worker. Used by the console, the API and the seeder. */
export async function enqueueJob(input: {
  organizationId?: string | null;
  name: string;
  payload?: Record<string, unknown>;
  scheduledFor?: Date;
  maxAttempts?: number;
}) {
  const handler = handlerFor(input.name);
  const job = await db.job.create({
    data: {
      organizationId: input.organizationId ?? null,
      name: input.name,
      type: handler?.type ?? "MAINTENANCE",
      status: "PENDING",
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      scheduledFor: input.scheduledFor ?? new Date(),
    },
  });

  if (input.organizationId) {
    await auditSystem({
      organizationId: input.organizationId,
      action: "job.queued",
      entityType: "job",
      entityId: job.id,
      entityLabel: job.name,
      after: { scheduledFor: job.scheduledFor.toISOString(), type: job.type },
    }).catch(() => undefined);
  }

  return job;
}

/**
 * Claims due jobs for this worker. Uses a conditional update so two workers can
 * never pick up the same row, and stale RUNNING rows are reclaimed.
 */
export async function claimDueJobs(limit = 10) {
  const now = new Date();
  await db.job.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - 15 * 60_000) } },
    data: { status: "PENDING", lastError: "Reclaimed after a worker timeout" },
  });

  const due = await db.job.findMany({
    where: { status: "PENDING", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  const claimed: Job[] = [];
  for (const job of due) {
    const result = await db.job.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (result.count === 1) claimed.push(job);
  }
  return claimed;
}

/** Runs claimed jobs, recording outcome, duration and retry state. */
export async function processJobs(limit = 10, onLog: (message: string) => void = () => undefined) {
  const jobs = await claimDueJobs(limit);
  const outcomes: { job: Job; outcome: JobOutcome }[] = [];

  for (const job of jobs) {
    const startedAt = Date.now();
    let outcome: JobOutcome;
    try {
      outcome = await runJob(job);
    } catch (error) {
      outcome = {
        ok: false,
        summary: `Unhandled worker error: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.name : "UNKNOWN",
      };
    }
    const durationMs = Date.now() - startedAt;
    const attempts = job.attempts + 1;
    const willRetry = !outcome.ok && attempts < job.maxAttempts;

    await db.job.update({
      where: { id: job.id },
      data: {
        status: outcome.ok ? "SUCCEEDED" : willRetry ? "PENDING" : "FAILED",
        result: (outcome.data ?? {}) as Prisma.InputJsonValue,
        lastError: outcome.ok ? null : outcome.summary,
        finishedAt: outcome.ok ? new Date() : null,
        durationMs,
        scheduledFor: willRetry ? new Date(Date.now() + 60_000 * attempts) : job.scheduledFor,
      },
    });

    onLog(`${outcome.ok ? "✓" : willRetry ? "↻" : "✗"} ${job.name} (${durationMs}ms) — ${outcome.summary}`);
    outcomes.push({ job, outcome });
  }

  return outcomes;
}
