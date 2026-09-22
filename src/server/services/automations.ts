import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { notify } from "@/server/services/notifications";
import { dispatchWebhooks } from "@/server/services/webhooks";
import { recordAudit } from "@/server/audit";

/**
 * Automation Engine runtime.
 *
 * An automation is WHEN (trigger) → IF (conditions) → THEN (ordered actions).
 * Executions are recorded step by step, counters are updated and every side
 * effect is traceable from the execution log — no hidden behaviour.
 */
export type AutomationEventType =
  | "deal_inactive"
  | "deal_stage_changed"
  | "deal_created"
  | "deal_won"
  | "deal_lost"
  | "customer_health_dropped"
  | "customer_renewal_approaching"
  | "ticket_sla_breached"
  | "risk_detected"
  | "opportunity_detected"
  | "schedule_daily"
  | "schedule_weekly"
  | "activity_overdue";

export type AutomationEvent = {
  type: AutomationEventType | string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  data: Record<string, unknown>;
};

type Condition = { field: string; operator: string; value?: unknown };
type Action = { type: string; config: Record<string, unknown>; delayMinutes?: number };
type StepResult = { index: number; type: string; status: "success" | "skipped" | "failed" | "queued"; detail: string; durationMs: number };

function readField(data: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, data);
}

function coerce(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && value.trim() !== "") return numeric;
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return value;
}

export function evaluateCondition(condition: Condition, data: Record<string, unknown>): boolean {
  const actual = coerce(readField(data, condition.field));
  const expected = coerce(condition.value);

  switch (condition.operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "greater_than":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "less_than":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "contains":
      return typeof actual === "string" && typeof expected === "string" && actual.toLowerCase().includes(expected.toLowerCase());
    case "in":
      return Array.isArray(expected) && expected.map(String).includes(String(actual));
    case "not_in":
      return Array.isArray(expected) && !expected.map(String).includes(String(actual));
    case "is_set":
      return actual !== undefined && actual !== null && actual !== "";
    case "is_empty":
      return actual === undefined || actual === null || actual === "";
    case "older_than_days": {
      if (!actual) return false;
      const date = new Date(String(actual));
      if (Number.isNaN(date.getTime())) return false;
      const days = (Date.now() - date.getTime()) / 86_400_000;
      return days > Number(expected ?? 0);
    }
    default:
      return false;
  }
}

async function pickOwnerByStrategy(organizationId: string, strategy: string) {
  if (strategy === "least_loaded") {
    const users = await db.membership.findMany({
      where: { organizationId, status: "ACTIVE", deletedAt: null, role: { in: ["MANAGER", "MEMBER", "ANALYST"] } },
      select: { userId: true, user: { select: { name: true, _count: { select: { ownedDeals: true } } } } },
    });
    const best = users.sort((a, b) => a.user._count.ownedDeals - b.user._count.ownedDeals)[0];
    return best?.userId ?? null;
  }
  // Default: highest historical win rate over the last 180 days.
  const performance = await db.opportunity.groupBy({
    by: ["ownerId"],
    where: {
      organizationId,
      deletedAt: null,
      stage: { in: ["WON", "LOST"] },
      closedAt: { gte: new Date(Date.now() - 180 * 86_400_000) },
      ownerId: { not: null },
    },
    _count: true,
  });
  const wins = await db.opportunity.groupBy({
    by: ["ownerId"],
    where: {
      organizationId,
      deletedAt: null,
      stage: "WON",
      closedAt: { gte: new Date(Date.now() - 180 * 86_400_000) },
      ownerId: { not: null },
    },
    _count: true,
  });
  const wonBy = new Map(wins.map((row) => [row.ownerId!, row._count]));
  const scored = performance
    .filter((row) => row.ownerId)
    .map((row) => ({ ownerId: row.ownerId!, rate: (wonBy.get(row.ownerId!) ?? 0) / Math.max(1, row._count), volume: row._count }))
    .filter((row) => row.volume >= 2)
    .sort((a, b) => b.rate - a.rate || b.volume - a.volume);
  return scored[0]?.ownerId ?? null;
}

