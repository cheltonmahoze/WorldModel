import { route } from "@/server/api";
import { runIntelligence } from "@/server/engines";
import { runEngineSchema } from "@/server/validation";

export const POST = route({
  status: 200,
  permission: "insights:write",
  body: runEngineSchema.optional(),
  rateLimit: "write",
  handler: async ({ auth, body }) => {
    const summary = await runIntelligence(auth.organization.id, {
      engines: body?.engines,
      actorId: auth.user.id,
      actorName: auth.user.name,
      source: "WEB",
    });
    return {
      data: {
        insights: summary.insights.detected,
        risks: summary.risks.detected,
        briefUpdatedAt: summary.brief ? new Date().toISOString() : null,
        headline: summary.brief?.headline ?? null,
        durationMs: summary.durationMs,
        scanned: summary.scanned,
      },
    };
  },
});
