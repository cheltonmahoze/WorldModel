import { route } from "@/server/api";
import { unreadCount } from "@/server/services/notifications";

export const GET = route({
  handler: async ({ auth }) => {
    const unread = await unreadCount(auth.organization.id, auth.user.id);
    return { data: { unread } };
  },
});
