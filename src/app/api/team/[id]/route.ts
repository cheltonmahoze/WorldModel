import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { updateMemberSchema } from "@/server/validation";
import { assignableRoles, atLeast } from "@/lib/rbac";
import { notify } from "@/server/services/notifications";
import { z } from "zod";

export const PATCH = route({
  body: updateMemberSchema.extend({
    teamId: z.string().min(8).nullable().optional(),
  }),
  rateLimit: "write",
  permission: "members:update",
  handler: async ({ auth, params, body, db }) => {
    const membership = await db.membership.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!membership) throw AppError.notFound("Member");

    if (body.role && !assignableRoles(auth.role).includes(body.role)) {
      throw new AppError("FORBIDDEN", "role not assignable", {
        userMessage: `As ${auth.role.toLowerCase()} you cannot grant the ${body.role.toLowerCase()} role.`,
      });
    }
    if (membership.role === "OWNER" && body.role && body.role !== "OWNER") {
      const owners = await db.membership.count({
        where: {
          organizationId: auth.organization.id,
          role: "OWNER",
          status: "ACTIVE",
          deletedAt: null,
        },
      });
      if (owners <= 1) {
        throw new AppError("BAD_REQUEST", "last owner", {
          userMessage:
            "A workspace must keep at least one owner. Promote someone else first.",
        });
      }
    }
    if (membership.userId === auth.user.id && body.status === "SUSPENDED") {
      throw new AppError("BAD_REQUEST", "cannot suspend self", {
        userMessage: "You cannot suspend your own access.",
      });
    }

    const updated = await db.$transaction(async (transaction) => {
      const next = await transaction.membership.update({
        where: { id: membership.id },
        data: {
          role: body.role ?? undefined,
          title: body.title ?? undefined,
          department: body.department ?? undefined,
          status: body.status ?? undefined,
        },
      });
      if (body.teamId !== undefined) {
        await transaction.teamMember.deleteMany({
          where: {
            userId: membership.userId,
            organizationId: auth.organization.id,
          },
        });
        if (body.teamId) {
          await transaction.teamMember.create({
            data: {
              teamId: body.teamId,
              userId: membership.userId,
              organizationId: auth.organization.id,
            },
          });
        }
      }
      return next;
    });

    if (body.role) {
      await notify({
        organizationId: auth.organization.id,
        userId: membership.userId,
        type: "SYSTEM",
        title: "Your role changed",
        body: `You are now ${body.role.toLowerCase()} in ${auth.organization.name}.`,
        entityType: "membership",
        entityId: membership.id,
        actionUrl: "/settings",
      });
    }

    await auditAs(auth, {
      action: body.role ? "member.role_changed" : "member.updated",
      entityType: "membership",
      entityId: membership.id,
      entityLabel: membership.user.name,
      before: {
        role: membership.role,
        status: membership.status,
        title: membership.title,
        department: membership.department,
      },
      after: {
        role: updated.role,
        status: updated.status,
        title: updated.title,
        department: updated.department,
      },
      severity: body.role || body.status ? "WARNING" : "INFO",
    });

    return { data: updated };
  },
});

export const DELETE = route({
  rateLimit: "write",
  permission: "members:remove",
  handler: async ({ auth, params, db }) => {
    const membership = await db.membership.findFirst({
      where: {
        id: params.id,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!membership) throw AppError.notFound("Member");
    if (membership.role === "OWNER") {
      const owners = await db.membership.count({
        where: {
          organizationId: auth.organization.id,
          role: "OWNER",
          status: "ACTIVE",
          deletedAt: null,
        },
      });
      if (owners <= 1)
        throw new AppError("BAD_REQUEST", "last owner", {
          userMessage: "Promote another owner before removing this one.",
        });
    }
    if (!atLeast(auth.role, "ADMIN") && membership.role !== "MEMBER") {
      throw new AppError("FORBIDDEN", "insufficient role", {
        userMessage: "Managers can only remove members.",
      });
    }

    await db.$transaction([
      db.teamMember.deleteMany({
        where: {
          userId: membership.userId,
          organizationId: auth.organization.id,
        },
      }),
      db.session.updateMany({
        where: {
          userId: membership.userId,
          organizationId: auth.organization.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date(), revokedById: auth.user.id },
      }),
      db.membership.update({
        where: { id: membership.id },
        data: { deletedAt: new Date(), status: "SUSPENDED" },
      }),
    ]);

    await auditAs(auth, {
      action: "member.removed",
      entityType: "membership",
      entityId: membership.id,
      entityLabel: membership.user.name,
      before: {
        role: membership.role,
        status: membership.status,
        email: membership.user.email,
      },
      severity: "WARNING",
    });

    return { data: { id: membership.id, removed: true } };
  },
});
