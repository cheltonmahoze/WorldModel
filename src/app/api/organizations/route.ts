import { route } from "@/server/api";
import { createOrganizationSchema } from "@/server/validation";
import { auditAs } from "@/server/audit";
import { slugify } from "@/lib/utils";
import { planFor } from "@/lib/plans";
import { AppError } from "@/server/errors";

export const POST = route({
  body: createOrganizationSchema,
  rateLimit: "write",
  handler: async ({ auth, body, db }) => {
    const baseSlug = slugify(body.name) || "workspace";
    let slug = baseSlug;
    for (
      let attempt = 2;
      await db.organization.findUnique({ where: { slug } });
      attempt++
    ) {
      slug = `${baseSlug}-${attempt}`;
    }
    if (
      slug !== baseSlug &&
      (await db.membership.count({
        where: { userId: auth.user.id, deletedAt: null },
      })) >= 5
    ) {
      throw AppError.planLimit("You already belong to the maximum number of workspaces for a demo account.");
    }

    const plan = planFor(body.plan);
    const organization = await db.$transaction(async (transaction) => {
      const created = await transaction.organization.create({
        data: {
          name: body.name,
          slug,
          industry: body.industry ?? null,
          companySize: body.companySize ?? null,
          plan: body.plan,
          currency: body.currency,
          timezone: body.timezone,
          onboardedAt: new Date(),
          churnRiskThreshold: 60,
        },
      });
      await transaction.membership.create({
        data: {
          organizationId: created.id,
          userId: auth.user.id,
          role: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date(),
          title: "Founder",
        },
      });
      await transaction.subscription.create({
        data: {
          organizationId: created.id,
          plan: body.plan,
          status: body.plan === "ENTERPRISE" ? "ACTIVE" : "TRIALING",
          seats: plan.seatsIncluded,
          seatPrice: plan.seatPrice,
          mrr: body.plan === "ENTERPRISE" ? 0 : (plan.monthlyPrice ?? 0),
          currency: body.currency,
          billingEmail: auth.user.email,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
          trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
        },
      });
      return created;
    });

    await auditAs(auth, {
      action: "organization.created",
      entityType: "organization",
      entityId: organization.id,
      entityLabel: organization.name,
      organizationId: organization.id,
      after: { plan: body.plan, seats: plan.seatsIncluded },
    });

    return { data: organization };
  },
});
