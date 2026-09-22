import { route } from "@/server/api";
import { auditAs } from "@/server/audit";

const stale = 30 * 86_400_000;

export const GET = route({
  handler: async ({ auth, db }) => {
    const sessions = await db.session.findMany({
      where: { userId: auth.user.id, expiresAt: { gt: new Date() } },
      orderBy: [{ lastSeenAt: "desc" }],
      select: {
        id: true,
        device: true,
        location: true,
        ip: true,
        lastSeenAt: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    return {
      data: {
        currentSessionId: auth.session.id,
        items: sessions.map((session) => ({
          ...session,
          current: session.id === auth.session.id,
          expiresSoon: session.expiresAt.getTime() - Date.now() < stale / 4,
        })),
      },
    };
  },
});

export const DELETE = route({
  rateLimit: "write",
  handler: async ({ auth, request, db }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const all = url.searchParams.get("all") === "true";
    if (!id && !all) {
      return { data: { revoked: 0 } };
    }
    const result = await db.session.updateMany({
      where: all
        ? {
            userId: auth.user.id,
            id: { not: auth.session.id },
            revokedAt: null,
          }
        : { userId: auth.user.id, id: id!, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: auth.user.id },
    });
    await auditAs(auth, {
      action: all ? "session.revoked_all" : "session.revoked",
      entityType: "session",
      entityId: id ?? undefined,
      entityLabel: all ? "All other sessions" : "Single session",
      severity: "WARNING",
      after: { revoked: result.count },
    });
    return { data: { revoked: result.count } };
  },
});
