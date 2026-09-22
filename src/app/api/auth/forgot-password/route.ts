import { route } from "@/server/api";
import { db } from "@/server/db";
import { generateToken, sha256 } from "@/server/auth/password";
import { auditSystem } from "@/server/audit";
import { forgotPasswordSchema } from "@/server/validation";
import { env } from "@/server/env";

export const POST = route({
  requireAuth: false,
  body: forgotPasswordSchema,
  rateLimit: "auth",
  handler: async ({ body }) => {
    const user = await db.user.findFirst({
      where: { email: body.email, deletedAt: null },
    });

    // Always answer the same way so the endpoint cannot be used to enumerate accounts.
    const generic = {
      sent: true as const,
      message:
        "If an account exists for that email, a reset link is on its way.",
    };
    if (!user)
      return {
        data:
          env.NODE_ENV === "production"
            ? generic
            : { ...generic, devToken: null },
      };

    const token = generateToken(24);
    await db.authToken.create({
      data: {
        userId: user.id,
        type: "PASSWORD_RESET",
        tokenHash: sha256(token),
        email: user.email,
        expiresAt: new Date(
          Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000,
        ),
      },
    });
    await auditSystem({
      organizationId:
        (
          await db.membership.findFirst({
            where: { userId: user.id },
            select: { organizationId: true },
          })
        )?.organizationId ?? "",
      action: "auth.password_reset_requested",
      entityType: "user",
      entityId: user.id,
      entityLabel: user.email,
    });

    // The mail provider is intentionally not configured in this environment;
    // the token is only surfaced outside production so the flow stays testable.
    return {
      data:
        env.NODE_ENV === "production"
          ? generic
          : {
              sent: true,
              message:
                "Reset link generated locally (no mail provider configured).",
              devToken: token,
            },
    };
  },
});
