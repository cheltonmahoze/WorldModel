import { Prisma, type OrgPlan } from "@prisma/client";
import { hashPassword } from "@/server/auth/password";
import { planFor } from "@/lib/plans";
import { sum } from "@/lib/utils";
import {
  AUTOMATION_TEMPLATES,
  CITIES,
  INTEGRATION_CATALOG,
  REPORT_BLUEPRINTS,
  WEBHOOK_EVENTS,
  daysAgo,
  daysAhead,
  id,
  type Rng,
} from "./data";

export const DEMO_PASSWORD = "NexusDemo2026!";

const TEAM_BLUEPRINTS = [
  { name: "Enterprise Sales", description: "Named accounts above €100k ARR", department: "Revenue", color: "#4F46E5" },
  { name: "Mid-Market Sales", description: "Volume motion for €20k–€100k ACV", department: "Revenue", color: "#0EA5E9" },
  { name: "Customer Success", description: "Retention, adoption and expansion", department: "Customer Success", color: "#10B981" },
  { name: "Revenue Operations", description: "Systems, data quality and forecasting", department: "Operations", color: "#F59E0B" },
  { name: "Support Engineering", description: "Tier 2 product support and escalations", department: "Operations", color: "#EF4444" },
  { name: "Finance & Billing", description: "Invoicing, collections and plan management", department: "Finance", color: "#8B5CF6" },
] as const;

export type SeedUser = {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "ANALYST" | "MEMBER";
  jobTitle: string;
  department: string;
  team: string;
  quota: number;
};

