import { route } from "@/server/api";
import { syncIntegration } from "@/server/services/integrations";

/** Interactive sync — same code path the background worker uses. */
export const POST = route({
  status: 200,
  permission: "integrations:manage",
  rateLimit: "write",
  handler: async ({ auth, params }) => {
    const result = await syncIntegration({
      organizationId: auth.organization.id,
      integrationId: params.id,
      auth,
      source: "API",
    });
    return { data: result };
  },
});
