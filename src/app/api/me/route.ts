import { route } from "@/server/api";
import { updateProfileSchema } from "@/server/validation";
import { auditAs } from "@/server/audit";
import { passwordStrength } from "@/server/auth/password";

export const GET = route({
  handler: async ({ auth }) => ({
    data: {
      user: auth.user,
      organization: auth.organization,
      role: auth.role,
      permissions: auth.permissions,
      memberships: auth.memberships,
      passwordStrengthHints: passwordStrength(""),
    },
  }),
});

export const PATCH = route({
  body: updateProfileSchema,
  rateLimit: "write",
  handler: async ({ auth, body, db: tx }) => {
    const updated = await tx.user.update({
      where: { id: auth.user.id },
      data: body,
    });
    await auditAs(auth, {
      action: "profile.updated",
      entityType: "user",
      entityId: auth.user.id,
      entityLabel: updated.name,
      before: {
        name: auth.user.name,
        jobTitle: auth.user.jobTitle,
        timezone: auth.user.timezone,
        themePreference: auth.user.themePreference,
      },
      after: {
        name: updated.name,
        jobTitle: updated.jobTitle,
        timezone: updated.timezone,
        themePreference: updated.themePreference,
      },
    });
    return {
      data: {
        id: updated.id,
        name: updated.name,
        jobTitle: updated.jobTitle,
        timezone: updated.timezone,
        locale: updated.locale,
        themePreference: updated.themePreference,
        avatarUrl: updated.avatarUrl,
      },
    };
  },
});

export const dynamic = "force-dynamic";
