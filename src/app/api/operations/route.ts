import { route } from "@/server/api";
import { resolveWindow } from "@/server/engines/metrics";
import { z } from "zod";

const querySchema = z.object({
  window: z.enum(["30d", "90d", "qtd", "ytd"]).default("90d"),
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]).optional(),
});

export const GET = route({
  query: querySchema,
  handler: async ({ auth, query, db }) => {
    const organizationId = auth.organization.id;
    const window = resolveWindow(query.window ?? "90d");

    const [tickets, tasks, activities, executions, automations, jobs] =
      await Promise.all([
        db.supportTicket.findMany({
          where: {
            organizationId,
            ...(query.status ? { status: query.status } : {}),
          },
          orderBy: [{ status: "asc" }, { openedAt: "desc" }],
          take: 120,
          include: {
            customer: {
              select: { id: true, name: true, arr: true, healthScore: true },
            },
            assignee: { select: { id: true, name: true, avatarUrl: true } },
          },
        }),
        db.activity.findMany({
          where: {
            organizationId,
            deletedAt: null,
            type: "TASK",
            completedAt: null,
          },
          orderBy: [{ dueAt: "asc" }],
          take: 60,
          include: {
            customer: { select: { id: true, name: true } },
            opportunity: { select: { id: true, name: true, code: true } },
            user: { select: { id: true, name: true } },
          },
        }),
        db.activity.findMany({
          where: {
            organizationId,
            deletedAt: null,
            occurredAt: { gte: window.from },
          },
          select: {
            type: true,
            durationMinutes: true,
            userId: true,
            occurredAt: true,
            outcome: true,
          },
        }),
        db.automationExecution.findMany({
          where: { organizationId, startedAt: { gte: window.from } },
          orderBy: { startedAt: "desc" },
          take: 80,
          include: { automation: { select: { id: true, name: true } } },
        }),
        db.automation.findMany({
          where: { organizationId, deletedAt: null },
          select: {
            id: true,
            name: true,
            status: true,
            runCount: true,
            successCount: true,
            failureCount: true,
            timeSavedMinutes: true,
            lastRunAt: true,
            lastStatus: true,
          },
        }),
        db.job.findMany({
          where: { organizationId },
          orderBy: { scheduledFor: "desc" },
          take: 12,
        }),
      ]);

    const resolved = tickets.filter((ticket) => ticket.resolutionMinutes);
    const averageResolution = resolved.length
      ? resolved.reduce(
          (acc, ticket) => acc + (ticket.resolutionMinutes ?? 0),
          0,
        ) / resolved.length
      : 0;
    const breached = tickets.filter((ticket) => ticket.slaBreached);
    const csats = tickets
      .map((ticket) => ticket.csatScore)
      .filter((score): score is number => typeof score === "number");

    const workload = new Map<
      string,
      { name: string; open: number; breached: number }
    >();
    for (const ticket of tickets) {
      if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") continue;
      const key = ticket.assignee?.id ?? "unassigned";
      const entry = workload.get(key) ?? {
        name: ticket.assignee?.name ?? "Unassigned",
        open: 0,
        breached: 0,
      };
      entry.open += 1;
      if (ticket.slaBreached) entry.breached += 1;
      workload.set(key, entry);
    }

    const automationRuns = executions.length;
    const automationFailures = executions.filter(
      (execution) => execution.status === "FAILED",
    ).length;

    return {
      data: {
        window: { key: query.window, from: window.from, to: window.to },
        support: {
          total: tickets.length,
          open: tickets.filter(
            (ticket) => ticket.status === "OPEN" || ticket.status === "PENDING",
          ).length,
          breached: breached.length,
          breachRate: tickets.length
            ? (breached.length / tickets.length) * 100
            : 0,
          averageFirstResponse:
            tickets
              .filter((ticket) => ticket.firstResponseMinutes)
              .reduce(
                (acc, ticket) => acc + (ticket.firstResponseMinutes ?? 0),
                0,
              ) /
            Math.max(
              1,
              tickets.filter((ticket) => ticket.firstResponseMinutes).length,
            ),
          averageResolution,
          csat: csats.length
            ? csats.reduce((acc, score) => acc + score, 0) / csats.length
            : null,
          byPriority: group(tickets, (ticket) => ticket.priority),
          byStatus: group(tickets, (ticket) => ticket.status),
          workload: [...workload.entries()]
            .map(([id, value]) => ({ id, ...value }))
            .sort((a, b) => b.open - a.open),
        },
        tasks: {
          total: tasks.length,
          overdue: tasks.filter((task) => task.dueAt && task.dueAt < new Date())
            .length,
          items: tasks.slice(0, 25),
        },
        capacity: {
          activities: activities.length,
          hoursLogged: Math.round(
            activities.reduce(
              (acc, activity) => acc + (activity.durationMinutes ?? 0),
              0,
            ) / 60,
          ),
          manualHours: Math.round(
            activities
              .filter((activity) => ["TASK", "NOTE"].includes(activity.type))
              .reduce(
                (acc, activity) => acc + (activity.durationMinutes ?? 6),
                0,
              ) / 60,
          ),
          byType: group(activities, (activity) => activity.type),
          byUser: group(
            activities,
            (activity) => activity.userId ?? "unassigned",
          ),
        },
        automation: {
          total: automations.length,
          active: automations.filter(
            (automation) => automation.status === "ACTIVE",
          ).length,
          paused: automations.filter(
            (automation) => automation.status === "PAUSED",
          ).length,
          draft: automations.filter(
            (automation) => automation.status === "DRAFT",
          ).length,
          runs: automationRuns,
          failureRate: automationRuns
            ? (automationFailures / automationRuns) * 100
            : 0,
          hoursSaved: Math.round(
            automations.reduce(
              (acc, automation) => acc + automation.timeSavedMinutes,
              0,
            ) / 60,
          ),
          items: automations,
          recent: executions.slice(0, 20).map((execution) => ({
            id: execution.id,
            automation: execution.automation.name,
            automationId: execution.automationId,
            status: execution.status,
            startedAt: execution.startedAt,
            durationMs: execution.durationMs,
            entityLabel: execution.entityLabel,
            errorMessage: execution.errorMessage,
          })),
        },
        jobs,
        tickets: tickets.map((ticket) => ({ ...ticket })),
      },
    };
  },
});

function group<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, number>();
  for (const item of items)
    map.set(keyFn(item), (map.get(keyFn(item)) ?? 0) + 1);
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}
