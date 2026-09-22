import { route } from "@/server/api";
import { markAllRead } from "@/server/services/notifications";

export const POST = route({
  status: 200,
  rateLimit: "write",
  handler: async ({ auth }) => {
    const count = await markAllRead(auth.organization.id, auth.user.id);
    return { data: { read: count } };
  },
});