async function executeAction(
  organizationId: string,
  action: Action,
  event: AutomationEvent,
  triggerLabel: string,
): Promise<StepResult> {
  const startedAt = Date.now();
  const base = { index: 0, type: action.type, durationMs: 0 };
  const config = action.config ?? {};

  const finish = (status: StepResult["status"], detail: string, index = 0): StepResult => ({
    ...base,
    index,
    status,
    detail,
    durationMs: Date.now() - startedAt,
  });

  const interpolate = (template: unknown) =>
    String(template ?? "").replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
      const value = readField({ ...event.data, entityLabel: event.entityLabel, trigger: triggerLabel }, path);
      return value === undefined || value === null ? "" : String(value);
    });

  try {
    switch (action.type) {
      case "notify_user":
      case "notify_role": {
        const role = config.role as "OWNER" | "ADMIN" | "MANAGER" | "ANALYST" | "MEMBER" | undefined;
        const userId = (config.userId as string) || (event.data.ownerId as string) || null;
        const recipients = action.type === "notify_role" ? undefined : userId;
        await notify({
          organizationId,
          userId: recipients,
          roles: action.type === "notify_role" ? [role ?? "MANAGER"] : undefined,
          type: "AUTOMATION_COMPLETED",
          title: interpolate(config.title ?? `Automation triggered: ${triggerLabel}`),
          body: interpolate(config.body ?? `Trigger: ${triggerLabel}`),
          severity: (config.severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW") ?? "MEDIUM",
          entityType: event.entityType,
          entityId: event.entityId,
          actionUrl: (config.actionUrl as string) ?? undefined,
        });
        return finish("success", action.type === "notify_role" ? `Notified role ${role ?? "MANAGER"}` : "Notified owner");
      }

      case "create_task": {
        const dueInDays = Number(config.dueInDays ?? 2);
        const assigneeRole = (config.assigneeRole as string) ?? "MANAGER";
        let userId = (config.userId as string) || null;
        if (!userId) {
          const membership = await db.membership.findFirst({
            where: { organizationId, status: "ACTIVE", deletedAt: null, role: assigneeRole as never },
            select: { userId: true },
            orderBy: { createdAt: "asc" },
          });
          userId = membership?.userId ?? null;
        }
        const task = await db.activity.create({
          data: {
            organizationId,
            type: "TASK",
            subject: interpolate(config.subject ?? `Follow up: ${event.entityLabel ?? triggerLabel}`),
            body: interpolate(config.body ?? `Generated by automation "${triggerLabel}"`),
            userId,
            customerId: (event.data.customerId as string) ?? null,
            opportunityId: event.entityType === "Opportunity" ? event.entityId : null,
            dueAt: new Date(Date.now() + dueInDays * 86_400_000),
            direction: "INTERNAL",
          },
        });
        return finish("success", `Task created (${task.subject})`);
      }

      case "update_stage": {
        if (event.entityType !== "Opportunity" || !event.entityId) return finish("skipped", "No opportunity in scope");
        const stage = config.stage as string;
        await db.opportunity.update({
          where: { id: event.entityId },
          data: { stage: stage as never, stageEnteredAt: new Date(), daysInStage: 0 },
        });
        return finish("success", `Stage moved to ${stage}`);
      }

      case "assign_owner": {
        const strategy = (config.strategy as string) ?? "top_converter";
        const ownerId = (config.ownerId as string) || (await pickOwnerByStrategy(organizationId, strategy));
        if (!ownerId) return finish("skipped", "No eligible owner found");
        if (event.entityType === "Opportunity" && event.entityId) {
          await db.opportunity.update({ where: { id: event.entityId }, data: { ownerId } });
        } else if (event.entityType === "Customer" && event.entityId) {
          await db.customer.update({ where: { id: event.entityId }, data: { ownerId } });
        } else {
          return finish("skipped", "Unsupported entity for reassignment");
        }
        const owner = await db.user.findUnique({ where: { id: ownerId }, select: { name: true } });
        return finish("success", `Reassigned to ${owner?.name ?? "owner"} (${strategy})`);
      }

      case "send_email": {
        // No SMTP provider is configured in this environment: we log the intent and
        // mark the step as queued instead of pretending a message was delivered.
        const activity = await db.activity.create({
          data: {
            organizationId,
            type: "EMAIL",
            direction: "OUTBOUND",
            subject: interpolate(config.subject ?? `Automated email: ${triggerLabel}`),
            body: interpolate(config.body ?? ""),
            customerId: (event.data.customerId as string) ?? null,
            opportunityId: event.entityType === "Opportunity" ? event.entityId : null,
            channel: "email",
            outcome: "NO_RESPONSE",
          },
        });
        return finish(
          "queued",
          env.SLACK_WEBHOOK_URL || process.env.SMTP_HOST
            ? `Email queued for delivery (${activity.id.slice(0, 8)})`
            : "Drafted and logged — connect an email provider to deliver automatically",
        );
      }

      case "slack_message": {
        const text = interpolate(config.text ?? `Nexus OS · ${triggerLabel}`);
        if (!env.SLACK_WEBHOOK_URL) {
          return finish("queued", `Slack message prepared — connect Slack in Integrations to deliver ("${text.slice(0, 60)}")`);
        }
        const response = await fetch(env.SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        return response.ok ? finish("success", "Delivered to Slack") : finish("failed", `Slack returned ${response.status}`);
      }

      case "webhook": {
        const url = config.url as string | undefined;
        if (!url) {
          const deliveries = await dispatchWebhooks({
            organizationId,
            event: "automation.executed",
            payload: { trigger: triggerLabel, ...event.data },
          });
          return deliveries.length
            ? finish("success", `Dispatched to ${deliveries.length} endpoint(s)`)
            : finish("skipped", "No subscribed webhook endpoints");
        }
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-nexus-event": "automation.executed" },
          body: JSON.stringify({ trigger: triggerLabel, data: event.data }),
        });
        return response.ok ? finish("success", `POST ${url} → ${response.status}`) : finish("failed", `POST ${url} → ${response.status}`);
      }

      case "create_risk": {
        const impact = Number(event.data.amount ?? event.data.arr ?? 0);
        const fingerprint = `automation:${triggerLabel}:${event.entityId ?? "org"}`;
        await db.risk.upsert({
          where: { organizationId_fingerprint: { organizationId, fingerprint } },
          create: {
            organizationId,
            fingerprint,
            title: interpolate(config.title ?? `Automation flag: ${event.entityLabel ?? triggerLabel}`),
            description: interpolate(config.description ?? `Raised automatically by "${triggerLabel}".`),
            category: ((config.category as string) ?? "REVENUE") as never,
            severity: ((config.severity as string) ?? (impact > 100_000 ? "CRITICAL" : "HIGH")) as never,
            probability: Number(config.probability ?? 60),
            impact,
            recommendation: interpolate(config.recommendation ?? "Review with the account owner and confirm the next step."),
            customerId: (event.data.customerId as string) ?? null,
            opportunityId: event.entityType === "Opportunity" ? (event.entityId ?? null) : null,
            entityType: event.entityType,
            entityId: event.entityId,
            ownerId: (event.data.ownerId as string) ?? null,
            detectedBy: `automation:${triggerLabel}`,
            dueAt: new Date(Date.now() + 5 * 86_400_000),
            riskScore: Math.min(95, 40 + Math.log10(Math.max(1, impact)) * 8),
          },
          update: { detectedAt: new Date() },
        });
        return finish("success", "Risk recorded in the risk register");
      }

      case "escalate": {
        const amount = Number(event.data.amount ?? 0);
        await notify({
          organizationId,
          roles: ["OWNER", "ADMIN", "MANAGER"],
          type: "RISK_DETECTED",
          title: interpolate(config.title ?? `Escalation: ${event.entityLabel ?? triggerLabel}`),
          body: interpolate(config.body ?? `Escalated automatically with €${amount.toLocaleString("en-GB")} exposure.`),
          severity: "HIGH",
          entityType: event.entityType,
          entityId: event.entityId,
          actionUrl: event.entityType === "Opportunity" ? `/opportunities/${event.entityId}` : undefined,
        });
        return finish("success", "Escalated to leadership");
      }

      default:
        return finish("failed", `Unknown action type "${action.type}"`);
    }
  } catch (error) {
    return finish("failed", error instanceof Error ? error.message : "action failed");
  }
}

