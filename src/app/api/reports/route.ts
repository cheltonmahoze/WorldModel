import { route } from "@/server/api";
import { paginated, paginationFrom } from "@/server/api";
import { reportCreateSchema } from "@/server/validation";
import { auditAs } from "@/server/audit";
import { paginationSchema } from "@/server/validation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

const filterSchema = paginationSchema.extend({ type: z.string().optional() });

export const GET = route({
  query: filterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take } = paginationFrom(query);
    const where: Prisma.ReportWhereInput = {
      organizationId: auth.organization.id,
      deletedAt: null,
      ...(query.type ? { type: query.type as never } : {}),
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
    };
    const [items, total] = await Promise.all([
      db.report.findMany({
        where,
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
        skip,
        take,
      }),
      db.report.count({ where }),
    ]);
    return paginated(items, total, page, pageSize);
  },
});

export const POST = route({
  permission: "reports:write",
  body: reportCreateSchema,
  rateLimit: "write",
  handler: async ({ auth, body, db }) => {
    const report = await db.report.create({
      data: {
        organizationId: auth.organization.id,
        name: body.name,
        description: body.description ?? null,
        type: body.type,
        config: body.config as never,
        schedule: body.schedule,
        recipients: body.recipients,
        format: body.format,
        isShared: body.isShared,
        isPinned: body.isPinned,
        createdById: auth.user.id,
      },
    });
    await auditAs(auth, {
      action: "report.created",
      entityType: "report",
      entityId: report.id,
      entityLabel: report.name,
      after: { type: report.type, schedule: report.schedule },
    });
    return { data: report };
  },
});
