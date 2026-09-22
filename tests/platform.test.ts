import { describe, expect, it } from "vitest";
import {
  clamp,
  formatCurrency,
  formatCompactCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  percentChange,
  titleCase,
  toCsv,
  truncate,
} from "@/lib/utils";
import { PERMISSIONS, ROLE_RANK, assignableRoles, atLeast, can, permissionsForRole } from "@/lib/rbac";
import { PLANS, PLAN_ORDER, formatLimit, isUpgrade, monthlyPrice, planFor } from "@/lib/plans";
import { INTEGRATION_CATALOGUE, integrationByProvider } from "@/lib/integrations";
import { JOB_HANDLERS, handlerFor } from "@/server/jobs";
import { relativePath, relativeRedirect } from "@/server/redirect";
import {
  acceptInviteSchema,
  automationCreateSchema,
  automationExecutionFilterSchema,
  ticketFilterSchema,
  customerCreateSchema,
  jobCreateSchema,
  loginSchema,
  opportunityCreateSchema,
  reportCreateSchema,
  signupSchema,
} from "@/server/validation";

describe("formatting", () => {
  it("renders money in the workspace currency and compacts millions", () => {
    expect(formatCurrency(2840200)).toContain("2,840,200");
    expect(formatCompactCurrency(8419500)).toBe("€8.4m");
    expect(formatNumber(1234.6)).toBe("1,235");
  });

  it("renders percentages and signed deltas the way the KPI cards read them", () => {
    expect(formatPercent(18.421, { decimals: 1 })).toBe("18.4%");
    expect(formatPercent(18.7, { decimals: 1, sign: true })).toBe("+18.7%");
    expect(percentChange(2840100, 2392600)).toBeCloseTo(18.7, 1);
  });

  it("formats dates and clamps numeric input", () => {
    expect(formatDate(new Date("2026-09-22T10:00:00Z"), "short")).toContain("2026");
    expect(clamp(120, 0, 100)).toBe(100);
    expect(truncate("Nexus OS revenue intelligence", 10)).toHaveLength(10);
    expect(titleCase("mid_market")).toBe("Mid Market");
  });
});