/** Deletes every row so the demo tenant can be rebuilt from scratch. */
export async function resetDatabase(db: Prisma.TransactionClient | typeof import("@/server/db").db) {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      "WebhookDelivery", "Webhook", "ApiKey", "UsageEvent", "Invoice", "Subscription",
      "Metric", "Report", "Job", "AuditLog", "Notification", "AiBrief",
      "AutomationExecution", "Automation", "Integration", "Insight", "Risk",
      "SupportTicket", "Activity", "Opportunity", "Contact", "Customer",
      "TeamMember", "Team", "Membership", "AuthToken", "Session", "User", "Organization"
    RESTART IDENTITY CASCADE
  `);
}

export async function createOrganization(
  db: typeof import("@/server/db").db,
  input: {
    name: string;
    slug: string;
    plan: OrgPlan;
    industry: string;
    domain: string;
    companySize: string;
    hqCountry: string;
    legalName: string;
    churnRiskThreshold?: number;
    onboardedAt: Date;
    primaryColor: string;
  },
) {
  return db.organization.create({
    data: {
      id: id("org"),
      name: input.name,
      slug: input.slug,
      legalName: input.legalName,
      domain: input.domain,
      industry: input.industry,
      hqCountry: input.hqCountry,
      companySize: input.companySize,
      plan: input.plan,
      dataRegion: "eu-west-1",
      timezone: "Europe/Lisbon",
      currency: "EUR",
      locale: "en-GB",
      fiscalYearStart: 1,
      aiEngineEnabled: true,
      churnRiskThreshold: input.churnRiskThreshold ?? 60,
      primaryColor: input.primaryColor,
      onboardedAt: input.onboardedAt,
    },
  });
}

export async function createUsersAndMemberships(
  db: typeof import("@/server/db").db,
  organizationId: string,
  users: Omit<SeedUser, "id">[],
  now: Date,
) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const created: SeedUser[] = [];

  for (const [index, user] of users.entries()) {
    // Users are global across the platform; a person can belong to several
    // organizations with a different role in each one.
    const existing = await db.user.findUnique({ where: { email: user.email } });
    const row =
      existing ??
      (await db.user.create({
        data: {
          id: id("usr"),
          email: user.email,
          name: user.name,
          passwordHash,
          jobTitle: user.jobTitle,
          timezone: "Europe/Lisbon",
          locale: "en-GB",
          themePreference: "system",
          emailVerifiedAt: daysAgo(140 - index, now),
          lastLoginAt: daysAgo(index % 5, now),
          lastActiveAt: daysAgo(index % 3, now),
          avatarUrl: null,
        },
      }));

    const membership = await db.membership.findUnique({
      where: { userId_organizationId: { userId: row.id, organizationId } },
    });
    if (!membership) {
      await db.membership.create({
        data: {
          id: id("mem"),
          userId: row.id,
          organizationId,
          role: user.role,
          status: "ACTIVE",
          title: user.jobTitle,
          department: user.department,
          joinedAt: daysAgo(140 - index, now),
          lastSeenAt: daysAgo(index % 4, now),
        },
      });
    }

    created.push({ ...user, id: row.id });
  }

  return created;
}

export async function createTeams(
  db: typeof import("@/server/db").db,
  organizationId: string,
  people: SeedUser[],
  now: Date,
) {
  const teams = [];
  for (const [index, blueprint] of TEAM_BLUEPRINTS.entries()) {
    const members = people.filter((person) => person.team === blueprint.name);
    const lead = members.find((person) => person.role === "MANAGER" || person.role === "ADMIN") ?? members[0];
    const team = await db.team.create({
      data: {
        id: id("team"),
        organizationId,
        name: blueprint.name,
        description: blueprint.description,
        department: blueprint.department,
        color: blueprint.color,
        leadId: lead?.id ?? null,
        createdAt: daysAgo(180 - index * 4, now),
      },
    });
    teams.push(team);

    for (const member of members) {
      await db.teamMember.create({
        data: {
          id: id("tm"),
          teamId: team.id,
          userId: member.id,
          organizationId,
          isLead: member.id === lead?.id,
          createdAt: daysAgo(150 - index, now),
        },
      });
    }
  }
  return teams;
}

export async function createBilling(
  db: typeof import("@/server/db").db,
  organizationId: string,
  plan: OrgPlan,
  seats: number,
  billingEmail: string,
  now: Date,
) {
  const config = planFor(plan);
  const seatPrice = config.seatPrice;
  const mrr = (config.monthlyPrice ?? 0) + Math.max(0, seats - config.seatsIncluded) * seatPrice;
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  await db.subscription.create({
    data: {
      id: id("sub"),
      organizationId,
      plan,
      status: "ACTIVE",
      seats,
      seatPrice: new Prisma.Decimal(seatPrice),
      mrr: new Prisma.Decimal(mrr),
      currency: "EUR",
      billingInterval: "monthly",
      billingEmail,
      discountPercent: plan === "SCALE" ? 10 : 0,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      stripeCustomerId: `cus_demo_${organizationId.slice(-6)}`,
      stripeSubscriptionId: `sub_demo_${organizationId.slice(-6)}`,
    },
  });

  const invoices = [];
  for (let monthsAgo = 12; monthsAgo >= 0; monthsAgo--) {
    const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59);
    const subtotal = mrr * (monthsAgo === 12 ? 0.78 : monthsAgo >= 6 ? 0.9 : 1);
    const taxAmount = subtotal * 0.23;
    invoices.push({
      id: id("inv"),
      organizationId,
      customerId: null,
      number: `NX-${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${organizationId.slice(-3).toUpperCase()}`,
      status: monthsAgo === 0 ? ("OPEN" as const) : ("PAID" as const),
      subtotal: new Prisma.Decimal(Math.round(subtotal * 100) / 100),
      taxAmount: new Prisma.Decimal(Math.round(taxAmount * 100) / 100),
      total: new Prisma.Decimal(Math.round((subtotal + taxAmount) * 100) / 100),
      currency: "EUR",
      seats,
      periodStart: start,
      periodEnd: end,
      issuedAt: start,
      dueAt: new Date(start.getTime() + 14 * 86_400_000),
      paidAt: monthsAgo === 0 ? null : new Date(start.getTime() + (monthsAgo === 1 ? 21 : 6) * 86_400_000),
      hostedUrl: `https://billing.stripe.com/demo/invoice/${start.getFullYear()}${start.getMonth() + 1}`,
      lineItems: [
        { description: `${config.name} plan — base`, quantity: 1, unitAmount: config.monthlyPrice },
        { description: "Additional seats", quantity: Math.max(0, seats - config.seatsIncluded), unitAmount: seatPrice },
      ],
      notes: monthsAgo === 0 ? "Net 14 — paid by SEPA direct debit" : null,
    });
  }

  await db.invoice.createMany({ data: invoices });
  return { mrr, seatPrice, invoices: invoices.length };
}

