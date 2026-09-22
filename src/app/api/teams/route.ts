import { route } from "@/server/api";
import { teamSchema } from "@/server/validation";
import { auditAs } from "@/server/audit";
import { AppError } from "@/server/errors";

export const GET = route({
  handler: async ({ auth, db }) => {
    const organizationId = auth.organization.id;
    const [teams, memberships, deals, customers] = await Promise.all([
      db.team.findMany({
        where: { organizationId, deletedAt: null },
        orderBy: { name: "asc" },
        include: { members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true } } } } },
      }),
      db.membership.findMany({ where: { organizationId, status: "ACTIVE", deletedAt: null }, select: { userId: true, role: true, title: true } }),
      db.opportunity.groupBy({ by: ["ownerId"], where: { organizationId, deletedAt: null, stage: { in: ["DISCOVERY", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "CONTRACT_SENT"] } }, _count: true, _sum: { amount: true } }),
      db.customer.groupBy({ by: ["ownerId"], where: { organizationId, deletedAt: null }, _count: true, _sum: { arr: true } }),
    ]);

    const dealByUser = new Map(deals.map((row) => [row.ownerId, { deals: row._count, value: Number(row._sum.amount ?? 0) }]));
    const customerByUser = new Map(customers.map((row) => [row.ownerId, { accounts: row._count, arr: Number(row._sum.arr ?? 0) }]));
    const membershipByUser = new Map(memberships.map((row) => [row.userId, row]));

    return {
      data: teams.map((team) => {
        const members = team.members.map((member) => ({
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          avatarUrl: member.user.avatarUrl,
          jobTitle: member.user.jobTitle,
          role: membershipByUser.get(member.userId)?.role ?? "MEMBER",
          isLead: member.isLead,
          workload: dealByUser.get(member.userId) ?? { deals: 0, value: 0 },
          accounts: customerByUser.get(member.userId) ?? { accounts: 0, arr: 0 },
        }));
        return {
          id: team.id,
          name: team.name,
          description: team.description,
          department: team.department,
          color: team.color,
          leadId: team.leadId,
          leadName: members.find((member) => member.id === team.leadId)?.name ?? members.find((member) => member.isLead)?.name ?? null,
          members,
          totals: members.reduce(
            (acc, member) => {
              acc.openPipeline += member.workload.value;
              acc.openDeals += member.workload.deals;
              acc.accounts += member.accounts.accounts;
              acc.arr += member.accounts.arr;
              return acc;
            },
            { openPipeline: 0, openDeals: 0, accounts: 0, arr: 0 },
          ),
        };
      }),
      meta: { total: teams.length },
    };
  },
});

export const POST = route({
  body: teamSchema,
  rateLimit: "write",
  permission: "teams:manage",
  handler: async ({ auth, body, db }) => {
    const existing = await db.team.findFirst({ where: { organizationId: auth.organization.id, name: body.name, deletedAt: null } });
    if (existing) throw new AppError("CONFLICT", "team exists", { userMessage: "A team with that name already exists." });
    if (body.leadId) {
      const lead = await db.membership.findFirst({ where: { organizationId: auth.organization.id, userId: body.leadId, deletedAt: null } });
      if (!lead) throw new AppError("BAD_REQUEST", "unknown lead", { userMessage: "The selected lead is not a member of this workspace." });
    }
    const team = await db.$transaction(async (transaction) => {
      const created = await transaction.team.create({
        data: {
          organizationId: auth.organization.id,
          name: body.name,
          description: body.description ?? null,
          department: body.department ?? null,
          color: body.color ?? "#4F46E5",
          leadId: body.leadId ?? null,
        },
      });
      if (body.leadId) {
        await transaction.teamMember.upsert({
          where: { teamId_userId: { teamId: created.id, userId: body.leadId } },
          create: { teamId: created.id, userId: body.leadId, organizationId: auth.organization.id, isLead: true },
          update: { isLead: true },
        });
      }
      return created;
    });
    await auditAs(auth, { action: "team.created", entityType: "team", entityId: team.id, entityLabel: team.name, after: { department: team.department, leadId: team.leadId } });
    return { data: team };
  },
});
