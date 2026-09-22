import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AUTOMATION_EXECUTION_ERRORS, daysAgo, hoursAgo, id, type Rng } from "./data";
import type { SeedUser } from "./core";

/* ────────────────────────────── notifications ──────────────────────────── */

export async function createNotifications(
  rng: Rng,
  organizationId: string,
  people: SeedUser[],
  anchors: {
    topRisk?: { id: string; title: string };
    topInsight?: { id: string; title: string };
    stalledDeal?: { id: string; name: string; amount: number };
    atRiskCustomer?: { id: string; name: string };
    automation?: { id: string; name: string };
    report?: { id: string; name: string };
  },
  now: Date,
) {
  const recipient = (index: number) => people[index % people.length]!.id;
  const rows: Prisma.NotificationCreateManyInput[] = [];

  const push = (input: {
    type: Prisma.NotificationCreateManyInput["type"];
    title: string;
    body: string;
    severity?: Prisma.NotificationCreateManyInput["severity"];
    entityType?: string;
    entityId?: string;
    actionUrl?: string;
    minutesAgo: number;
    read?: boolean;
    userIndex?: number;
  }) =>
    rows.push({
      id: id("ntf"),
      organizationId,
      userId: input.userIndex === undefined ? null : recipient(input.userIndex),
      type: input.type,
      title: input.title,
      body: input.body,
      severity: input.severity ?? "MEDIUM",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      actionUrl: input.actionUrl ?? null,
      metadata: { source: "seed" } as Prisma.InputJsonValue,
      readAt: input.read ? hoursAgo(input.minutesAgo / 60 + 2, now) : null,
      createdAt: hoursAgo(input.minutesAgo / 60, now),
    });

  if (anchors.topRisk) {
    push({
      type: "RISK_DETECTED",
      title: "Critical risk detected",
      body: anchors.topRisk.title,
      severity: "CRITICAL",
      entityType: "risk",
      entityId: anchors.topRisk.id,
      actionUrl: `/risks/${anchors.topRisk.id}`,
      minutesAgo: 46,
      userIndex: 0,
    });
  }
  if (anchors.topInsight) {
    push({
      type: "OPPORTUNITY_DETECTED",
      title: "New revenue opportunity",
      body: anchors.topInsight.title,
      severity: "HIGH",
      entityType: "insight",
      entityId: anchors.topInsight.id,
      actionUrl: `/opportunities/${anchors.topInsight.id}`,
      minutesAgo: 112,
      userIndex: 0,
    });
    push({
      type: "OPPORTUNITY_DETECTED",
      title: "New revenue opportunity",
      body: anchors.topInsight.title,
      severity: "HIGH",
      entityType: "insight",
      entityId: anchors.topInsight.id,
      actionUrl: `/opportunities/${anchors.topInsight.id}`,
      minutesAgo: 118,
      userIndex: 1,
      read: true,
    });
  }
  if (anchors.stalledDeal) {
    push({
      type: "DEAL_UPDATED",
      title: "Deal flagged as stalled",
      body: `${anchors.stalledDeal.name} (€${Math.round(anchors.stalledDeal.amount).toLocaleString("en-GB")}) has had no activity for 21 days.`,
      severity: "HIGH",
      entityType: "opportunity",
      entityId: anchors.stalledDeal.id,
      actionUrl: `/opportunities?deal=${anchors.stalledDeal.id}`,
      minutesAgo: 260,
      userIndex: 3,
    });
    push({
      type: "TASK_ASSIGNED",
      title: "Task assigned to you",
      body: `Re-engage ${anchors.stalledDeal.name} — due in 2 days.`,
      severity: "MEDIUM",
      entityType: "opportunity",
      entityId: anchors.stalledDeal.id,
      actionUrl: `/operations?tab=tasks`,
      minutesAgo: 258,
      userIndex: 4,
    });
  }
  if (anchors.atRiskCustomer) {
    push({
      type: "CUSTOMER_AT_RISK",
      title: "Account health dropped",
      body: `${anchors.atRiskCustomer.name} fell below the health threshold and needs a save play.`,
      severity: "HIGH",
      entityType: "customer",
      entityId: anchors.atRiskCustomer.id,
      actionUrl: `/customers/${anchors.atRiskCustomer.id}`,
      minutesAgo: 420,
      userIndex: 2,
    });
  }
  if (anchors.automation) {
    push({
      type: "AUTOMATION_COMPLETED",
      title: "Automation run completed",
      body: `${anchors.automation.name} executed 6 actions across 4 records.`,
      severity: "LOW",
      entityType: "automation",
      entityId: anchors.automation.id,
      actionUrl: `/automations/${anchors.automation.id}`,
      minutesAgo: 300,
      userIndex: 5,
      read: true,
    });
    push({
      type: "AUTOMATION_COMPLETED",
      title: "Automation run completed",
      body: `${anchors.automation.name} executed 3 actions across 2 records.`,
      severity: "LOW",
      entityType: "automation",
      entityId: anchors.automation.id,
      actionUrl: `/automations/${anchors.automation.id}`,
      minutesAgo: 1_140,
      userIndex: 5,
      read: true,
    });
  }
  push({
    type: "INTEGRATION_ERROR",
    title: "Integration syncing error",
    body: "Zendesk returned 401 Unauthorized — 14 consecutive failures. Reconnect the integration to resume syncing.",
    severity: "CRITICAL",
    entityType: "integration",
    actionUrl: "/integrations?status=ERROR",
    minutesAgo: 61,
    userIndex: 1,
  });
  push({
    type: "INTEGRATION_ERROR",
    title: "Webhook deliveries failing",
    body: "ops.internal.example.com returned 502 twice in the last hour. Deliveries will retry with backoff.",
    severity: "MEDIUM",
    entityType: "webhook",
    actionUrl: "/integrations?tab=webhooks",
    minutesAgo: 195,
    userIndex: 1,
    read: true,
  });
  if (anchors.report) {
    push({
      type: "REPORT_GENERATED",
      title: "Report ready",
      body: `${anchors.report.name} finished generating (1.4s, 2,140 rows).`,
      entityType: "report",
      entityId: anchors.report.id,
      actionUrl: "/analytics?tab=reports",
      minutesAgo: 640,
      userIndex: 0,
      read: true,
    });
  }
  push({
    type: "BRIEF_PUBLISHED",
    title: "AI executive brief published",
    body: "This week's brief covers pipeline decay, SLA regression and expansion signals.",
    severity: "MEDIUM",
    entityType: "brief",
    actionUrl: "/intelligence",
    minutesAgo: 52,
    userIndex: 0,
  });
  push({
    type: "SYSTEM",
    title: "Metric rollups completed",
    body: "10 metric series refreshed for 731 days of history.",
    severity: "LOW",
    entityType: "job",
    actionUrl: "/settings?tab=status",
    minutesAgo: 2_880,
    read: true,
  });
  push({
    type: "TASK_ASSIGNED",
    title: "Quarterly business review due",
    body: `QBR preparation is due this week for ${rng.int(3, 9)} accounts in your book.`,
    severity: "MEDIUM",
    entityType: "activity",
    actionUrl: "/operations?tab=tasks",
    minutesAgo: 1_500,
    userIndex: 2,
    read: true,
  });

  await db.notification.createMany({ data: rows });
  return rows;
}