describe("csv export", () => {
  it("escapes separators and quotes", () => {
    const csv = toCsv([{ name: 'Acme, "Global"', arr: 1200 }], ["name", "arr"]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toBe("name,arr");
    expect(row).toContain('"Acme, ""Global"""');
  });
});

describe("rbac", () => {
  it("ranks roles from owner down to member", () => {
    expect(ROLE_RANK.OWNER).toBeGreaterThan(ROLE_RANK.ADMIN);
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(ROLE_RANK.MANAGER);
    expect(ROLE_RANK.MANAGER).toBeGreaterThan(ROLE_RANK.ANALYST);
    expect(ROLE_RANK.ANALYST).toBeGreaterThan(ROLE_RANK.MEMBER);
  });

  it("gives every permission to the owner and refuses member-level escalation", () => {
    expect(permissionsForRole("OWNER")).toHaveLength(PERMISSIONS.length);
    expect(can("MEMBER", "members:invite")).toBe(false);
    expect(can("MANAGER", "opportunities:write")).toBe(true);
    expect(can("ANALYST", "opportunities:write")).toBe(false);
    expect(atLeast("MANAGER", "MANAGER")).toBe(true);
    expect(atLeast("ANALYST", "MANAGER")).toBe(false);
  });

  it("only lets an owner or admin hand out privileged roles", () => {
    expect(assignableRoles("OWNER")).toContain("OWNER");
    expect(assignableRoles("MANAGER")).not.toContain("OWNER");
    expect(assignableRoles("MEMBER")).toEqual([]);
  });
});

describe("commercial plans", () => {
  it("ships the four documented plans at the published prices", () => {
    expect(PLAN_ORDER).toEqual(["STARTER", "GROWTH", "SCALE", "ENTERPRISE"]);
    expect(PLANS.STARTER.monthlyPrice).toBe(99);
    expect(PLANS.GROWTH.monthlyPrice).toBe(399);
    expect(PLANS.SCALE.monthlyPrice).toBe(999);
    expect(PLANS.ENTERPRISE.name).toBe("Enterprise");
  });

  it("raises the allowance as the plan grows", () => {
    const starter = planFor("STARTER");
    const growth = planFor("GROWTH");
    const scale = planFor("SCALE");
    expect(starter.limits.seats).toBeLessThan(growth.limits.seats);
    expect(growth.limits.seats).toBeLessThan(scale.limits.seats);
    expect(growth.features.riskEngine).toBe(true);
    expect(starter.features.riskEngine).toBe(false);
    expect(formatLimit(starter.limits.seats)).toBe("3");
    expect(isUpgrade("STARTER", "SCALE")).toBe(true);
    expect(isUpgrade("SCALE", "GROWTH")).toBe(false);
  });

  it("bills extra seats above the included allowance", () => {
    const growth = planFor("GROWTH");
    expect(monthlyPrice(growth, growth.seatsIncluded)).toBe(399);
    expect(monthlyPrice(growth, growth.seatsIncluded + 2)).toBeGreaterThan(399);
  });
});

describe("integration catalogue", () => {
  it("covers the required categories with unique providers", () => {
    const categories = new Set(INTEGRATION_CATALOGUE.map((entry) => entry.category));
    for (const required of ["CRM", "COMMUNICATION", "FINANCE", "PRODUCTIVITY", "DATA"]) {
      expect(categories.has(required as never)).toBe(true);
    }
    const providers = INTEGRATION_CATALOGUE.map((entry) => entry.provider);
    expect(new Set(providers).size).toBe(providers.length);
    expect(providers).toEqual(expect.arrayContaining(["salesforce", "hubspot", "slack", "microsoft_teams", "stripe", "google_workspace", "csv_import", "rest_api", "webhooks"]));
  });

  it("resolves a provider for the sync route", () => {
    expect(integrationByProvider("salesforce")?.name).toBeTruthy();
    expect(integrationByProvider("does-not-exist")).toBeFalsy();
  });
});

describe("validation contracts", () => {
  it("rejects weak passwords and invalid emails on signup", () => {
    const base = { name: "Ana Silva", email: "ana@company.com", companyName: "Northwind Group" };
    expect(signupSchema.safeParse(base).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: "NexusDemo2026!", email: "not-an-email" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: "NexusDemo2026!" }).success).toBe(true);
  });

  it("accepts either an email or an invite token on login", () => {
    expect(loginSchema.safeParse({ email: "alex.morgan@nexus-demo.com", password: "NexusDemo2026!" }).success).toBe(true);
  });

  it("requires an amount, a close date and a valid stage on opportunities", () => {
    const valid = { name: "Expansion", customerId: "cusmucq9mr57i674a2febe98b41", amount: 25_000, stage: "PROPOSAL", expectedCloseDate: "2026-11-30" };
    expect(opportunityCreateSchema.safeParse(valid).success).toBe(true);
    expect(opportunityCreateSchema.safeParse({ ...valid, stage: "NOT_A_STAGE" }).success).toBe(false);
  });

  it("validates customer segmentation and automation builders", () => {
    expect(customerCreateSchema.safeParse({ name: "Acme", segment: "SMB", region: "EMEA" }).success).toBe(true);
    expect(customerCreateSchema.safeParse({ name: "A", segment: "SMB", region: "EMEA" }).success).toBe(false);
    const automation = {
      name: "Idle deal follow-up",
      status: "DRAFT",
      triggerType: "deal_inactive",
      triggerConfig: { days: 14 },
      conditions: [{ field: "amount", operator: "greater_than", value: 10000 }],
      actions: [{ type: "notify_role", config: { role: "MANAGER" } }],
    };
    expect(automationCreateSchema.safeParse(automation).success).toBe(true);
    expect(automationCreateSchema.safeParse({ ...automation, triggerType: "nope" }).success).toBe(false);
  });

  it("validates report builders and job payloads", () => {
    const report = { name: "Weekly pipeline", type: "PIPELINE", config: { dataset: "opportunities", range: "qtd" }, schedule: "WEEKLY", format: "csv" };
    expect(reportCreateSchema.safeParse(report).success).toBe(true);
    expect(reportCreateSchema.safeParse({ ...report, schedule: "HOURLY" }).success).toBe(false);

    expect(jobCreateSchema.safeParse({ name: "metrics.rollup" }).success).toBe(true);
    expect(jobCreateSchema.safeParse({ name: "x" }).success).toBe(false);
  });

  it("gates invitation acceptance on a token", () => {
    expect(acceptInviteSchema.safeParse({ token: "invite-token-value" }).success).toBe(true);
    expect(acceptInviteSchema.safeParse({ token: "short" }).success).toBe(false);
  });

describe("background jobs", () => {
  it("registers the platform handlers once, with unique names", () => {
    const names = JOB_HANDLERS.map((handler) => handler.name);
    expect(names.length).toBeGreaterThanOrEqual(9);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("metrics.rollup");
    expect(names).toContain("audit.retention.prune");
  });

  it("resolves connector syncs to the wildcard handler", () => {
    expect(handlerFor("integrations.salesforce.sync")?.name).toBe("integrations.*.sync");
    expect(handlerFor("integrations.stripe.sync")?.name).toBe("integrations.*.sync");
    expect(handlerFor("integrations.*.sync")?.name).toBe("integrations.*.sync");
  });

  it("prefers an exact handler and refuses unknown names", () => {
    expect(handlerFor("metrics.rollup")?.name).toBe("metrics.rollup");
    expect(handlerFor("notifications.digest")?.name).toBe("notifications.digest");
    expect(handlerFor("nonsense.made.up")).toBeUndefined();
  });

  it("lets a queued variant of a known family fall back to its prefix", () => {
    expect(handlerFor("reports.scheduled.sprint")?.name).toBe("reports.scheduled.daily");
  });
});

describe("collection filters", () => {
  it("coerces boolean-ish query flags", () => {
    expect(automationExecutionFilterSchema.parse({ matched: "true" }).matched).toBe(true);
    expect(automationExecutionFilterSchema.parse({ matched: "false" }).matched).toBe(false);
    expect(ticketFilterSchema.parse({ slaBreached: "true" }).slaBreached).toBe(true);
    expect(automationExecutionFilterSchema.safeParse({ status: "BROKEN" }).success).toBe(false);
  });
});

describe("relative redirects", () => {
  it("keeps the visitor on the current origin", () => {
    expect(relativeRedirect("/dashboard").headers.get("location")).toBe("/dashboard");
    expect(relativeRedirect("dashboard").headers.get("location")).toBe("/dashboard");
    expect(relativeRedirect("/login?next=%2Frisk").status).toBe(307);
    expect(relativePath("https://0.0.0.0:3000/dashboard?window=90d")).toBe("/dashboard?window=90d");
  });
});
});
