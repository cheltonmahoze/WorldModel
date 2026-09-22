import { route } from "@/server/api";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { generateToken, hashPassword, sha256 } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { auditAs } from "@/server/audit";
import { signupSchema } from "@/server/validation";
import { planFor } from "@/lib/plans";
import { slugify } from "@/lib/utils";
import { env } from "@/server/env";

export const POST = route({
  requireAuth: false,
  body: signupSchema,
  rateLimit: "authStrict",
  handler: async ({ body, ip, userAgent }) => {
    const existing = await db.user.findFirst({
      where: { email: body.email, deletedAt: null },
    });
    if (existing) {
      throw new AppError("CONFLICT", "email already registered", {
        userMessage:
          "An account already exists for this email. Sign in instead, or reset your password.",
      });
    }

    const passwordHash = await hashPassword(body.password);
    const baseSlug = slugify(body.companyName) || "workspace";
    let slug = baseSlug;
    for (
      let attempt = 2;
      await db.organization.findUnique({ where: { slug } });
      attempt++
    ) {
      slug = `${baseSlug}-${attempt}`;
    }

    const plan = "GROWTH" as const;
    const trialEndsAt = new Date(Date.now() + env.TRIAL_DAYS * 86_400_000);

    const result = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: body.companyName,
          slug,
          industry: body.industry ?? null,
          companySize: body.companySize ?? null,
          plan,
          onboardedAt: new Date(),
          churnRiskThreshold: 60,
        },
      });

      const user = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          passwordHash,
          jobTitle: body.jobTitle ?? null,
          emailVerifiedAt: null,
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date(),
          title: body.jobTitle ?? "Founder",
        },
      });

      await tx.subscription.create({
        data: {
          organizationId: organization.id,
          plan,
          status: "TRIALING",
          seats: planFor(plan).seatsIncluded,
          seatPrice: planFor(plan).seatPrice,
          mrr: 0,
          currency: "EUR",
          billingEmail: user.email,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
          trialEndsAt,
        },
      });

      const token = generateToken(24);
      await tx.authToken.create({
        data: {
          userId: user.id,
          type: "EMAIL_VERIFICATION",
          tokenHash: sha256(token),
          email: user.email,
          expiresAt: new Date(Date.now() + 24 * 3_600_000),
        },
      });

      return { organization, user, membership, verificationToken: token };
    });

    await createSession({
      userId: result.user.id,
      organizationId: result.organization.id,
      ip,
      userAgent,
    });

    await auditAs(
      {
        user: result.user,
        session: { id: "" },
        organization: result.organization,
        role: "OWNER",
        membershipId: result.membership.id,
        permissions: [],
        memberships: [],
      } as never,
      {
        action: "organization.created",
        entityType: "organization",
        entityId: result.organization.id,
        entityLabel: result.organization.name,
        after: { plan, seats: planFor(plan).seatsIncluded },
      },
    );

    return {
      data: {
        organization: {
          id: result.organization.id,
          name: result.organization.name,
          slug: result.organization.slug,
        },
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
        },
        // In production this token is emailed. Locally the mail provider is not
        // configured, so we surface it explicitly for a completable flow.
        emailVerification:
          env.NODE_ENV === "production"
            ? { sent: true }
            : { sent: false, devToken: result.verificationToken },
        redirectTo: "/dashboard",
      },
    };
  },
});
