import type { NotificationType, Severity } from "@prisma/client";
import { db } from "@/server/db";

/** Notification centre. Recipients are resolved from roles so routing stays declarative. */
export async function notify(input: {
  organizationId: string;
  userId?: string | null;
  roles?: ("OWNER" | "ADMIN" | "MANAGER" | "ANALYST" | "MEMBER")[];
  type: NotificationType;
  title: string;
  body: string;
  severity?: Severity;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  let recipients: string[] = [];

  if (input.userId) {
    recipients = [input.userId];
  } else if (input.roles?.length) {
    const memberships = await db.membership.findMany({
      where: {
        organizationId: input.organizationId,
        status: "ACTIVE",
        deletedAt: null,
        role: { in: input.roles },
      },
      select: { userId: true },
      take: 25,
    });
    recipients = memberships.map((membership) => membership.userId);
  }

  if (!recipients.length) {
    recipients = [null as unknown as string];
  }

  const created = await db.$transaction(
    recipients.map((userId) =>
      db.notification.create({
        data: {
          organizationId: input.organizationId,
          userId: userId ?? null,
          type: input.type,
          title: input.title,
          body: input.body,
          severity: input.severity ?? "MEDIUM",
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          actionUrl: input.actionUrl ?? null,
          metadata: (input.metadata ?? undefined) as never,
        },
      }),
    ),
  );
  return created;
}

export async function unreadCount(organizationId: string, userId: string) {
  return db.notification.count({ where: { organizationId, OR: [{ userId }, { userId: null }], readAt: null } });
}

export async function markRead(organizationId: string, userId: string, ids: string[]) {
  return db.notification.updateMany({
    where: { organizationId, id: { in: ids }, OR: [{ userId }, { userId: null }] },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(organizationId: string, userId: string) {
  return db.notification.updateMany({
    where: { organizationId, readAt: null, OR: [{ userId }, { userId: null }] },
    data: { readAt: new Date(), readById: userId },
  });
}
