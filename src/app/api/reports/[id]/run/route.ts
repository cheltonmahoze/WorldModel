import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { notify } from "@/server/services/notifications";
import { runReport } from "@/server/services/reports";

/**
 * Executes a saved report, records the run on the report row, notifies the
 * requester and returns the generated dataset so the UI can preview and export
 * it. Kept separate from GET /api/reports/[id] so dashboard views never trigger
 * an unexpected generation.
 */
export const POST = route({
  status: 200,
  permission: "reports:write",
  rateLimit: "export",
  handler: async ({ auth, params, db }) => {
    const report = await db.report.findFirst({
      where: { id: params.id, organizationId: auth.organization.id, deletedAt: null },
    });
    if (!report) throw AppError.notFound("Report");

    const startedAt = Date.now();
    const result = await runReport(auth.organization.id, report.id);
    const durationMs = Date.now() - startedAt;

    await db.report.update({
      where: { id: report.id },
      data: { lastRunDurationMs: durationMs },
    });

    await auditAs(auth, {
      action: "report.generated",
      entityType: "report",
      entityId: report.id,
      entityLabel: report.name,
      after: { rows: result.rows.length, durationMs, dataset: report.type },
      severity: "INFO",
    });

    await notify({
      organizationId: auth.organization.id,
      userId: auth.user.id,
      type: "REPORT_GENERATED",
      title: `${report.name} is ready`,
      body: `Generated ${result.rows.length} rows in ${durationMs}ms from the ${report.type.toLowerCase()} dataset.`,
      entityType: "report",
      entityId: report.id,
      actionUrl: `/reports?report=${report.id}`,
      metadata: { rows: result.rows.length, durationMs },
    });

    return { data: { report, result, durationMs } };
  },
});
