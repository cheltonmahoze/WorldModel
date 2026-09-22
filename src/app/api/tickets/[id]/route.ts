import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { z } from "zod";

const schema = z.object({
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().min(8).optional().nullable(),
  csatScore: z.coerce.number().int().min(1).max(5).optional().nullable(),
});

export const PATCH = route({
  permission: "customers:write",
  body: schema,
  rateLimit: "write",
  handler: async ({ auth, params, body, db }) => {
    const existing = await db.supportTicket.findFirst({
      where: { id: params.id, organizationId: auth.organization.id },
    });
    if (!existing) throw AppError.notFound("Ticket");
    const resolved = body.status === "RESOLVED" || body.status === "CLOSED";
    const ticket = await db.supportTicket.update({
      where: { id: existing.id },
      data: {
        ...body,
        resolvedAt: resolved
          ? (existing.resolvedAt ?? new Date())
          : body.status
            ? null
            : undefined,
        resolutionMinutes:
          resolved && !existing.resolutionMinutes
            ? Math.round((Date.now() - existing.openedAt.getTime()) / 60_000)
            : undefined,
      },
    });
    await auditAs(auth, {
      action: resolved ? "ticket.resolved" : "ticket.updated",
      entityType: "ticket",
      entityId: existing.id,
      entityLabel: existing.reference,
      before: {
        status: existing.status,
        priority: existing.priority,
        assigneeId: existing.assigneeId,
      },
      after: {
        status: ticket.status,
        priority: ticket.priority,
        assigneeId: ticket.assigneeId,
      },
    });
    return { data: ticket };
  },
});
