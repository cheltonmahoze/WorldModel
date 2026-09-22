import { route } from "@/server/api";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { hashPassword, sha256 } from "@/server/auth/password";
import { auditSystem } from "@/server/audit";
import { resetPasswordSchema } from "@/server/validation";

export const POST = route({
  requireAuth: false,
  body: resetPasswordSchema,
  rateLimit: "authStrict",
  handler: async ({ body }) => {
    const record = await db.authToken.findUnique({
      where: { tokenHash: sha256(body.token) },
    });
    if (
      !record ||
      record.type !== "PASSWORD_RESET" ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new AppError("BAD_REQUEST", "invalid reset token", {
        userMessage:
          "This reset link is no longer valid. Request a new one from the sign-in screen.",
      });
    }

    const passwordHash = await hashPassword(body.password);
    await db.$transaction([
      db.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
      db.authToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Resetting a password invalidates every other session.
      db.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    const membership = await db.membership.findFirst({
      where: { userId: record.userId },
      select: { organizationId: true },
    });
    await auditSystem({
      organizationId: membership?.organizationId ?? "",
      action: "auth.password_reset",
      entityType: "user",
      entityId: record.userId,
      severity: "WARNING",
    });

    return { data: { ok: true, redirectTo: "/login" } };
  },
});