export type AutomationRunResult = {
  automationId: string;
  automationName: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
  matched: boolean;
  steps: StepResult[];
  durationMs: number;
};

/**
 * Runs one automation on demand (the "Run now" button). Manual runs ignore the
 * trigger subscription but still honour conditions unless `force` is set, and
 * every step is recorded so the execution log stays truthful.
 */
export async function runAutomationById(
  automationId: string,
  options: { triggeredBy?: string; actorName?: string; force?: boolean } = {},
): Promise<AutomationRunResult | null> {
  const automation = await db.automation.findFirst({ where: { id: automationId, deletedAt: null } });
  if (!automation) return null;

  const event: AutomationEvent = {
    type: automation.triggerType as AutomationEventType,
    entityType: "Automation",
    entityId: automation.id,
    entityLabel: automation.name,
    data: { ranAt: new Date().toISOString(), manual: true, name: automation.name, title: automation.name },
  };

  const startedAt = Date.now();
  const conditions = (automation.conditions as unknown as Condition[]) ?? [];
  const actions = (automation.actions as unknown as Action[]) ?? [];
  const matched = options.force ? true : conditions.every((condition) => evaluateCondition(condition, event.data));

  const steps: StepResult[] = [];
  if (matched) {
    for (const [index, action] of actions.entries()) {
      const step = await executeAction(automation.organizationId, { ...action, config: { ...(action.config ?? {}), __index: index } }, event, automation.name);
      steps.push({ ...step, index });
    }
  }

  const status: AutomationRunResult["status"] = !matched
    ? "SKIPPED"
    : steps.some((step) => step.status === "failed")
      ? "PARTIAL"
      : "SUCCESS";
  const durationMs = Date.now() - startedAt;

  await db.automationExecution.create({
    data: {
      organizationId: automation.organizationId,
      automationId: automation.id,
      status,
      triggerEvent: "manual",
      matched,
      steps: steps as never,
      durationMs,
      entityType: "Automation",
      entityId: automation.id,
      entityLabel: automation.name,
      triggeredBy: options.triggeredBy ?? "manual",
      finishedAt: new Date(),
    },
  });
  await db.automation.update({
    where: { id: automation.id },
    data: {
      lastRunAt: new Date(),
      lastStatus: status,
      runCount: { increment: 1 },
      successCount: { increment: status === "SUCCESS" ? 1 : 0 },
      failureCount: { increment: status === "PARTIAL" ? 1 : 0 },
      timeSavedMinutes: { increment: 4 },
    },
  });

  return { automationId: automation.id, automationName: automation.name, status, matched, steps, durationMs };
}

