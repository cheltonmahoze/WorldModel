import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { runAutomationById } from "@/server/services/automations";
import { auditAs } from "@/server/audit";

export const POST = route({
  status: 200,
  permission: "automations:write",
  rateLimit: "write",
  handler: async ({ auth, params, db }) => {
    const automation = await db.automation.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!automation) throw AppError.notFound("Automation");
    const summary = await runAutomationById(automation.id, {
      triggeredBy: `user:${auth.user.id}`,
      actorName: auth.user.name,
      force: true,
    });
    await auditAs(auth, {
      action: "automation.manual_run",
      entityType: "automation",
      entityId: automation.id,
      entityLabel: automation.name,
      after: {
        status: summary?.status ?? "UNKNOWN",
        steps: summary?.steps.length ?? 0,
      },
    });
    return { data: summary };
  },
});
