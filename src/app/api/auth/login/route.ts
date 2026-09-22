import { route } from "@/server/api";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { auditAs } from "@/server/audit";
import { loginSchema } from "@/server/validation";

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export const POST = route({
  requireAuth: false,
  body: loginSchema,
  rateLimit: "authStrict",
  handler: async ({ body, ip, userAgent }) => {
    const user = await db.user.findFirst({
      where: { email: body.email, deletedAt: null },
      include: {
        memberships: {
          where: { status: "ACTIVE", deletedAt: null },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                plan: true,
                logoUrl: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!user) {
      throw new AppError("UNAUTHORIZED", "unknown email", {
        userMessage:
          "Those credentials do not match an account. Check the email and try again.",
      });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError("FORBIDDEN", "account locked", {
        userMessage: `Too many failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`,
      });
    }
    if (!user.memberships.length) {
      throw new AppError("FORBIDDEN", "no active membership", {
        userMessage:
          "This account has no active workspace. Ask an administrator to restore access.",
      });
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      const failedLoginCount = user.failedLoginCount + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount,
          lockedUntil:
            failedLoginCount >= MAX_FAILED
              ? new Date(Date.now() + LOCK_MINUTES * 60_000)
              : null,
        },
      });
      throw new AppError("UNAUTHORIZED", "invalid password", {
        userMessage:
          "Those credentials do not match an account. Check the password and try again.",
      });
    }

    const membership = user.memberships[0]!;
    await createSession({
      userId: user.id,
      organizationId: membership.organizationId,
      ip,
      userAgent,
    });
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastActiveAt: new Date(),
      },
    });

    const auth = {
      user,
      session: { id: "" },
      organization: membership.organization,
      role: membership.role,
      membershipId: membership.id,
      permissions: [],
      memberships: [],
    };
    await auditAs(auth as never, {
      action: "auth.login",
      entityType: "session",
      entityLabel: "Password login",
      after: { email: user.email, workspace: membership.organization.name },
    });

    return {
      data: {
        user: { id: user.id, name: user.name, email: user.email },
        organization: {
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
        },
        redirectTo: user.emailVerifiedAt ? "/dashboard" : "/verify-email",
      },
    };
  },
});