export async function createIntegrations(
  db: typeof import("@/server/db").db,
  organizationId: string,
  rng: Rng,
  connectedById: string,
  now: Date,
) {
  const healthy = ["salesforce", "slack", "stripe", "google_workspace", "webhooks", "csv_import"];
  const rows = INTEGRATION_CATALOG.map((entry, index) => {
    const isHealthy = healthy.includes(entry.provider);
    const isPending = entry.provider === "marketo";
    const status = isHealthy ? ("CONNECTED" as const) : isPending ? ("PENDING" as const) : entry.provider === "zendesk" ? ("ERROR" as const) : ("DISCONNECTED" as const);
    return {
      id: id("int"),
      organizationId,
      provider: entry.provider,
      name: entry.name,
      category: entry.category,
      status,
      enabled: status === "CONNECTED" || status === "ERROR",
      config: {
        syncFrequency: index % 3 === 0 ? "hourly" : "daily",
        objects: entry.category === "CRM" ? ["accounts", "opportunities", "contacts"] : ["records"],
        fieldMapping: entry.category === "CRM" ? { amount: "opportunity.amount", closeDate: "opportunity.close_date" } : {},
      } as Prisma.InputJsonValue,
      credentialRef: status === "CONNECTED" || status === "ERROR" ? `vault://${organizationId}/integrations/${entry.provider}` : null,
      secretPreview: status === "CONNECTED" || status === "ERROR" ? `sk_live_••••${rng.int(1000, 9999)}` : null,
      scopes: [...entry.scopes],
      syncFrequency: index % 3 === 0 ? "hourly" : "daily",
      syncDirection: entry.category === "CRM" ? "bidirectional" : "inbound",
      lastSyncAt: status === "CONNECTED" ? new Date(now.getTime() - rng.int(5, 90) * 60_000) : status === "ERROR" ? daysAgo(2, now) : null,
      nextSyncAt: status === "CONNECTED" ? new Date(now.getTime() + rng.int(10, 120) * 60_000) : null,
      lastError:
        status === "ERROR"
          ? "401 Unauthorized — the API token was revoked in Zendesk. Reconnect to resume syncing."
          : null,
      errorCount: status === "ERROR" ? 14 : 0,
      recordsSynced: status === "CONNECTED" ? rng.int(1_200, 48_000) : 0,
      connectedById,
      createdAt: daysAgo(160 - index * 3, now),
    };
  });

  await db.integration.createMany({ data: rows });
  return rows;
}

export async function createWebhooks(
  db: typeof import("@/server/db").db,
  organizationId: string,
  createdById: string,
  now: Date,
) {
  const rows = [
    {
      id: id("wh"),
      organizationId,
      url: "https://hooks.northwind.example.com/nexus/events",
      description: "Revenue warehouse ingestion (Snowflake staging)",
      secret: `whsec_${id("s").slice(1, 25)}`,
      events: [...WEBHOOK_EVENTS],
      active: true,
      failureCount: 0,
      lastDeliveryAt: new Date(now.getTime() - 42 * 60_000),
      createdById,
      createdAt: daysAgo(90, now),
    },
    {
      id: id("wh"),
      organizationId,
      url: "https://ops.internal.example.com/alerts/nexus",
      description: "PagerDuty bridge for critical risks",
      secret: `whsec_${id("s").slice(1, 25)}`,
      events: ["risk.detected", "invoice.overdue", "automation.completed"],
      active: true,
      failureCount: 2,
      lastDeliveryAt: new Date(now.getTime() - 190 * 60_000),
      createdById,
      createdAt: daysAgo(64, now),
    },
  ];
  await db.webhook.createMany({ data: rows });
  return rows;
}

