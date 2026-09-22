import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { reportUpdateSchema } from "@/server/validation";
import { runReport } from "@/server/services/reports";

export const GET = route({
  handler: async ({ auth, params, db }) => {
    const report = await db.report.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!report) throw AppError.notFound("Report");
    const result = await runReport(auth.organization.id, report.id);
    return { data: { report, result } };
  },
});

export const PATCH = route({
  permission: "reports:write",
  body: reportUpdateSchema,
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.report.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Report");
    const report = await db.report.update({
      where: { id: existing.id },
      data: { ...body, config: body.config as never },
    });
    await auditAs(auth, {
      action: "report.updated",
      entityType: "report",
      entityId: existing.id,
      entityLabel: existing.name,
      before: {
        name: existing.name,
        schedule: existing.schedule,
        isPinned: existing.isPinned,
      },
      after: {
        name: report.name,
        schedule: report.schedule,
        isPinned: report.isPinned,
      },
    });
    return { data: report };
  },
});

export const DELETE = route({
  permission: "reports:write",
  rateLimit: "write",
  handler: async ({ auth, params, db }) => {
    const existing = await db.report.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Report");
    await db.report.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await auditAs(auth, {
      action: "report.deleted",
      entityType: "report",
      entityId: existing.id,
      entityLabel: existing.name,
      severity: "WARNING",
    });
    return { data: { id: existing.id, deleted: true } };
  },
});
