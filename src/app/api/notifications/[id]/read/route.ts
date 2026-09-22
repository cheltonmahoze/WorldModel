import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { markRead } from "@/server/services/notifications";

/** Marks a single notification as read. POST and PATCH are both supported. */
async function mark(organizationId: string, userId: string, id: string) {
  const count = await markRead(organizationId, userId, [id]);
  if (!count) throw AppError.notFound("Notification");
  return { data: { id, read: true } };
}

export const POST = route({
  status: 200,
  rateLimit: "write",
  handler: async ({ auth, params }) =>
    mark(auth.organization.id, auth.user.id, params.id),
});

export const PATCH = route({
  rateLimit: "write",
  handler: async ({ auth, params }) =>
    mark(auth.organization.id, auth.user.id, params.id),
});
