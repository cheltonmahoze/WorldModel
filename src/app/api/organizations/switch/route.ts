import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { switchOrganization } from "@/server/auth/session";
import { auditAs } from "@/server/audit";
import { z } from "zod";

const schema = z.object({ organizationId: z.string().min(8) });

export const POST = route({
  body: schema,
  rateLimit: "auth",
  handler: async ({ auth, body }) => {
    const membership = auth.memberships.find(
      (entry) => entry.organizationId === body.organizationId,
    );
    if (!membership) {
      throw new AppError("FORBIDDEN", "not a member of this organization", {
        userMessage: "You do not have access to that workspace.",
      });
    }
    await switchOrganization(body.organizationId);
    await auditAs(auth, {
      action: "organization.switched",
      entityType: "organization",
      entityId: body.organizationId,
      entityLabel: membership.organizationName,
      organizationId: body.organizationId,
    });
    return {
      data: {
        organizationId: body.organizationId,
        name: membership.organizationName,
        role: membership.role,
      },
    };
  },
});