export async function createApiKeys(
  db: typeof import("@/server/db").db,
  organizationId: string,
  createdById: string,
  now: Date,
) {
  const { sha256, generateToken } = await import("@/server/auth/password");
  const keys = [
    { name: "Data warehouse (read-only)", scopes: ["read"], prefix: "nxk_live", requests: 184_320, lastUsed: 12 },
    { name: "Billing automation", scopes: ["read", "write"], prefix: "nxk_live", requests: 12_804, lastUsed: 240 },
  ];

  const rows = [];
  for (const [index, key] of keys.entries()) {
    const token = `${key.prefix}_${generateToken(24)}`;
    rows.push({
      id: id("key"),
      organizationId,
      name: key.name,
      prefix: `${key.prefix}_${token.slice(-4)}`,
      keyHash: sha256(token),
      scopes: key.scopes,
      lastUsedAt: hoursAgoFrom(now, key.lastUsed),
      requestCount: key.requests,
      expiresAt: daysAhead(180 - index * 30, now),
      revokedAt: null,
      createdById,
      createdAt: daysAgo(120 - index * 10, now),
    });
  }
  await db.apiKey.createMany({ data: rows });
  return rows;
}

function hoursAgoFrom(now: Date, hours: number) {
  return new Date(now.getTime() - hours * 3_600_000);
}

export async function createReports(
  db: typeof import("@/server/db").db,
  organizationId: string,
  createdById: string,
  now: Date,
) {
  const rows = REPORT_BLUEPRINTS.map((blueprint, index) => ({
    id: id("rep"),
    organizationId,
    name: blueprint.name,
    description: blueprint.description,
    type: blueprint.type,
    config: {
      filters: { window: index % 3 === 0 ? "qtd" : "90d" },
      metrics: index % 2 === 0 ? ["revenue", "pipeline", "win_rate"] : ["health", "churn_risk", "sla"],
      groupBy: index % 2 === 0 ? "segment" : "owner",
    } as Prisma.InputJsonValue,
    schedule: blueprint.schedule,
    recipients: blueprint.schedule === "NONE" ? [] : ["alex.morgan@nexus-demo.com", "sofia.marques@nexus-demo.com"],
    format: index % 3 === 0 ? "xlsx" : "csv",
    isShared: index % 2 === 0,
    isPinned: index < 3,
    lastGeneratedAt: blueprint.schedule === "NONE" ? daysAgo(rngSafe(index) + 3, now) : daysAgo(index % 4, now),
    lastRunDurationMs: 1_200 + index * 340,
    runCount: 12 + index * 7,
    createdById,
    createdAt: daysAgo(150 - index * 8, now),
  }));

  await db.report.createMany({ data: rows });
  return rows;
}

function rngSafe(index: number) {
  return (index * 7) % 21;
}

export async function createJobs(
  db: typeof import("@/server/db").db,
  organizationId: string,
  now: Date,
) {
  const jobs = [
    { name: "intelligence.engines", type: "INTELLIGENCE", status: "SUCCEEDED" as const, minutesAgo: 18, durationMs: 4_820 },
    { name: "metrics.rollup", type: "METRICS", status: "SUCCEEDED" as const, minutesAgo: 64, durationMs: 9_140 },
    { name: "integrations.salesforce.sync", type: "INTEGRATION_SYNC", status: "SUCCEEDED" as const, minutesAgo: 22, durationMs: 18_400 },
    { name: "integrations.zendesk.sync", type: "INTEGRATION_SYNC", status: "FAILED" as const, minutesAgo: 61, durationMs: 2_100 },
    { name: "reports.scheduled.daily", type: "REPORT", status: "SUCCEEDED" as const, minutesAgo: 300, durationMs: 3_360 },
    { name: "webhooks.dispatch.retry", type: "WEBHOOK", status: "SUCCEEDED" as const, minutesAgo: 96, durationMs: 720 },
    { name: "risk-engine.rescore", type: "INTELLIGENCE", status: "SUCCEEDED" as const, minutesAgo: 240, durationMs: 6_100 },
    { name: "audit.retention.prune", type: "MAINTENANCE", status: "SUCCEEDED" as const, minutesAgo: 720, durationMs: 2_840 },
    { name: "billing.usage.rollup", type: "BILLING", status: "SUCCEEDED" as const, minutesAgo: 480, durationMs: 1_980 },
    { name: "notifications.digest", type: "NOTIFICATION", status: "PENDING" as const, minutesAgo: -60, durationMs: null },
  ];

  const rows = jobs.map((job) => {
    const scheduledFor = new Date(now.getTime() - job.minutesAgo * 60_000);
    return {
      id: id("job"),
      organizationId,
      name: job.name,
      type: job.type,
      status: job.status,
      payload: { source: "scheduler" } as Prisma.InputJsonValue,
      result:
        job.status === "FAILED"
          ? ({ error: "401 Unauthorized from Zendesk" } as Prisma.InputJsonValue)
          : ({ processed: job.type === "INTEGRATION_SYNC" ? 4_820 : 12 } as Prisma.InputJsonValue),
      attempts: job.status === "FAILED" ? 3 : 1,
      maxAttempts: 3,
      lastError: job.status === "FAILED" ? "401 Unauthorized from Zendesk — token revoked" : null,
      scheduledFor,
      startedAt: job.status === "PENDING" ? null : scheduledFor,
      finishedAt: job.status === "PENDING" ? null : new Date(scheduledFor.getTime() + (job.durationMs ?? 0)),
      durationMs: job.durationMs,
      createdAt: scheduledFor,
    };
  });

  await db.job.createMany({ data: rows });
  return rows;
}

