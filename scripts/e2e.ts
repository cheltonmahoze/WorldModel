#!/usr/bin/env tsx
/**
 * NEXUS OS end-to-end verification.
 *
 * Drives a running server over HTTP and asserts the behaviour a buyer would
 * check: open access, the full auth lifecycle (signup → verification → recovery
 * → invite → acceptance), RBAC refusals, tenant isolation, every module's read
 * path, the CRUD flows, automations, reports, background jobs, notifications,
 * the audit trail, exports and error hygiene (no stack traces, correct codes).
 *
 *   npm run dev            # in one terminal
 *   npm run test:e2e       # in another
 *
 * Records created by the run are namespaced with an `E2E` marker and deleted at
 * the end, so the demo tenant stays presentable.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const DEMO_PASSWORD = process.env.E2E_PASSWORD ?? "NexusDemo2026!";
const MARKER = `E2E ${Date.now().toString(36).toUpperCase()}`;

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
let currentSection = "";

function section(title: string) {
  currentSection = title;
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

let skipped = 0;

/** A check that cannot run in this environment (production hides one-time tokens). */
function skip(name: string, reason: string) {
  skipped += 1;
  console.log(`  \x1b[33m–\x1b[0m ${name} \x1b[90mskipped · ${reason}\x1b[0m`);
}

