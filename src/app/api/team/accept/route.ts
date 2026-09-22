import { route } from "@/server/api";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { acceptInviteSchema } from "@/server/validation";
import { hashPassword, sha256 } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { auditSystem } from "@/server/audit";
import { can, ROLE_RANK } from "@/lib/rbac";

/** Public endpoint: completes an invitation, optionally setting the password. */
export const POST = route({
  requireAuth: false,
  body: acceptInviteSchema,
  rateLimit: "auth",
  handler: async ({ body, ip, userAgent }) => {
    const record = await db.authToken.findUnique({
      where: { tokenHash: sha256(body.token) },
    });
    if (
      !record ||
      record.type !== "INVITE" ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new AppError("BAD_REQUEST", "invalid invite", {
        userMessage:
          "This invitation link is no longer valid. Ask an administrator to send a new one.",
      });
    }

    const membership = await db.membership.findFirst({
      where: { userId: record.userId, status: "INVITED", deletedAt: null },
    });
    if (!membership) {
      throw new AppError("BAD_REQUEST", "membership not found", {
        userMessage: "This invitation has already been accepted.",
      });
    }

    const user = await db.user.findUniqueOrThrow({
      where: { id: record.userId },
    });
    const needsPassword = !user.passwordHash;
    if (needsPassword && !body.password) {
      throw new AppError("BAD_REQUEST", "password required", {
        userMessage: "Choose a password to finish joining the workspace.",
        details: { password: "Choose a password to finish joining" },
      });
    }

    await db.$transaction(async (transaction) => {
      if (body.name)
        await transaction.user.update({
          where: { id: user.id },
          data: { name: body.name },
        });
      if (body.password)
        await transaction.user.update({
          where: { id: user.id },
          data: {
            passwordHash: await hashPassword(body.password),
            emailVerifiedAt: new Date(),
          },
        });
      await transaction.membership.update({
        where: { id: membership.id },
        data: {
          status: "ACTIVE",
          joinedAt: new Date(),
          inviteTokenHash: null,
          inviteExpiresAt: null,
          lastSeenAt: new Date(),
        },
      });
      await transaction.authToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    });

    await createSession({
      userId: user.id,
      organizationId: membership.organizationId,
      ip,
      userAgent,
    });
    await auditSystem({
      organizationId: membership.organizationId,
      action: "member.joined",
      entityType: "membership",
      entityId: membership.id,
      entityLabel: user.email,
      after: { role: membership.role },
    });

    return {
      data: {
        organizationId: membership.organizationId,
        redirectTo: "/dashboard",
      },
    };
  },
});