/* ─────────────────────────────── audit trail ───────────────────────────── */

export async function createAuditTrail(
  rng: Rng,
  organizationId: string,
  people: SeedUser[],
  anchors: {
    wonDeal?: { id: string; code: string; name: string; amount: number };
    stageDeal?: { id: string; code: string; name: string };
    customer?: { id: string; name: string };
    dangerFlag?: boolean;
  },
  now: Date,
) {
  const rows: Prisma.AuditLogCreateManyInput[] = [];
  const actor = (index: number) => people[index % people.length]!;

  const push = (input: {
    actorIndex: number;
    action: string;
    entityType: string;
    entityId?: string;
    entityLabel?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    severity?: Prisma.AuditLogCreateManyInput["severity"];
    source?: Prisma.AuditLogCreateManyInput["source"];
    minutesAgo: number;
    ip?: string;
  }) => {
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    if (input.before && input.after) {
      for (const key of new Set([...Object.keys(input.before), ...Object.keys(input.after)])) {
        if (JSON.stringify(input.before[key]) !== JSON.stringify(input.after[key])) {
          diff[key] = { from: input.before[key] ?? null, to: input.after[key] ?? null };
        }
      }
    }
    const person = actor(input.actorIndex);
    rows.push({
      id: id("aud"),
      organizationId,
      actorId: person.id,
      actorName: person.name,
      actorEmail: person.email,
      actorRole: person.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      before: (input.before ?? null) as Prisma.InputJsonValue,
      after: (input.after ?? null) as Prisma.InputJsonValue,
      diff: (Object.keys(diff).length ? diff : null) as Prisma.InputJsonValue,
      severity: input.severity ?? "INFO",
      source: input.source ?? "WEB",
      ip: input.ip ?? `82.14.${rng.int(10, 240)}.${rng.int(2, 250)}`,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      requestId: `req_${id("r").slice(1, 14)}`,
      createdAt: hoursAgo(input.minutesAgo / 60, now),
    });
  };

  if (anchors.wonDeal) {
    push({
      actorIndex: 0,
      action: "deal.stage_changed",
      entityType: "opportunity",
      entityId: anchors.wonDeal.id,
      entityLabel: `Deal #${anchors.wonDeal.code.replace("OPP-", "")}`,
      before: { stage: "NEGOTIATION", probability: 70, forecastCategory: "Best case" },
      after: { stage: "WON", probability: 100, forecastCategory: "Closed", amount: anchors.wonDeal.amount },
      severity: "INFO",
      minutesAgo: 34,
    });
    push({
      actorIndex: 0,
      action: "deal.stage_changed",
      entityType: "opportunity",
      entityId: anchors.wonDeal.id,
      entityLabel: `Deal #${anchors.wonDeal.code.replace("OPP-", "")}`,
      before: { stage: "PROPOSAL", probability: 50 },
      after: { stage: "NEGOTIATION", probability: 70 },
      severity: "INFO",
      minutesAgo: 5_800,
    });
  }
  if (anchors.stageDeal) {
    push({
      actorIndex: 3,
      action: "deal.updated",
      entityType: "opportunity",
      entityId: anchors.stageDeal.id,
      entityLabel: `Deal #${anchors.stageDeal.code.replace("OPP-", "")}`,
      before: { amount: 48_000, expectedCloseDate: daysAgo(12, now).toISOString(), nextStep: "Send revised pricing" },
      after: { amount: 62_500, expectedCloseDate: daysAgo(-30, now).toISOString(), nextStep: "Security review call" },
      severity: "INFO",
      minutesAgo: 190,
    });
  }
  if (anchors.customer) {
    push({
      actorIndex: 2,
      action: "customer.updated",
      entityType: "customer",
      entityId: anchors.customer.id,
      entityLabel: anchors.customer.name,
      before: { status: "ACTIVE", supportTier: "Priority" },
      after: { status: "AT_RISK", supportTier: "Dedicated" },
      severity: "WARNING",
      minutesAgo: 420,
    });
  }

  const templates: Omit<Parameters<typeof push>[0], "minutesAgo">[] = [
    { actorIndex: 1, action: "member.invited", entityType: "membership", entityLabel: "hannah.weber@nexus-demo.com", after: { role: "MEMBER", team: "Enterprise Sales" }, severity: "INFO" },
    { actorIndex: 1, action: "integration.connected", entityType: "integration", entityLabel: "Salesforce", after: { status: "CONNECTED", syncDirection: "bidirectional" }, severity: "INFO" },
    { actorIndex: 1, action: "integration.error", entityType: "integration", entityLabel: "Zendesk", before: { status: "CONNECTED" }, after: { status: "ERROR", lastError: "401 Unauthorized" }, severity: "CRITICAL" },
    { actorIndex: 0, action: "api_key.created", entityType: "api_key", entityLabel: "Data warehouse (read-only)", after: { scopes: ["read"] }, severity: "WARNING" },
    { actorIndex: 5, action: "invoice.sent", entityType: "invoice", entityLabel: "INV-2026-00412", after: { status: "OPEN", total: 41_820 }, severity: "INFO" },
    { actorIndex: 5, action: "invoice.marked_paid", entityType: "invoice", entityLabel: "INV-2026-00408", before: { status: "OPEN" }, after: { status: "PAID" }, severity: "INFO" },
    { actorIndex: 0, action: "automation.activated", entityType: "automation", entityLabel: "Stalled deal escalation", after: { status: "ACTIVE" }, severity: "INFO" },
    { actorIndex: 0, action: "automation.paused", entityType: "automation", entityLabel: "Quarter-end forecast lock", before: { status: "ACTIVE" }, after: { status: "PAUSED" }, severity: "INFO" },
    { actorIndex: 1, action: "member.role_changed", entityType: "membership", entityLabel: "marco.rossi@nexus-demo.com", before: { role: "MEMBER" }, after: { role: "ANALYST" }, severity: "WARNING" },
    { actorIndex: 0, action: "session.revoked", entityType: "session", entityLabel: "Chrome · macOS (Lisbon)", after: { revoked: true }, severity: "WARNING" },
    { actorIndex: 1, action: "plan.limit_warning", entityType: "organization", entityLabel: "Seat usage at 92%", after: { seats: 23, limit: 25 }, severity: "WARNING", source: "SYSTEM" },
    { actorIndex: 1, action: "webhook.created", entityType: "webhook", entityLabel: "Revenue warehouse ingestion", after: { events: 8 }, severity: "INFO" },
    { actorIndex: 0, action: "report.generated", entityType: "report", entityLabel: "Board pack", after: { format: "xlsx", rows: 2_140 }, severity: "INFO" },
    { actorIndex: 3, action: "risk.accepted", entityType: "risk", entityLabel: "Revenue concentration risk", before: { status: "OPEN" }, after: { status: "ACCEPTED" }, severity: "WARNING" },
    { actorIndex: 1, action: "org.settings_updated", entityType: "organization", entityLabel: "Nexus", before: { churnRiskThreshold: 70 }, after: { churnRiskThreshold: 60 }, severity: "INFO" },
  ];

  for (const [index, template] of templates.entries()) {
    push({ ...template, minutesAgo: 60 + index * 97 + rng.int(0, 40) });
  }

  // Background activity: engine runs, scheduled jobs, bulk imports.
  const systemActions = [
    { action: "engines.run", entityType: "intelligence", label: "Opportunity + risk engines" },
    { action: "metrics.rollup", entityType: "metric", label: "10 series refreshed" },
    { action: "import.completed", entityType: "customer", label: "CSV import — 48 rows" },
    { action: "webhook.delivered", entityType: "webhook", label: "opportunity.stage_changed" },
    { action: "automation.executed", entityType: "automation", label: "Renewal playbook — 60 days out" },
    { action: "auth.login", entityType: "session", label: "Password login" },
  ];

  for (let index = 0; index < 120; index++) {
    const definition = systemActions[index % systemActions.length]!;
    push({
      actorIndex: index % people.length,
      action: definition.action,
      entityType: definition.entityType,
      entityLabel: definition.label,
      severity: index % 17 === 0 ? "WARNING" : "INFO",
      source: index % 4 === 0 ? "AUTOMATION" : index % 3 === 0 ? "SYSTEM" : "WEB",
      minutesAgo: 30 + index * 41 + rng.int(0, 30),
    });
  }

  await db.auditLog.createMany({ data: rows });
  return rows.length;
}