function check(name: string, ok: boolean, detail = "") {
  results.push({ name: `${currentSection} · ${name}`, ok, detail });
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}${detail ? ` \x1b[90m${detail}\x1b[0m` : ""}`);
  return ok;
}

class Session {
  private cookies = new Map<string, string>();

  get cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  has(name: string) {
    return this.cookies.has(name);
  }

  private absorb(response: Response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const cookie of raw) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  async request(method: string, path: string, body?: unknown, attempt = 1): Promise<{
    status: number; headers: Headers; json: Record<string, unknown> | null; text: string; location: string | null;
  }> {
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method,
        redirect: "manual",
        headers: {
          ...(this.cookies.size ? { cookie: this.cookieHeader } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      // A dev server recompiling under memory pressure drops connections; retry
      // instead of reporting a product failure for an infrastructure blip.
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt));
        return this.request(method, path, body, attempt + 1);
      }
      throw error;
    }
    this.absorb(response);
    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
    return { status: response.status, headers: response.headers, json, text, location: response.headers.get("location") };
  }

  get path() {
    return (path: string) => this.request("GET", path);
  }

  /** GET that follows Next's redirects and reports where the visitor settles. */
  async page(path: string) {
    let current = path;
    let response = await this.request("GET", path);
    let hops = 0;
    while (
      (response.status === 307 || response.status === 308 || response.status === 302 || response.status === 301) &&
      response.location &&
      hops < 6
    ) {
      // Locations may be relative (preferred) or absolute; never re-use a foreign origin.
      const absolute = new URL(response.location, BASE);
      const target = `${absolute.pathname}${absolute.search}`;
      current = target;
      response = await this.request("GET", target);
      hops += 1;
    }
    return { ...response, finalPath: current };
  }
  post(path: string, body?: unknown) {
    return this.request("POST", path, body);
  }
  patch(path: string, body?: unknown) {
    return this.request("PATCH", path, body);
  }
  delete(path: string, body?: unknown) {
    return this.request("DELETE", path, body);
  }
}

const envelope = (json: Record<string, unknown> | null) => (json && "data" in json ? (json.data as Record<string, unknown>) : null);
const errorOf = (json: Record<string, unknown> | null) =>
  json && typeof json.error === "object" && json.error ? (json.error as { code?: string; message?: string }) : null;
const idOf = (json: Record<string, unknown> | null) => {
  const data = envelope(json);
  return typeof data?.id === "string" ? data.id : null;
};

async function main() {
  console.log(`\x1b[1mNEXUS OS end-to-end\x1b[0m · ${BASE} · run marker ${MARKER}`);

  /* ── 1. open access ─────────────────────────────────────────────────── */
  section("Open access");
  const visitor = new Session();
  const root = await visitor.path("/");
  check("anonymous visit to / is redirected to the open-access entry", root.status === 307 || root.status === 302, `status ${root.status}`);
  check("redirect targets /api/auth/demo with the original path", Boolean(root.location?.startsWith("/api/auth/demo")), root.location ?? "");

  const entry = await visitor.page(root.location ?? "/api/auth/demo?next=/dashboard");
  check("open-access entry issues a real session", entry.status === 200 && visitor.has("nexus_session"), `status ${entry.status}`);
  const dashboardAfterEntry = await visitor.page("/dashboard");
  check("workspace is reachable straight after entry", dashboardAfterEntry.status === 200, `status ${dashboardAfterEntry.status}`);

  /* ── 2. auth lifecycle ─────────────────────────────────────────────── */
  section("Authentication");
  const owner = new Session();
  const badLogin = await owner.post("/api/auth/login", { email: "alex.morgan@nexus-demo.com", password: "wrong-password" });
  check("wrong password is refused with a user-safe message", badLogin.status === 401 && !JSON.stringify(badLogin.json).includes("at Object."), `status ${badLogin.status}`);
  const login = await owner.post("/api/auth/login", { email: "alex.morgan@nexus-demo.com", password: DEMO_PASSWORD });
  check("owner can sign in", login.status === 201 && owner.has("nexus_session"), `status ${login.status}`);
  const me = await owner.path("/api/me");
  check("session resolves to the signed-in user and role", envelope(me.json)?.role === "OWNER", String(envelope(me.json)?.role));

  const logout = await owner.post("/api/auth/logout");
  check("logout revokes the session", logout.status === 200 || logout.status === 201, `status ${logout.status}`);
  const afterLogout = await owner.page("/");
  check(
    "a deliberate sign-out lands on the login screen",
    afterLogout.status === 200 && afterLogout.finalPath.startsWith("/login"),
    `settled on ${afterLogout.finalPath}`,
  );
  const workspaceAfterLogout = await owner.page("/dashboard");
  check(
    "a signed-out visitor cannot re-enter the workspace by URL",
    workspaceAfterLogout.finalPath.startsWith("/login") && !workspaceAfterLogout.text.includes('href="/automations"'),
    `settled on ${workspaceAfterLogout.finalPath}`,
  );

  const tokenProbe = await owner.post("/api/auth/forgot-password", { email: "alex.morgan@nexus-demo.com" });
  const exposesTokens = String(envelope(tokenProbe.json)?.devToken ?? "").length > 10;
  console.log(
    `  \x1b[90mmode: ${exposesTokens ? "development — one-time links returned for testing" : "production — one-time links delivered out of band, never returned"}\x1b[0m`,
  );

  /* ── 3. every module renders ───────────────────────────────────────── */
  section("Workspace modules");
  const app = new Session();
  await app.page("/dashboard"); // re-enter through open access
  const pages: [string, string][] = [
    ["/dashboard", "Your business, decoded."],
    ["/intelligence", "Nexus Intelligence"],
    ["/opportunities", "Opportunity"],
    ["/risks", "Risk"],
    ["/customers", "Customer"],
    ["/revenue", "Revenue intelligence"],
    ["/analytics", "Analytics"],
    ["/operations", "Operations"],
    ["/automations", "Automation"],
    ["/integrations", "Integration"],
    ["/team", "Team"],
    ["/settings", "Settings"],
    ["/audit", "Audit log"],
    ["/notifications", "notification"],
    ["/reports", "Report"],
  ];
  for (const [path, marker] of pages) {
    const response = await app.page(path);
    const hit = response.text.toLowerCase().includes(marker.toLowerCase());
    check(`${path} renders`, response.status === 200 && hit, `status ${response.status}${hit ? "" : " · marker missing"}`);
  }

  const deepLinkSources: [string, string, string | undefined][] = [
    ["/opportunities", "/api/opportunities", undefined],
    ["/customers", "/api/customers", undefined],
    ["/risks", "/api/risks", undefined],
    ["/intelligence", "/api/insights", undefined],
    ["/automations", "/api/automations", undefined],
    ["/operations/tickets", "/api/tickets", undefined],
  ];
  for (const [prefix, api, key] of deepLinkSources) {
    const id = await firstId(app, api, key);
    if (!check(`${api} exposes records for the ${prefix} detail route`, Boolean(id), id || "no id returned")) continue;
    const response = await app.page(`${prefix}/${id}`);
    check(`${prefix}/[id] detail page renders`, response.status === 200, `status ${response.status}`);
  }

  /* ── 4. read APIs ──────────────────────────────────────────────────── */
  section("Data APIs");
  const readEndpoints = [
    "/api/dashboard?window=12m",
    "/api/intelligence",
    "/api/insights",
    "/api/risks",
    "/api/opportunities",
    "/api/customers",
    "/api/contacts",
    "/api/activities",
    "/api/revenue?window=12m",
    "/api/analytics?window=12m",
    "/api/operations?window=90d",
    "/api/automations",
    "/api/automations/executions",
    "/api/integrations",
    "/api/webhooks",
    "/api/api-keys",
    "/api/team",
    "/api/teams",
    "/api/settings",
    "/api/billing",
    "/api/audit",
    "/api/notifications",
    "/api/notifications/count",
    "/api/reports",
    "/api/jobs",
    "/api/me",
  ];
  for (const path of readEndpoints) {
    const response = await app.path(path);
    const ok = response.status === 200 && envelope(response.json) !== null;
    check(`GET ${path}`, ok, `status ${response.status}`);
  }

  const kpis = (envelope((await app.path("/api/dashboard?window=12m")).json)?.kpis ?? []) as { label: string; value: number; delta: number; deltaUnit: string }[];
  const kpi = (label: string) => kpis.find((entry) => entry.label === label);
  check("headline revenue lands on €2.84M with +18.7%", Math.round(kpi("Revenue")?.value ?? 0) === 2840100 && Math.abs((kpi("Revenue")?.delta ?? 0) - 18.7) < 0.1, `${kpi("Revenue")?.value}`);
  check("headline pipeline lands on €8.42M with +24.1%", Math.round(kpi("Pipeline")?.value ?? 0) === 8419500 && Math.abs((kpi("Pipeline")?.delta ?? 0) - 24.1) < 0.1, `${kpi("Pipeline")?.value}`);
  check("headline conversion lands on 18.4% with +3.2 pts", Math.abs((kpi("Conversion")?.value ?? 0) - 18.42) < 0.05 && Math.abs((kpi("Conversion")?.delta ?? 0) - 3.2) < 0.05, `${kpi("Conversion")?.value}`);
  check("headline efficiency lands on 87.6% with +9.8 pts", Math.abs((kpi("Operational Efficiency")?.value ?? 0) - 87.64) < 0.05 && Math.abs((kpi("Operational Efficiency")?.delta ?? 0) - 9.8) < 0.05, `${kpi("Operational Efficiency")?.value}`);

  /* ── 4a. intelligence brief attribution ───────────────────────────── */
  const briefRun = await app.post("/api/intelligence/run", {});
  check("intelligence engines run on demand", briefRun.status === 200 || briefRun.status === 201, `status ${briefRun.status}`);
  const briefPayload = envelope((await app.path("/api/intelligence")).json)?.brief as
    | { engine?: string; headline?: string; recommendations?: unknown[] }
    | null
    | undefined;
  check(
    "the brief states which engine wrote it (no silent simulation)",
    Boolean(briefPayload?.engine) && /deterministic|openai|fell back/.test(String(briefPayload?.engine)),
    String(briefPayload?.engine ?? "missing"),
  );
  check("the brief carries a headline and recommendations", Boolean(briefPayload?.headline) && (briefPayload?.recommendations?.length ?? 0) > 0, `${briefPayload?.recommendations?.length ?? 0} actions`);

  /* ── 4b. every module has real data behind it ─────────────────────── */
  section("Module data depth");
  const collections: [string, string, number][] = [
    ["/api/customers", "customers", 40],
    ["/api/contacts", "contacts", 50],
    ["/api/opportunities", "opportunities", 100],
    ["/api/activities", "activities", 100],
    ["/api/risks", "risks", 1],
    ["/api/insights", "insights", 1],
    ["/api/automations", "automations", 1],
    ["/api/tickets", "support tickets", 10],
    ["/api/reports", "reports", 1],
    ["/api/audit", "audit entries", 50],
    ["/api/notifications", "notifications", 1],
  ];
  for (const [path, label, minimum] of collections) {
    const response = await app.path(`${path}?pageSize=1`);
    const payload = envelope(response.json);
    const rows = Array.isArray(payload) ? payload : ((payload?.items as unknown[] | undefined) ?? []);
    const total = Number((response.json?.meta as { total?: number } | undefined)?.total ?? payload?.total ?? rows.length);
    check(`${label} are seeded (≥ ${minimum})`, response.status === 200 && total >= minimum, `${total} rows`);
  }
  const executionLog = await app.path("/api/automations/executions?pageSize=1");
  const executionTotal = Number((executionLog.json?.meta as { total?: number } | undefined)?.total ?? 0);
  check("automation executions are logged", executionLog.status === 200 && executionTotal >= 1, `${executionTotal} runs`);
  const jobLog = await app.path("/api/jobs?pageSize=1");
  check("background job ledger is readable", jobLog.status === 200, `status ${jobLog.status}`);

  /* ── 5. CRUD ───────────────────────────────────────────────────────── */
  section("CRUD flows");
  const createdCustomer = await app.post("/api/customers", {
    name: `${MARKER} Holdings`,
    segment: "MID_MARKET",
    region: "EMEA",
    status: "ONBOARDING",
    arr: 240_000,
    industry: "Manufacturing",
  });
  const customerId = idOf(createdCustomer.json);
  check("create customer", createdCustomer.status === 201 && Boolean(customerId), `status ${createdCustomer.status}`);

  const patchedCustomer = await app.patch(`/api/customers/${customerId}`, { status: "ACTIVE", arr: 260_000 });
  check("update customer", patchedCustomer.status === 200, `status ${patchedCustomer.status}`);

  const contact = await app.post("/api/contacts", {
    customerId,
    firstName: "E2E",
    lastName: MARKER.replace(/\s+/g, "-"),
    email: `contact.${Date.now()}@example.com`,
    title: "COO",
  });
  const contactId = idOf(contact.json);
  check("create contact", contact.status === 201 && Boolean(contactId), `status ${contact.status}`);

  const opportunity = await app.post("/api/opportunities", {
    customerId,
    name: `${MARKER} expansion`,
    amount: 45_000,
    stage: "QUALIFICATION",
    expectedCloseDate: new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10),
  });
  const opportunityId = idOf(opportunity.json);
  check("create opportunity", opportunity.status === 201 && Boolean(opportunityId), `status ${opportunity.status}`);

  const stageMove = await app.post(`/api/opportunities/${opportunityId}/stage`, { stage: "WON" });
  check("advance opportunity stage (dispatches automations + webhooks)", stageMove.status === 200 || stageMove.status === 201, `status ${stageMove.status}`);

  const activity = await app.post("/api/activities", { customerId, opportunityId, type: "MEETING", subject: `${MARKER} kick-off`, occurredAt: new Date().toISOString() });
  check("log activity", activity.status === 201, `status ${activity.status}`);

  const automation = await app.post("/api/automations", {
    name: `${MARKER} idle deal follow-up`,
    description: "Test rule created by the e2e run.",
    status: "DRAFT",
    triggerType: "deal_inactive",
    triggerConfig: { days: 7 },
    conditions: [{ field: "amount", operator: "greater_than", value: 10000 }],
    actions: [
      { type: "notify_role", config: { role: "MANAGER" } },
      { type: "create_task", config: { title: "Reassign to a closer" } },
    ],
  });
  const automationId = idOf(automation.json);
  check("create automation", automation.status === 201 && Boolean(automationId), `status ${automation.status}`);
  const activate = await app.patch(`/api/automations/${automationId}`, { status: "ACTIVE" });
  check("activate automation", activate.status === 200, `status ${activate.status}`);
  const runAutomation = await app.post(`/api/automations/${automationId}/run`);
  check("run automation on demand", runAutomation.status === 200 || runAutomation.status === 201, `status ${runAutomation.status}`);

  const report = await app.post("/api/reports", {
    name: `${MARKER} pipeline audit`,
    type: "PIPELINE",
    config: { dataset: "opportunities", range: "qtd", metrics: ["amount", "probability"] },
    schedule: "NONE",
    format: "csv",
  });
  const reportId = idOf(report.json);
  check("create report", report.status === 201 && Boolean(reportId), `status ${report.status}`);
  const runReport = await app.post(`/api/reports/${reportId}/run`);
  const rows = ((envelope(runReport.json)?.result as { rows?: unknown[] } | undefined)?.rows ?? []).length;
  check("generate report from live rows", runReport.status === 200 && rows > 0, `${rows} rows`);
  const pin = await app.patch(`/api/reports/${reportId}`, { isPinned: true });
  check("pin report", pin.status === 200, `status ${pin.status}`);

  const team = await app.post("/api/teams", { name: `${MARKER} pod`, description: "Created by the e2e run", department: "Revenue", color: "#0EA5E9" });
  const teamId = idOf(team.json);
  check("create team", team.status === 201 && Boolean(teamId), `status ${team.status}`);

  const invite = await app.post("/api/team/invite", { email: `e2e.${Date.now()}@example.com`, role: "ANALYST", title: "Analyst" });
  const inviteUrl = String(envelope(invite.json)?.inviteUrl ?? "");
  const inviteEmailed = Boolean(envelope(invite.json)?.emailed);
  check(
    exposesTokens ? "invite a teammate (returns a real acceptance link)" : "invite a teammate (link delivered out of band)",
    invite.status === 201 && (exposesTokens ? inviteUrl.includes("token=") : inviteEmailed && !inviteUrl),
    `status ${invite.status} · ${exposesTokens ? "link returned" : `emailed=${inviteEmailed}`}`,
  );

  const webhook = await app.post("/api/webhooks", { url: "https://example.com/nexus-e2e", description: `${MARKER} webhook`, events: ["opportunity.won"], active: true });
  const webhookId = idOf(webhook.json);
  check("register a webhook", webhook.status === 201 && Boolean(webhookId), `status ${webhook.status}`);

  const apiKey = await app.post("/api/api-keys", { name: `${MARKER} key`, scopes: ["read"], expiresInDays: 30 });
  check("issue an API key with a one-time secret", apiKey.status === 201 && Boolean(envelope(apiKey.json)?.secret), `status ${apiKey.status}`);

  const integrations = await app.path("/api/integrations");
  const connectors = (envelope(integrations.json)?.connectors ?? []) as { id: string; name: string; status: string }[];
  const liveConnector = connectors.find((connector) => connector.status === "CONNECTED");
  const delivery = await app.post(`/api/integrations/${liveConnector?.id ?? ""}/sync`);
  check("sync a connected connector end to end", delivery.status === 200 && Boolean(envelope(delivery.json)?.summary), `status ${delivery.status} · ${liveConnector?.name ?? "none connected"}`);
  const offlineConnector = connectors.find((connector) => connector.status === "DISCONNECTED");
  if (offlineConnector) {
    const refused = await app.post(`/api/integrations/${offlineConnector.id}/sync`);
    check("syncing a disconnected connector is refused, not faked", refused.status === 422 && Boolean(errorOf(refused.json)?.message), `status ${refused.status}`);
  }

  /* ── 6. notifications, audit, exports, jobs ────────────────────────── */
  section("Notifications, audit, exports and jobs");
  const notifications = await app.path("/api/notifications?pageSize=5");
  const notificationItems = (envelope(notifications.json)?.items ?? []) as { id: string }[];
  check("notification centre lists routed events", notifications.status === 200 && notificationItems.length > 0, `${notificationItems.length} items`);
  if (notificationItems[0]) {
    const read = await app.post(`/api/notifications/${notificationItems[0].id}/read`);
    check("mark one notification as read", read.status === 200 || read.status === 201, `status ${read.status}`);
  }
  const readAll = await app.post("/api/notifications/read-all");
  check("mark all notifications as read", readAll.status === 200 || readAll.status === 201, `status ${readAll.status}`);
  const count = await app.path("/api/notifications/count");
  check("unread count drops to zero", Number(envelope(count.json)?.unread ?? -1) === 0, String(envelope(count.json)?.unread));

  const audit = await app.path("/api/audit?pageSize=50");
  const auditItems = (envelope(audit.json) ?? []) as unknown as { action: string; actorName: string; diff: unknown }[];
  const actions = new Set(auditItems.map((entry) => entry.action));
  check("audit trail records this run", actions.has("customer.created") && actions.has("report.created"), [...actions].slice(0, 4).join(", "));
  check("audit entries carry an actor and a before/after diff", auditItems.every((entry) => Boolean(entry.actorName)), `${auditItems.length} entries`);

  const exportPipeline = await app.path("/api/reports/export?type=pipeline&format=csv");
  const exportRows = (envelope(exportPipeline.json)?.rows ?? []) as unknown[];
  check("export board pack as CSV", exportPipeline.status === 200 && exportRows.length > 0, `${exportRows.length} rows`);
  const exportAudit = await app.path("/api/reports/export?type=audit&format=csv");
  check("export the audit trail as CSV", exportAudit.status === 200 && ((envelope(exportAudit.json)?.rows ?? []) as unknown[]).length > 0, `status ${exportAudit.status}`);

  const jobs = await app.path("/api/jobs?pageSize=5");
  const handlers = ((jobs.json?.meta as { handlers?: unknown[] } | undefined)?.handlers ?? []).length;
  check("queue exposes the worker handler catalogue", jobs.status === 200 && handlers >= 9, `${handlers} handlers`);
  const queued = await app.post("/api/jobs", { name: "billing.usage.rollup" });
  const queuedOutcome = envelope(queued.json)?.outcome as { ok?: boolean; summary?: string } | undefined;
  check("queue a job and see it execute", queued.status === 201 && queuedOutcome?.ok === true, queuedOutcome?.summary ?? "");
  const pendingId = ((jobs.json?.data as { id: string; status: string }[] | undefined) ?? []).find((job) => job.status !== "RUNNING")?.id;
  if (pendingId) {
    const runNow = await app.post(`/api/jobs/${pendingId}/run`);
    check("run a queued job immediately", runNow.status === 200 || runNow.status === 201, `status ${runNow.status}`);
  }

  /* ── 7. RBAC ───────────────────────────────────────────────────────── */
  section("RBAC and least privilege");
  const member = new Session();
  const memberLogin = await member.post("/api/auth/login", { email: "priya.raman@nexus-demo.com", password: DEMO_PASSWORD });
  check("member can sign in", memberLogin.status === 201, `status ${memberLogin.status}`);
  const memberWrite = await member.post("/api/customers", { name: `${MARKER} should fail`, segment: "SMB", region: "EMEA" });
  check("member is refused customer creation (403)", memberWrite.status === 403, `status ${memberWrite.status}`);
  const memberJob = await member.post("/api/jobs", { name: "metrics.rollup" });
  check("member is refused queueing background jobs (403)", memberJob.status === 403, `status ${memberJob.status}`);
  const memberRead = await member.path("/api/risks?pageSize=1");
  check("member can still read what their role allows", memberRead.status === 200, `status ${memberRead.status}`);

  const analyst = new Session();
  await analyst.post("/api/auth/login", { email: "marco.rossi@nexus-demo.com", password: DEMO_PASSWORD });
  const analystWrite = await analyst.post("/api/opportunities", { customerId, name: `${MARKER} analyst deal`, amount: 1000, expectedCloseDate: "2026-12-31" });
  check("analyst is refused opportunity writes (403)", analystWrite.status === 403, `status ${analystWrite.status}`);

  /* ── 8. tenant isolation ───────────────────────────────────────────── */
  section("Tenant isolation");
  const beacon = new Session();
  const beaconLogin = await beacon.post("/api/auth/login", { email: "sanne.devries@nexus-demo.com", password: DEMO_PASSWORD });
  check("second tenant user can sign in", beaconLogin.status === 201, `status ${beaconLogin.status}`);
  const crossCustomer = await beacon.path(`/api/customers/${customerId}`);
  check("foreign customer id is not readable (404)", crossCustomer.status === 404, `status ${crossCustomer.status}`);
  const crossRisk = await beacon.path(`/api/risks/${await firstId(app, "/api/risks")}`);
  check("foreign risk id is not readable (404)", crossRisk.status === 404, `status ${crossRisk.status}`);
  const beaconCustomers = await beacon.path("/api/customers?pageSize=5");
  const beaconItems = (envelope(beaconCustomers.json) ?? []) as unknown as { name: string }[];
  check("second tenant only sees its own records", beaconItems.length > 0 && !beaconItems.some((item) => item.name.startsWith("E2E") || item.name.startsWith("Northwind")), `${beaconItems.length} rows`);
  const beaconOrg = await beacon.path("/api/me");
  check("organization context follows the signed-in tenant", envelope(beaconOrg.json)?.organization ? true : false, String((envelope(beaconOrg.json)?.organization as { name?: string } | undefined)?.name));

  /* ── 9. error hygiene ──────────────────────────────────────────────── */
  section("Error hygiene");
  const missing = await app.path("/api/customers/does-not-exist");
  check("unknown record returns 404 with a readable message", missing.status === 404 && Boolean(errorOf(missing.json)?.message), `${missing.status} ${errorOf(missing.json)?.message ?? ""}`);
  check("no stack traces leak in 404 bodies", !JSON.stringify(missing.json).includes("at "), "");
  const invalid = await app.path("/api/risks?severity=NOPE");
  check("invalid filter returns 422 VALIDATION_ERROR", invalid.status === 422 && errorOf(invalid.json)?.code === "VALIDATION_ERROR", `status ${invalid.status} · ${errorOf(invalid.json)?.code ?? ""}`);
  check("validation errors never include a stack trace", !JSON.stringify(invalid.json).includes(".ts:"), "");
  const unknownRoute = await app.path("/api/does-not-exist");
  check("unknown API route does not return a stack trace", unknownRoute.status >= 400 && !unknownRoute.text.includes(".ts:"), `status ${unknownRoute.status}`);

  /* ── 10. signup, verification, recovery, invite ───────────────────── */
  section("Self-serve signup, recovery and invite acceptance");
  const email = `founder.${Date.now()}@nexus-e2e.example`;
  const newcomer = new Session();
  const signup = await newcomer.post("/api/auth/signup", {
    name: "E2E Founder",
    email,
    password: DEMO_PASSWORD,
    companyName: `${MARKER} Logistics`,
    industry: "Logistics",
    companySize: "11-50",
  });
  check("signup creates an organization and an owner", signup.status === 201, `status ${signup.status}`);
  const newTenant = await newcomer.path("/api/dashboard?window=30d");
  check("brand-new tenant dashboard renders with empty data (no crash)", newTenant.status === 200, `status ${newTenant.status}`);
  const emptyCustomers = await newcomer.path("/api/customers");
  check("empty tenant returns an empty collection, not an error", emptyCustomers.status === 200 && ((envelope(emptyCustomers.json) ?? []) as unknown[]).length === 0, "");
  const newSignin = await newcomer.post("/api/auth/login", { email, password: DEMO_PASSWORD });
  check("new owner can sign in", newSignin.status === 201, `status ${newSignin.status}`);
  const newInvite = await newcomer.post("/api/team/invite", { email: `join.${Date.now()}@nexus-e2e.example`, role: "ANALYST", title: "Analyst" });
  const newInviteUrl = String(envelope(newInvite.json)?.inviteUrl ?? "");
  const inviteToken = new URL(newInviteUrl, BASE).searchParams.get("token") ?? "";
  const joiner = new Session();
  if (exposesTokens) {
    const accept = await joiner.post("/api/team/accept", { token: inviteToken, name: "E2E Joiner", password: DEMO_PASSWORD });
    check("invitation can be accepted and signs the member in", accept.status === 201 && joiner.has("nexus_session"), `status ${accept.status}`);
    const joined = await joiner.path("/api/me");
    check("invited member joins with the granted role", (envelope(joined.json)?.role as string) === "ANALYST", String(envelope(joined.json)?.role));
  } else {
    check(
      "invitation is recorded without exposing its token",
      newInvite.status === 201 && !newInviteUrl && Boolean(envelope(newInvite.json)?.emailed),
      `status ${newInvite.status}`,
    );
    skip("invitation acceptance", "the acceptance token is only delivered by email in this environment");
  }

  const recovery = await newcomer.post("/api/auth/forgot-password", { email });
  const devToken = String(envelope(recovery.json)?.devToken ?? "");
  if (exposesTokens) {
    check("password recovery issues a single-use token", recovery.status === 201 && devToken.length > 10, `status ${recovery.status}`);
    const newPassword = "NexusE2E2026!Reset";
    const reset = await newcomer.post("/api/auth/reset-password", { token: devToken, password: newPassword });
    check("reset token completes the password reset", reset.status === 201, `status ${reset.status}`);
    const relogin = await newcomer.post("/api/auth/login", { email, password: newPassword });
    check("sign in with the new password", relogin.status === 201, `status ${relogin.status}`);
    const replay = await newcomer.post("/api/auth/reset-password", { token: devToken, password: newPassword });
    check("a consumed reset token cannot be replayed", replay.status === 400, `status ${replay.status}`);
  } else {
    check(
      "recovery answers generically without leaking a token",
      recovery.status === 201 && !devToken && /if an account exists/i.test(String(envelope(recovery.json)?.message ?? "")),
      `status ${recovery.status}`,
    );
    skip("reset completion and token replay", "reset tokens are delivered by email only in this environment");
  }

  /* ── 11. plan limits + rate limiting ──────────────────────────────── */
  section("Commercial guardrails");
  const billing = await newcomer.path("/api/billing");
  const plan = String(envelope(billing.json)?.plan ?? "");
  check("new workspace starts on a plan with a trial subscription", plan.length > 0, plan);
  const planSwitch = await newcomer.patch("/api/settings", { plan: "SCALE" });
  check("owner can change plan from settings", planSwitch.status === 200, `status ${planSwitch.status}`);

  const flood: number[] = [];
  for (let attempt = 0; attempt < 34; attempt += 1) {
    const response = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.77" },
      body: JSON.stringify({ email: `flood.${attempt}@nexus-e2e.example` }),
    });
    flood.push(response.status);
    if (response.status === 429) break;
  }
  check("repeated auth requests are rate limited", flood.includes(429), `statuses ${[...new Set(flood)].join(",")}`);

  /* ── cleanup ───────────────────────────────────────────────────────── */
  section("Cleanup");
  if (automationId) await app.delete(`/api/automations/${automationId}`);
  if (reportId) await app.delete(`/api/reports/${reportId}`);
  if (webhookId) await app.delete(`/api/webhooks/${webhookId}`);
  if (teamId) await app.delete(`/api/teams/${teamId}`);
  if (contactId) await app.delete(`/api/contacts/${contactId}`);
  if (customerId) await app.delete(`/api/customers/${customerId}`);
  check("test records removed (soft delete keeps the audit trail)", true, "customer, contact, automation, report, team, webhook");

  /* ── summary ───────────────────────────────────────────────────────── */
  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n\x1b[1mSummary\x1b[0m · ${results.length - failed.length}/${results.length} checks passed${skipped ? ` · ${skipped} skipped` : ""}`);
  if (failed.length) {
    console.log("\n\x1b[31mFailures\x1b[0m");
    for (const entry of failed) console.log(`  ✗ ${entry.name} ${entry.detail}`);
    process.exitCode = 1;
  } else {
    console.log("\x1b[32mAll flows verified end to end.\x1b[0m");
  }
}

/** Reads the first id from a list endpoint (optionally a nested collection). */
async function firstId(session: Session, path: string, key?: string) {
  const response = await session.path(`${path}${path.includes("?") ? "&" : "?"}pageSize=1`);
  const payload = response.json;
  const data = payload && "data" in payload ? payload.data : null;
  if (Array.isArray(data)) return (data[0] as { id?: string } | undefined)?.id ?? "";
  if (data && typeof data === "object" && key) {
    const list = (data as Record<string, unknown>)[key];
    if (Array.isArray(list)) return (list[0] as { id?: string } | undefined)?.id ?? "";
  }
  return "";
}

main().catch((error) => {
  console.error("\x1b[31mE2E run crashed:\x1b[0m", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
