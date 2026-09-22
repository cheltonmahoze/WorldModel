import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { paginationFrom, paginated } from "@/server/api";
import { contactCreateSchema } from "@/server/validation";
import { auditAs } from "@/server/audit";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

const filterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().optional(),
  customerId: z.string().optional(),
});

export const GET = route({
  query: filterSchema,
  handler: async ({ auth, query, db }) => {
    const { page, pageSize, skip, take } = paginationFrom(query);
    const where: Prisma.ContactWhereInput = {
      organizationId: auth.organization.id,
      deletedAt: null,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: "insensitive" } },
              { lastName: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.contact.findMany({
        where,
        orderBy: [{ customer: { name: "asc" } }, { isPrimary: "desc" }],
        skip,
        take,
        include: {
          customer: { select: { id: true, name: true, segment: true } },
        },
      }),
      db.contact.count({ where }),
    ]);
    return paginated(items, total, page, pageSize);
  },
});

export const POST = route({
  permission: "customers:write",
  body: contactCreateSchema,
  rateLimit: "write",
  handler: async ({ auth, body, db }) => {
    const customer = await db.customer.findFirst({
      where: {
        id: body.customerId,
        organizationId: auth.organization.id,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });
    if (!customer) throw AppError.notFound("Customer");
    const contact = await db.contact.create({
      data: { ...body, organizationId: auth.organization.id },
    });
    await auditAs(auth, {
      action: "contact.created",
      entityType: "contact",
      entityId: contact.id,
      entityLabel: `${contact.firstName} ${contact.lastName}`,
      after: { customer: customer.name, title: contact.title },
    });
    return { data: contact };
  },
});
