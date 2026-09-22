import { route } from "@/server/api";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { sha256 } from "@/server/auth/password";
import { verifyEmailSchema } from "@/server/validation";

export const POST = route({
  requireAuth: false,
  body: verifyEmailSchema,
  rateLimit: "auth",
  handler: async ({ body }) => {
    const record = await db.authToken.findUnique({
      where: { tokenHash: sha256(body.token) },
    });
    if (
      !record ||
      record.type !== "EMAIL_VERIFICATION" ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new AppError("BAD_REQUEST", "invalid verification token", {
        userMessage:
          "This verification link has expired. Sign in and request a new verification email.",
      });
    }
    await db.$transaction([
      db.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      db.authToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { data: { ok: true, verified: true } };
  },
});
