import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { inviteMemberSchema } from "@/server/validation";
import { generateToken, sha256 } from "@/server/auth/password";
import { notify } from "@/server/services/notifications";
import { PLANS } from "@/lib/plans";
import { env } from "@/server/env";
import { can, atLeast } from "@/lib/rbac";
import { z } from "zod";

export const POST = route({
  body: inviteMemberSchema.extend({ teamId: z.string().min(8).optional() }),
  rateLimit: "write",
  permission: "members:invite",
  handler: async ({ auth, body, db }) => {
    if (!atLeast(auth.role, "ADMIN") && body.role === "OWNER") {
      throw new AppError("FORBIDDEN", "cannot invite owner", {
        userMessage: "Only an owner can invite another owner.",
      });
    }

    const plan = PLANS[auth.organization.plan];
    const seats = await db.membership.count({
      where: {
        organizationId: auth.organization.id,
        status: { not: "INVITED" },
        deletedAt: null,
      },
    });
    const pending = await db.membership.count({
      where: {
        organizationId: auth.organization.id,
        status: "INVITED",
        deletedAt: null,
      },
    });
    if (seats + pending >= plan.limits.seats) {
      throw AppError.planLimit(`Your ${plan.name} plan includes ${plan.limits.seats} seats. Add seats or upgrade to invite more people.`);
    }

    const existingUser = await db.user.findFirst({
      where: { email: body.email, deletedAt: null },
    });
    const duplicate = existingUser
      ? await db.membership.findFirst({
          where: {
            organizationId: auth.organization.id,
            userId: existingUser.id,
            deletedAt: null,
          },
        })
      : null;
    if (duplicate) {
      throw new AppError("CONFLICT", "already a member", {
        userMessage: `${body.email} already belongs to this workspace.`,
      });
    }

    const token = generateToken(24);
    const expiresAt = new Date(Date.now() + env.INVITE_TTL_MINUTES * 60_000);

    const membership = await db.$transaction(async (transaction) => {
      const user =
        existingUser ??
        (await transaction.user.create({
          data: {
            email: body.email,
            name: body.email
              .split("@")[0]!
              .replace(/[._-]/g, " ")
              .replace(/\b\w/g, (char) => char.toUpperCase()),
            passwordHash: null,
            jobTitle: body.title ?? null,
          },
        }));

      const created = await transaction.membership.create({
        data: {
          organizationId: auth.organization.id,
          userId: user.id,
          role: body.role,
          status: "INVITED",
          title: body.title ?? null,
          department: body.department ?? null,
          invitedById: auth.user.id,
          invitedEmail: body.email,
          inviteTokenHash: sha256(token),
          inviteExpiresAt: expiresAt,
          invitedAt: new Date(),
        },
      });

      if (body.teamId) {
        await transaction.teamMember.create({
          data: {
            teamId: body.teamId,
            userId: user.id,
            organizationId: auth.organization.id,
          },
        });
      }

      await transaction.authToken.create({
        data: {
          userId: user.id,
          type: "INVITE",
          tokenHash: sha256(token),
          email: body.email,
          expiresAt,
        },
      });

      return created;
    });

    await notify({
      organizationId: auth.organization.id,
      roles: ["OWNER", "ADMIN"],
      type: "SYSTEM",
      title: "Invite sent",
      body: `${body.email} was invited as ${body.role.toLowerCase()}.`,
      entityType: "membership",
      entityId: membership.id,
      actionUrl: "/team",
    });

    await auditAs(auth, {
      action: "member.invited",
      entityType: "membership",
      entityId: membership.id,
      entityLabel: body.email,
      after: { role: body.role, teamId: body.teamId ?? null, expiresAt },
    });

    // No mail provider is configured in this environment, so the invite link is
    // returned (outside production) instead of being silently discarded.
    return {
      data: {
        id: membership.id,
        email: body.email,
        role: membership.role,
        expiresAt,
        inviteUrl:
          env.NODE_ENV === "production" ? null : `/invite?token=${token}`,
        emailed: env.NODE_ENV === "production",
      },
    };
  },
});
