import { route } from "@/server/api";
import { PLANS } from "@/lib/plans";

export const GET = route({
  handler: async ({ auth, db }) => {
    const organizationId = auth.organization.id;
    const [members, teams, teamMembers, workload, accounts] = await Promise.all([
      db.membership.findMany({
        where: { organizationId, deletedAt: null },
        orderBy: [{ status: "asc" }, { role: "asc" }, { createdAt: "asc" }],
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastActiveAt: true, emailVerifiedAt: true, createdAt: true } },
        },
      }),
      db.team.findMany({ where: { organizationId, deletedAt: null }, orderBy: { name: "asc" }, include: { _count: { select: { members: true } } } }),
      db.teamMember.findMany({ where: { organizationId }, select: { userId: true, isLead: true, team: { select: { id: true, name: true, color: true } } } }),
      db.opportunity.groupBy({
        by: ["ownerId"],
        where: { organizationId, deletedAt: null, stage: { in: ["DISCOVERY", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "CONTRACT_SENT"] } },
        _count: true,
        _sum: { amount: true },
      }),
      db.customer.groupBy({ by: ["ownerId"], where: { organizationId, deletedAt: null }, _count: true, _sum: { arr: true } }),
    ]);

    const workloadByUser = new Map(workload.map((row) => [row.ownerId, { openDeals: row._count, openPipeline: Number(row._sum.amount ?? 0) }]));
    const accountsByUser = new Map(accounts.map((row) => [row.ownerId, { accounts: row._count, arr: Number(row._sum.arr ?? 0) }]));
    const teamsByUser = new Map<string, { id: string; name: string; color: string | null; isLead: boolean }[]>();
    for (const row of teamMembers) {
      const list = teamsByUser.get(row.userId) ?? [];
      list.push({ id: row.team.id, name: row.team.name, color: row.team.color, isLead: row.isLead });
      teamsByUser.set(row.userId, list);
    }

    const invites = members.filter((member) => member.status === "INVITED");
    const plan = PLANS[auth.organization.plan];
    const activeSeats = members.filter((member) => member.status !== "INVITED").length;

    return {
      data: {
        members: members.map((membership) => ({
          id: membership.id,
          userId: membership.userId,
          role: membership.role,
          status: membership.status,
          title: membership.title,
          department: membership.department,
          joinedAt: membership.joinedAt,
          lastSeenAt: membership.lastSeenAt,
          invitedEmail: membership.invitedEmail,
          inviteExpiresAt: membership.inviteExpiresAt,
          user: membership.user,
          teams: teamsByUser.get(membership.userId) ?? [],
          workload: workloadByUser.get(membership.userId) ?? { openDeals: 0, openPipeline: 0 },
          accounts: accountsByUser.get(membership.userId) ?? { accounts: 0, arr: 0 },
          isCurrentUser: membership.userId === auth.user.id,
        })),
        teams,
        invites,
        seats: { used: activeSeats, pending: invites.length, limit: plan.limits.seats, plan: plan.id },
        roleSummary: Object.entries(
          members.reduce<Record<string, number>>((acc, member) => {
            acc[member.role] = (acc[member.role] ?? 0) + 1;
            return acc;
          }, {}),
        ).map(([role, count]) => ({ role, count })),
        canManage: auth.permissions.includes("members:update") || auth.permissions.includes("members:invite"),
      },
    };
  },
});