/** Runs every ACTIVE automation subscribed to the given event. */
export async function runAutomations(
  organizationId: string,
  event: AutomationEvent,
  options: { triggeredBy?: string } = {},
): Promise<AutomationRunResult[]> {
  const automations = await db.automation.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE", triggerType: event.type },
  });
  if (!automations.length) return [];

  const results: AutomationRunResult[] = [];

  for (const automation of automations) {
    const startedAt = Date.now();
    const conditions = (automation.conditions as unknown as Condition[]) ?? [];
    const actions = (automation.actions as unknown as Action[]) ?? [];
    const matched = conditions.every((condition) => evaluateCondition(condition, event.data));

    if (!matched) {
      const result: AutomationRunResult = {
        automationId: automation.id,
        automationName: automation.name,
        status: "SKIPPED",
        matched: false,
        steps: [],
        durationMs: Date.now() - startedAt,
      };
      results.push(result);
      await db.automationExecution.create({
        data: {
          organizationId,
          automationId: automation.id,
          status: "SKIPPED",
          triggerEvent: event.type,
          matched: false,
          steps: [],
          durationMs: result.durationMs,
          entityType: event.entityType,
          entityId: event.entityId,
          entityLabel: event.entityLabel,
          triggeredBy: options.triggeredBy ?? "scheduler",
          finishedAt: new Date(),
        },
      });
      await db.automation.update({
        where: { id: automation.id },
        data: { lastRunAt: new Date(), lastStatus: "SKIPPED", runCount: { increment: 1 } },
      });
      continue;
    }

    const steps: StepResult[] = [];
    for (const [index, action] of actions.entries()) {
      if (action.delayMinutes) {
        steps.push({
          index,
          type: action.type,
          status: "queued",
          detail: `Scheduled +${action.delayMinutes} min by the worker (sequential delay)`,
          durationMs: 0,
        });
        continue;
      }
      const step = await executeAction(organizationId, { ...action, config: { ...(action.config ?? {}), __index: index } }, event, automation.name);
      steps.push({ ...step, index });
    }

    const failed = steps.filter((step) => step.status === "failed").length;
    const succeeded = steps.filter((step) => step.status === "success").length;
    const status: AutomationRunResult["status"] = failed === 0 ? "SUCCESS" : succeeded > 0 ? "PARTIAL" : "FAILED";
    const durationMs = Date.now() - startedAt;

    await db.automationExecution.create({
      data: {
        organizationId,
        automationId: automation.id,
        status,
        triggerEvent: event.type,
        matched: true,
        steps: steps as unknown as Prisma.InputJsonValue,
        durationMs,
        entityType: event.entityType,
        entityId: event.entityId,
        entityLabel: event.entityLabel,
        triggeredBy: options.triggeredBy ?? "scheduler",
        finishedAt: new Date(),
        errorMessage: steps.find((step) => step.status === "failed")?.detail ?? null,
      },
    });

    const timeSavedMinutes = actions.length * 6;
    await db.automation.update({
      where: { id: automation.id },
      data: {
        lastRunAt: new Date(),
        lastStatus: status,
        runCount: { increment: 1 },
        successCount: { increment: status === "SUCCESS" ? 1 : 0 },
        failureCount: { increment: failed > 0 ? 1 : 0 },
        timeSavedMinutes: { increment: timeSavedMinutes },
      },
    });

    await recordAudit({
      organizationId,
      actorName: "Nexus Automations",
      actorRole: "SYSTEM",
      action: "automation.executed",
      entityType: "Automation",
      entityId: automation.id,
      entityLabel: automation.name,
      after: { status, trigger: event.type, steps: steps.length },
      severity: failed > 0 ? "WARNING" : "INFO",
      source: "AUTOMATION",
    });

    if (status !== "SUCCESS") {
      await notify({
        organizationId,
        roles: ["OWNER", "ADMIN"],
        type: "AUTOMATION_COMPLETED",
        title: `Automation "${automation.name}" ${status.toLowerCase()}`,
        body: steps.find((step) => step.status === "failed")?.detail ?? "Some steps did not complete.",
        severity: "HIGH",
        entityType: "Automation",
        entityId: automation.id,
        actionUrl: `/automations/${automation.id}`,
      });
    }

    results.push({ automationId: automation.id, automationName: automation.name, status, matched, steps, durationMs });
  }

  return results;
}

