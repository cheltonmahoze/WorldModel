import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { handlerFor, runJob } from "@/server/jobs";
import { atLeast } from "@/lib/rbac";
import type { Prisma } from "@prisma/client";

/** Runs one job immediately — retry a failure, or force a scheduled run early. */
export const POST = route({
  status: 200,
  permission: "automations:write",
  rateLimit: "write",
  handler: async ({ auth, params, db }) => {
    if (!atLeast(auth.role, "MANAGER")) {
      throw AppError.forbidden("Only a manager or above can run background jobs.");
    }

    const job = await db.job.findFirst({
      where: { id: params.id, OR: [{ organizationId: auth.organization.id }, { organizationId: null }] },
    });
    if (!job) throw AppError.notFound("Job");
    if (job.status === "RUNNING") {
      throw new AppError("VALIDATION_ERROR", "job already running", {
        userMessage: "This job is already running. Wait for the current run to finish.",
      });
    }

    await db.job.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });

    const startedAt = Date.now();
    let outcome;
    try {
      outcome = await runJob(job);
    } catch (error) {
      outcome = {
        ok: false,
        summary: error instanceof Error ? error.message : "Unknown worker error",
        error: "RUN_FAILED",
      };
    }
    const durationMs = Date.now() - startedAt;

    const updated = await db.job.update({
      where: { id: job.id },
      data: {
        status: outcome.ok ? "SUCCEEDED" : "FAILED",
        result: (outcome.data ?? {}) as Prisma.InputJsonValue,
        lastError: outcome.ok ? null : outcome.summary,
        finishedAt: outcome.ok ? new Date() : null,
        durationMs,
      },
    });

    await auditAs(auth, {
      action: outcome.ok ? "job.completed" : "job.failed",
      entityType: "job",
      entityId: job.id,
      entityLabel: job.name,
      severity: outcome.ok ? "INFO" : "WARNING",
      after: { durationMs, summary: outcome.summary, handler: handlerFor(job.name)?.title ?? job.name },
    });

    return { data: { job: updated, outcome, durationMs } };
  },
});