/* ────────────────────────── automations telemetry ──────────────────────── */

export async function createAutomationHistory(
  rng: Rng,
  organizationId: string,
  automations: { id: string; name: string; status: string; failureCount: number }[],
  deals: { id: string; name: string }[],
  customers: { id: string; name: string }[],
  now: Date,
) {
  const rows: Prisma.AutomationExecutionCreateManyInput[] = [];
  const active = automations.filter((automation) => automation.status === "ACTIVE" || automation.status === "PAUSED");

  for (const [index, automation] of automations.entries()) {
    if (automation.status === "DRAFT") continue;
    const runs = 8 + rng.int(0, 12);
    for (let run = 0; run < runs; run++) {
      const deal = rng.pick(deals);
      const customer = rng.pick(customers);
      const failed = rng.bool(Math.min(0.4, automation.failureCount / Math.max(1, 20 + runs)));
      const partial = !failed && rng.bool(0.12);
      const status = failed ? "FAILED" : partial ? "PARTIAL" : "SUCCESS";
      const startedAt = new Date(now.getTime() - (run * 6 + index * 2) * 3_600_000 + rng.int(0, 1_800) * 1_000);
      const durationMs = rng.int(120, 2_600);

      rows.push({
        id: id("aex"),
        organizationId,
        automationId: automation.id,
        status,
        triggerEvent: automation.name,
        matched: !failed,
        steps: [
          { step: "trigger", label: "Evaluate trigger", status: "SUCCESS", durationMs: rng.int(4, 40) },
          { step: "conditions", label: `Evaluated ${rng.int(1, 3)} conditions`, status: "SUCCESS", durationMs: rng.int(2, 22) },
          {
            step: "actions",
            label: `${rng.int(1, 4)} actions executed`,
            status: failed ? "FAILED" : partial ? "PARTIAL" : "SUCCESS",
            detail: failed ? rng.pick(AUTOMATION_EXECUTION_ERRORS) : undefined,
            durationMs: rng.int(60, 1_800),
          },
        ] as Prisma.InputJsonValue,
        errorMessage: failed ? rng.pick(AUTOMATION_EXECUTION_ERRORS) : null,
        durationMs,
        entityType: rng.bool(0.6) ? "opportunity" : "customer",
        entityId: rng.bool(0.6) ? deal?.id ?? null : customer?.id ?? null,
        entityLabel: rng.bool(0.6) ? deal?.name ?? null : customer?.name ?? null,
        triggeredBy: rng.weighted([
          ["scheduler", 0.55],
          ["webhook", 0.22],
          ["manual", 0.15],
          ["api", 0.08],
        ]),
        startedAt,
        finishedAt: new Date(startedAt.getTime() + durationMs),
        createdAt: startedAt,
      });
    }
  }

  for (let index = 0; index < rows.length; index += 2_000) {
    await db.automationExecution.createMany({ data: rows.slice(index, index + 2_000) });
  }
  return { count: rows.length, active: active.length };
}