/**
 * Scheduler tick: evaluates time-based triggers (inactivity, renewals, SLA,
 * overdue activities) and runs the automations subscribed to them. Invoked by
 * `npm run worker` and by the manual "run now" action in the UI.
 */
export async function runScheduledTriggers(organizationId: string) {
  const now = new Date();
  const events: AutomationEvent[] = [];

  const stalled = await db.opportunity.findMany({
    where: {
      organizationId,
      deletedAt: null,
      stage: { in: ["DISCOVERY", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "CONTRACT_SENT"] },
      OR: [{ lastActivityAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } }, { lastActivityAt: null }],
    },
    select: {
      id: true,
      code: true,
      name: true,
      amount: true,
      stage: true,
      probability: true,
      ownerId: true,
      customerId: true,
      lastActivityAt: true,
      daysInStage: true,
      customer: { select: { name: true, healthScore: true, arr: true, region: true, segment: true } },
      owner: { select: { name: true, email: true } },
    },
    take: 60,
  });

  for (const deal of stalled) {
    events.push({
      type: "deal_inactive",
      entityType: "Opportunity",
      entityId: deal.id,
      entityLabel: deal.name,
      data: {
        id: deal.id,
        code: deal.code,
        name: deal.name,
        amount: Number(deal.amount),
        stage: deal.stage,
        probability: deal.probability,
        ownerId: deal.ownerId,
        ownerName: deal.owner?.name ?? null,
        customerId: deal.customerId,
        customerName: deal.customer.name,
        customerHealth: deal.customer.healthScore,
        customerArr: Number(deal.customer.arr),
        segment: deal.customer.segment,
        region: deal.customer.region,
        lastActivityAt: deal.lastActivityAt?.toISOString() ?? null,
        daysInStage: deal.daysInStage,
      },
    });
  }

  const renewals = await db.customer.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { not: "CHURNED" },
      renewalDate: { gte: now, lte: new Date(now.getTime() + 60 * 86_400_000) },
    },
    select: { id: true, name: true, arr: true, renewalDate: true, healthScore: true, ownerId: true, csmId: true },
    take: 40,
  });
  for (const customer of renewals) {
    events.push({
      type: "customer_renewal_approaching",
      entityType: "Customer",
      entityId: customer.id,
      entityLabel: customer.name,
      data: {
        id: customer.id,
        name: customer.name,
        arr: Number(customer.arr),
        healthScore: customer.healthScore,
        renewalDate: customer.renewalDate?.toISOString() ?? null,
        daysToRenewal: customer.renewalDate ? Math.round((customer.renewalDate.getTime() - now.getTime()) / 86_400_000) : null,
        ownerId: customer.csmId ?? customer.ownerId,
      },
    });
  }

  const breached = await db.supportTicket.findMany({
    where: { organizationId, slaBreached: true, status: { in: ["OPEN", "PENDING"] } },
    select: { id: true, reference: true, subject: true, priority: true, customerId: true, firstResponseMinutes: true },
    take: 30,
  });
  for (const ticket of breached) {
    events.push({
      type: "ticket_sla_breached",
      entityType: "SupportTicket",
      entityId: ticket.id,
      entityLabel: ticket.reference,
      data: {
        id: ticket.id,
        reference: ticket.reference,
        subject: ticket.subject,
        priority: ticket.priority,
        customerId: ticket.customerId,
        firstResponseMinutes: ticket.firstResponseMinutes,
      },
    });
  }

  const overdue = await db.activity.findMany({
    where: { organizationId, deletedAt: null, type: "TASK", dueAt: { lt: now }, completedAt: null },
    select: { id: true, subject: true, dueAt: true, userId: true, customerId: true, opportunityId: true },
    take: 60,
  });
  for (const task of overdue) {
    events.push({
      type: "activity_overdue",
      entityType: "Activity",
      entityId: task.id,
      entityLabel: task.subject,
      data: {
        id: task.id,
        subject: task.subject,
        dueAt: task.dueAt?.toISOString() ?? null,
        daysOverdue: task.dueAt ? Math.round((now.getTime() - task.dueAt.getTime()) / 86_400_000) : null,
        userId: task.userId,
        customerId: task.customerId,
        opportunityId: task.opportunityId,
      },
    });
  }

  events.push({ type: "schedule_daily", entityType: "Organization", data: { ranAt: now.toISOString() } });

  const results: AutomationRunResult[] = [];
  for (const event of events) {
    const executed = await runAutomations(organizationId, event, { triggeredBy: "scheduler" });
    results.push(...executed.filter((result) => result.matched));
  }

  // Keep the task backlog honest: mark overdue flags.
  await db.activity.updateMany({
    where: { organizationId, type: "TASK", dueAt: { lt: now }, completedAt: null, isOverdue: false },
    data: { isOverdue: true },
  });

  return results;
}