export async function createAutomations(
  db: typeof import("@/server/db").db,
  organizationId: string,
  ownerId: string,
  now: Date,
) {
  // Which playbooks the demo tenant has live, paused or still drafting.
  const ACTIVE_TEMPLATES = new Set([
    "Stalled deal escalation",
    "Renewal playbook — 60 days out",
    "Churn-risk intervention",
    "SLA breach follow-up",
    "Overdue task sweep",
    "New customer onboarding",
    "Weekly pipeline hygiene",
    "High-intent opportunity follow-up",
  ]);
  const PAUSED_TEMPLATES = new Set(["Expansion review on risk signals"]);

  const rows: Prisma.AutomationCreateManyInput[] = AUTOMATION_TEMPLATES.map((template, index) => {
    const status = ACTIVE_TEMPLATES.has(template.name) ? "ACTIVE" : PAUSED_TEMPLATES.has(template.name) ? "PAUSED" : "DRAFT";
    const runCount = status === "ACTIVE" ? rng_runCount(index) : 0;
    const failureCount = template.name === "SLA breach follow-up" ? Math.round(runCount * 0.22) : Math.round(runCount * (index % 5 === 0 ? 0.06 : 0.02));
    return {
      id: id("aut"),
      organizationId,
      name: template.name,
      description: template.description,
      status,
      triggerType: template.triggerType,
      triggerConfig: template.triggerConfig as Prisma.InputJsonValue,
      conditions: template.conditions as unknown as Prisma.InputJsonValue,
      actions: template.actions as unknown as Prisma.InputJsonValue,
      tags: [...template.tags],
      runCount,
      successCount: runCount - failureCount,
      failureCount,
      timeSavedMinutes: runCount * 6,
      lastRunAt: runCount ? new Date(now.getTime() - (index + 1) * 3_600_000) : null,
      lastStatus: runCount ? (template.name === "SLA breach follow-up" ? "PARTIAL" : "SUCCESS") : null,
      createdById: ownerId,
      createdAt: daysAgo(150 - index * 9, now),
      updatedAt: daysAgo(index, now),
    };
  });

  await db.automation.createMany({ data: rows });
  return rows;
}

function rng_runCount(index: number) {
  return 40 + index * 23;
}

export async function createUsageEvents(
  db: typeof import("@/server/db").db,
  organizationId: string,
  now: Date,
) {
  const events: Prisma.UsageEventCreateManyInput[] = [];
  for (let day = 29; day >= 0; day--) {
    const recordedAt = daysAgo(day, now);
    events.push(
      { id: id("ue"), organizationId, key: "api.requests", quantity: 1_400 + ((day * 37) % 900), metadata: { source: "api" }, recordedAt },
      { id: id("ue"), organizationId, key: "report.exports", quantity: 3 + (day % 7), metadata: { source: "web" }, recordedAt },
      { id: id("ue"), organizationId, key: "automation.runs", quantity: 18 + ((day * 11) % 26), metadata: { source: "worker" }, recordedAt },
      { id: id("ue"), organizationId, key: "seats.active", quantity: 60 + ((day * 3) % 14), recordedAt },
    );
  }
  await db.usageEvent.createMany({ data: events });
  return events;
}

export function buildTeamRoster(people: SeedUser[]) {
  return Object.fromEntries(people.map((person) => [person.team, people.filter((entry) => entry.team === person.team)]));
}

export const CITY_POOL = CITIES;
export { sum };
