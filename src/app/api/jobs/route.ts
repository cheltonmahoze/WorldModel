import { route, paginated, paginationFrom } from "@/server/api";
import { AppError } from "@/server/errors";
import { atLeast } from "@/lib/rbac";
import { JOB_HANDLERS, enqueueJob, handlerFor, runJob } from "@/server/jobs";
import { auditAs } from "@/server/audit";
import { jobCreateSchema, jobFilterSchema } from "@/server/validation";
import type { Prisma } from "@prisma/client";

/**
 * Background job console.
 *
 * GET lists the queue with the handler catalogue so an operator can see what the
 * worker knows how to run; POST queues a run. Both are operator-level actions —
 * MEMBER and ANALYST can look, MANAGER and above can queue.
 */
export const GET = route({
  query: jobFilterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take } = paginationFrom(query);
    const where: Prisma.JobWhereInput = {
      OR: [{ organizationId: auth.organization.id }, { organizationId: null }],
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.name ? { name: { contains: query.name, mode: "insensitive" } } : {}),
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
    };

    const [items, total, byStatus, byType, recent] = await Promise.all([
      db.job.findMany({ where, orderBy: [{ scheduledFor: "desc" }], skip, take }),
      db.job.count({ where }),
      db.job.groupBy({
        by: ["status"],
        where: { OR: [{ organizationId: auth.organization.id }, { organizationId: null }] },
        _count: true,
      }),
      db.job.groupBy({
        by: ["type"],
        where: { OR: [{ organizationId: auth.organization.id }, { organizationId: null }] },
        _count: true,
        _avg: { durationMs: true },
      }),
      db.job.findMany({
        where: { OR: [{ organizationId: auth.organization.id }, { organizationId: null }], status: "SUCCEEDED" },
        orderBy: { finishedAt: "desc" },
        take: 5,
        select: { id: true, name: true, finishedAt: true, durationMs: true },
      }),
    ]);

    const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count])) as Record<string, number>;
    const finished = counts.SUCCEEDED ?? 0;
    const failed = counts.FAILED ?? 0;
    const runs = finished + failed;

    return paginated(items, total, page, pageSize, {
      summary: {
        pending: counts.PENDING ?? 0,
        running: counts.RUNNING ?? 0,
        succeeded: finished,
        failed,
        total: Object.values(counts).reduce((acc, value) => acc + value, 0),
        successRate: runs ? Number(((finished / runs) * 100).toFixed(1)) : 100,
        byType: byType.map((row) => ({
          type: row.type,
          count: row._count,
          averageDurationMs: Math.round(row._avg.durationMs ?? 0),
        })),
      },
      handlers: JOB_HANDLERS,
      recentRuns: recent,
      canManage: ["OWNER", "ADMIN", "MANAGER"].includes(auth.role),
      note: "Queue rows are executed by scripts/worker.ts (npm run worker). Jobs are claimed atomically, retried up to maxAttempts with backoff, and every run is audited.",
    });
  },
});

export const POST = route({
  body: jobCreateSchema,
  permission: "automations:write",
  rateLimit: "write",
  handler: async ({ auth, body, db }) => {
    if (!atLeast(auth.role, "MANAGER")) {
      throw AppError.forbidden("Only a manager or above can queue background jobs.");
    }
    if (!handlerFor(body.name)) {
      const known = JOB_HANDLERS.map((handler) => handler.name).join(", ");
      throw new AppError("VALIDATION_ERROR", "unknown job handler", {
        userMessage: `“${body.name}” is not a registered worker handler. Available handlers: ${known}.`,
        details: { name: "Unknown handler" },
      });
    }

    const job = await enqueueJob({
      organizationId: auth.organization.id,
      name: body.name,
      payload: body.payload,
      scheduledFor: body.delaySeconds ? new Date(Date.now() + body.delaySeconds * 1000) : undefined,
      maxAttempts: body.maxAttempts,
    });

    await auditAs(auth, {
      action: "job.queued",
      entityType: "job",
      entityId: job.id,
      entityLabel: job.name,
      after: { scheduledFor: job.scheduledFor.toISOString(), type: job.type, payload: body.payload ?? {} },
    });

    // Small, idempotent handlers are run immediately so the console reflects the
    // result without waiting for the worker tick; long integrations stay queued.
    const runsImmediately = body.name.startsWith("notifications.") || body.name.startsWith("billing.") || body.name.startsWith("audit.");
    if (runsImmediately && !body.delaySeconds) {
      const outcome = await runJob(job);
      const updated = await db.job.update({
        where: { id: job.id },
        data: {
          status: outcome.ok ? "SUCCEEDED" : "FAILED",
          result: (outcome.data ?? {}) as Prisma.InputJsonValue,
          lastError: outcome.ok ? null : outcome.summary,
          finishedAt: outcome.ok ? new Date() : null,
          attempts: { increment: 1 },
          durationMs: 0,
        },
      });
      return { data: { job: updated, outcome, executed: true } };
    }

    return { data: { job, outcome: null, executed: false } };
  },
});
