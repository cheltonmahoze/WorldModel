import { route } from "@/server/api";
import { destroySession } from "@/server/auth/session";
import { auditAs } from "@/server/audit";

export const POST = route({
  rateLimit: "auth",
  handler: async ({ auth }) => {
    await auditAs(auth, {
      action: "auth.logout",
      entityType: "session",
      entityLabel: "Session ended",
    });
    await destroySession(auth.session.id, { suppressOpenAccess: true });
    return { data: { ok: true } };
  },
});