/* ─────────────────────────── webhook deliveries ────────────────────────── */

export async function createWebhookDeliveries(
  rng: Rng,
  organizationId: string,
  webhooks: { id: string; url: string }[],
  now: Date,
) {
  const events = ["opportunity.stage_changed", "risk.detected", "insight.detected", "invoice.overdue"];
  const rows: Prisma.WebhookDeliveryCreateManyInput[] = [];

  for (const [webhookIndex, webhook] of webhooks.entries()) {
    for (let index = 0; index < 18; index++) {
      const failed = webhookIndex === 1 && index % 6 === 0;
      const event = events[index % events.length]!;
      const createdAt = hoursAgo(index * 3 + webhookIndex, now);
      rows.push({
        id: id("whd"),
        organizationId,
        webhookId: webhook.id,
        event,
        status: failed ? "FAILED" : "DELIVERED",
        responseCode: failed ? 502 : 200,
        durationMs: rng.int(60, 900),
        payload: { event, deliveredAt: createdAt.toISOString(), data: { id: id("ent"), source: "nexus_os" } } as Prisma.InputJsonValue,
        error: failed ? "Upstream returned 502 Bad Gateway" : null,
        createdAt,
      });
    }
  }

  await db.webhookDelivery.createMany({ data: rows });
  return rows.length;
}
