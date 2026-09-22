import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { contactUpdateSchema } from "@/server/validation";

export const PATCH = route({
  permission: "customers:write",
  body: contactUpdateSchema,
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.contact.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Contact");
    const contact = await db.contact.update({
      where: { id: existing.id },
      data: body,
    });
    await auditAs(auth, {
      action: "contact.updated",
      entityType: "contact",
      entityId: existing.id,
      entityLabel: `${contact.firstName} ${contact.lastName}`,
      before: {
        title: existing.title,
        email: existing.email,
        isPrimary: existing.isPrimary,
        isDecisionMaker: existing.isDecisionMaker,
      },
      after: {
        title: contact.title,
        email: contact.email,
        isPrimary: contact.isPrimary,
        isDecisionMaker: contact.isDecisionMaker,
      },
    });
    return { data: contact };
  },
});

export const DELETE = route({
  permission: "customers:write",
  rateLimit: "write",
  handler: async ({ auth, params, db }) => {
    const existing = await db.contact.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
    });
    if (!existing) throw AppError.notFound("Contact");
    await db.contact.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await auditAs(auth, {
      action: "contact.deleted",
      entityType: "contact",
      entityId: existing.id,
      entityLabel: `${existing.firstName} ${existing.lastName}`,
      severity: "WARNING",
    });
    return { data: { id: existing.id, deleted: true } };
  },
});
