/**
 * Demo seed.
 *
 * Builds two complete tenants — Northwind Group (primary, ~50 accounts and a
 * full revenue history) and Beacon Logistics (secondary, proving data
 * isolation) — then runs the real intelligence engines over them, so every
 * metric, insight, risk, brief and notification in the product is derived from
 * these rows instead of being hardcoded in the UI.
 *
 * Usage: npm run db:seed   ·   npx tsx scripts/run-seed.ts
 */
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { runIntelligence } from "@/server/engines";
import { computeRevenueSnapshot, resolveWindow } from "@/server/engines/metrics";
import { planFor } from "@/lib/plans";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import {
  createApiKeys,
  createAutomations,
  createBilling,
  createIntegrations,
  createJobs,
  createOrganization,
  createReports,
  createTeams,
  createUsageEvents,
  createUsersAndMemberships,
  createWebhooks,
  resetDatabase,
  type SeedUser,
} from "./seed/core";
import {
  createActivities,
  createContacts,
  createCustomers,
  createMetricHistory,
  createOpportunities,
  createReceivables,
  createTickets,
  refreshCustomerRollups,
} from "./seed/commercial";
import { createAuditTrail, createAutomationHistory, createNotifications, createWebhookDeliveries } from "./seed/operations";
import { createRng, daysAgo } from "./seed/data";

const SEED_VERSION = "20260922";
const DEMO_PASSWORD = "NexusDemo2026!";

type PersonBlueprint = Omit<SeedUser, "id">;

const NORTHWIND_PEOPLE: PersonBlueprint[] = [
  { email: "alex.morgan@nexus-demo.com", name: "Alex Morgan", role: "OWNER", jobTitle: "Founder & CEO", department: "Revenue", team: "Revenue Operations", quota: 0 },
  { email: "sofia.marques@nexus-demo.com", name: "Sofia Marques", role: "ADMIN", jobTitle: "VP Revenue Operations", department: "Operations", team: "Revenue Operations", quota: 900_000 },
  { email: "daniel.okafor@nexus-demo.com", name: "Daniel Okafor", role: "MANAGER", jobTitle: "Enterprise Sales Manager", department: "Revenue", team: "Enterprise Sales", quota: 1_400_000 },
  { email: "priya.raman@nexus-demo.com", name: "Priya Raman", role: "MEMBER", jobTitle: "Senior Account Executive", department: "Revenue", team: "Enterprise Sales", quota: 1_100_000 },
  { email: "lucas.bernard@nexus-demo.com", name: "Lucas Bernard", role: "MEMBER", jobTitle: "Account Executive", department: "Revenue", team: "Enterprise Sales", quota: 950_000 },
  { email: "hannah.weber@nexus-demo.com", name: "Hannah Weber", role: "MEMBER", jobTitle: "Account Executive", department: "Revenue", team: "Mid-Market Sales", quota: 720_000 },
  { email: "tomas.silva@nexus-demo.com", name: "Tomás Silva", role: "MEMBER", jobTitle: "Account Executive", department: "Revenue", team: "Mid-Market Sales", quota: 680_000 },
  { email: "yuki.tanaka@nexus-demo.com", name: "Yuki Tanaka", role: "MEMBER", jobTitle: "Sales Development Rep", department: "Revenue", team: "Mid-Market Sales", quota: 420_000 },
  { email: "elena.petrova@nexus-demo.com", name: "Elena Petrova", role: "MANAGER", jobTitle: "Head of Customer Success", department: "Customer Success", team: "Customer Success", quota: 0 },
  { email: "ines.ferreira@nexus-demo.com", name: "Ines Ferreira", role: "MEMBER", jobTitle: "Customer Success Manager", department: "Customer Success", team: "Customer Success", quota: 0 },
  { email: "nadia.haddad@nexus-demo.com", name: "Nadia Haddad", role: "MANAGER", jobTitle: "Support Engineering Lead", department: "Operations", team: "Support Engineering", quota: 0 },
  { email: "marco.rossi@nexus-demo.com", name: "Marco Rossi", role: "ANALYST", jobTitle: "Revenue Analyst", department: "Finance", team: "Finance & Billing", quota: 0 },
  { email: "jonas.berg@nexus-demo.com", name: "Jonas Berg", role: "MANAGER", jobTitle: "Finance Manager", department: "Finance", team: "Finance & Billing", quota: 0 },
];

const BEACON_PEOPLE: PersonBlueprint[] = [
  { email: "alex.morgan@nexus-demo.com", name: "Alex Morgan", role: "ADMIN", jobTitle: "Group CFO", department: "Finance", team: "Finance & Billing", quota: 0 },
  { email: "sanne.devries@nexus-demo.com", name: "Sanne de Vries", role: "OWNER", jobTitle: "Managing Director", department: "Revenue", team: "Revenue Operations", quota: 600_000 },
  { email: "felix.fischer@nexus-demo.com", name: "Felix Fischer", role: "MANAGER", jobTitle: "Commercial Manager", department: "Revenue", team: "Mid-Market Sales", quota: 520_000 },
  { email: "camille.moreau@nexus-demo.com", name: "Camille Moreau", role: "MEMBER", jobTitle: "Customer Success Manager", department: "Customer Success", team: "Customer Success", quota: 0 },
];

async function main() {
  const startedAt = Date.now();
  const rng = createRng(20_260_922);
  const now = new Date();

  console.log(`\n  Nexus OS — demo seed ${SEED_VERSION} (deterministic)`);
  console.log("  ─────────────────────────────────────────────────────────");

  console.log("→ resetting tenant data");
  await resetDatabase(db);

  /* ─────────────────────────── tenant one ─────────────────────────── */
  console.log("→ creating organization, people and teams");
  const organization = await createOrganization(db, {
    name: "Northwind Group",
    slug: "northwind",
    legalName: "Northwind Group S.A.",
    domain: "northwind.example.com",
    plan: "SCALE",
    industry: "Enterprise Software",
    companySize: "201-500",
    hqCountry: "PT",
    churnRiskThreshold: 60,
    onboardedAt: daysAgo(540, now),
    primaryColor: "#4F46E5",
  });

  const people = await createUsersAndMemberships(db, organization.id, NORTHWIND_PEOPLE, now);
  await createTeams(db, organization.id, people, now);

  const sellers = people.filter((person) => person.team === "Enterprise Sales" || person.team === "Mid-Market Sales");
  const csms = people.filter((person) => person.team === "Customer Success");
  const support = people.filter((person) => person.team === "Support Engineering");

  const billing = await createBilling(db, organization.id, "SCALE", 23, "sofia.marques@nexus-demo.com", now);
  console.log(`→ billing: ${planFor("SCALE").name} plan, ${billing.invoices} platform invoices, MRR ${formatCurrency(billing.mrr)}`);

  const integrations = await createIntegrations(db, organization.id, rng, people[1]!.id, now);
  const webhooks = await createWebhooks(db, organization.id, people[1]!.id, now);
  const apiKeys = await createApiKeys(db, organization.id, people[0]!.id, now);
  const reports = await createReports(db, organization.id, people[1]!.id, now);
  const jobs = await createJobs(db, organization.id, now);
  const automations = await createAutomations(db, organization.id, people[1]!.id, now);
  await createUsageEvents(db, organization.id, now);
  console.log(
    `→ platform: ${integrations.length} integrations, ${webhooks.length} webhooks, ${apiKeys.length} API keys, ${reports.length} reports, ${jobs.length} jobs, ${automations.length} automations`,
  );

  console.log("→ generating 48 accounts with 24 months of commercial history");
  const customers = await createCustomers(rng, organization.id, sellers, csms, 48, now);
  const contactsByCustomer = await createContacts(rng, organization.id, customers, now);
  const { deals, byCustomer, wonLast12m, wonPrior12m } = await createOpportunities(rng, organization.id, customers, sellers, now, {
    openPipeline: 8_420_000,
    openDeals: 140,
    wonLast12m: 2_879_600,
    wonPrior12m: 2_426_000,
    winRatePercent: 18.43,
    winRatePriorPercent: 15.2,
  });
  const activityCount = await createActivities(rng, organization.id, customers, deals, [...sellers, ...csms], contactsByCustomer, now);
  const ticketCount = await createTickets(rng, organization.id, customers, support.length ? support : sellers, now);
  const invoiceCount = await createReceivables(rng, organization.id, customers, now);
  console.log(
    `→ data: ${customers.length} customers, ${deals.length} deals, ${formatNumber(activityCount)} activities, ${ticketCount} tickets, ${invoiceCount} receivables`,
  );
  console.log(
    `→ closed revenue: last 12m ${formatCurrency(wonLast12m)} · prior 12m ${formatCurrency(wonPrior12m)} · wins ${(wonLast12m / wonPrior12m).toFixed(2)}× YoY`,
  );

  console.log("→ recomputing health scores and customer rollups from the rows");
  await refreshCustomerRollups(organization.id, now);

  /* ─────────────────────────── tenant two ─────────────────────────── */
  console.log("→ creating secondary tenant (Beacon Logistics) for isolation checks");
  const secondary = await createOrganization(db, {
    name: "Beacon Logistics",
    slug: "beacon",
    legalName: "Beacon Logistics B.V.",
    domain: "beacon-logistics.example.com",
    plan: "GROWTH",
    industry: "Logistics & Transport",
    companySize: "51-200",
    hqCountry: "NL",
    churnRiskThreshold: 55,
    onboardedAt: daysAgo(210, now),
    primaryColor: "#0EA5E9",
  });
  const secondaryPeople = await createUsersAndMemberships(db, secondary.id, BEACON_PEOPLE, now);
  await createTeams(db, secondary.id, secondaryPeople, now);
  const secondarySellers = secondaryPeople.filter((person) => person.team !== "Customer Success");
  const secondaryCsms = secondaryPeople.filter((person) => person.team === "Customer Success");
  await createBilling(db, secondary.id, "GROWTH", 8, "sanne.devries@nexus-demo.com", now);
  const secondaryIntegrations = await createIntegrations(db, secondary.id, rng, secondaryPeople[0]!.id, now);
  const secondaryWebhooks = await createWebhooks(db, secondary.id, secondaryPeople[0]!.id, now);
  await createApiKeys(db, secondary.id, secondaryPeople[1]!.id, now);
  await createReports(db, secondary.id, secondaryPeople[0]!.id, now);
  await createAutomations(db, secondary.id, secondaryPeople[1]!.id, now);
  const secondaryCustomers = await createCustomers(rng, secondary.id, secondarySellers, secondaryCsms, 12, now, { nameOffset: 44 });
  const secondaryContacts = await createContacts(rng, secondary.id, secondaryCustomers, now);
  const secondaryDeals = await createOpportunities(rng, secondary.id, secondaryCustomers, secondarySellers, now, {
    openPipeline: 1_140_000,
    openDeals: 22,
    wonLast12m: 420_000,
    wonPrior12m: 380_000,
    winRatePercent: 20,
    winRatePriorPercent: 17.4,
  });
  await createActivities(rng, secondary.id, secondaryCustomers, secondaryDeals.deals, secondarySellers, secondaryContacts, now);
  await createTickets(rng, secondary.id, secondaryCustomers, secondarySellers, now);
  await createReceivables(rng, secondary.id, secondaryCustomers, now);
  await refreshCustomerRollups(secondary.id, now);

  /* ─────────────────── metrics history from live numbers ─────────────────── */
  console.log("→ writing 24 months of daily metric history from the live numbers");
  const primarySnapshot = await computeRevenueSnapshot(organization.id, resolveWindow("12m"));
  const metricCount = await createMetricHistory(organization.id, now, {
    mrr: primarySnapshot.mrr,
    arr: primarySnapshot.arr,
    pipelineOpen: primarySnapshot.pipelineOpen,
    pipelineWeighted: primarySnapshot.pipelineWeighted,
    winRate: primarySnapshot.winRate,
    operationalEfficiency: primarySnapshot.operationalEfficiency,
    atRiskCustomers: primarySnapshot.atRiskCustomers,
    expansionRevenue: primarySnapshot.expansionRevenue,
    revenue: primarySnapshot.revenue,
    revenuePrev: primarySnapshot.revenuePrev,
  });
  const secondarySnapshot = await computeRevenueSnapshot(secondary.id, resolveWindow("12m"));
  await createMetricHistory(secondary.id, now, {
    mrr: secondarySnapshot.mrr,
    arr: secondarySnapshot.arr,
    pipelineOpen: secondarySnapshot.pipelineOpen,
    pipelineWeighted: secondarySnapshot.pipelineWeighted,
    winRate: secondarySnapshot.winRate,
    operationalEfficiency: secondarySnapshot.operationalEfficiency,
    atRiskCustomers: secondarySnapshot.atRiskCustomers,
    expansionRevenue: secondarySnapshot.expansionRevenue,
    revenue: secondarySnapshot.revenue,
    revenuePrev: secondarySnapshot.revenuePrev,
  });
  console.log(`→ metrics: ${formatNumber(metricCount)} primary rows (${formatNumber(metricCount / 10)} days × 10 series)`);

  /* ────────────────────── intelligence on real data ────────────────────── */
  console.log("→ running the intelligence engines (opportunities, risks, brief, metrics)");
  const primaryRun = await runIntelligence(organization.id, {
    actorName: "Nexus Intelligence",
    source: "SYSTEM",
  });
  const secondaryRun = await runIntelligence(secondary.id, { actorName: "Nexus Intelligence", source: "SYSTEM" });
  console.log(
    `→ intelligence: ${primaryRun.insights.detected} insights, ${primaryRun.risks.detected} risks, brief "${primaryRun.brief?.headline ?? "n/a"}"`,
  );

  /* ───────────────────── operational telemetry + audit ───────────────────── */
  console.log("→ writing notifications, audit trail, automation runs and webhook deliveries");
  const automationsWithHistory = await db.automation.findMany({
    where: { organizationId: organization.id },
    select: { id: true, name: true, status: true, failureCount: true },
  });
  const executions = await createAutomationHistory(
    rng,
    organization.id,
    automationsWithHistory,
    deals.filter((deal) => !deal.closedAt).slice(0, 60).map((deal) => ({ id: deal.id, name: `Deal ${deal.id.slice(-6)}` })),
    customers.map((customer) => ({ id: customer.id, name: customer.name })),
    now,
  );
  await createWebhookDeliveries(rng, organization.id, webhooks, now);

  const [topRisk, topInsight, wonDealRow, stalledDeal, atRiskCustomer, primaryReport] = await Promise.all([
    db.risk.findFirst({ where: { organizationId: organization.id }, orderBy: { riskScore: "desc" } }),
    db.insight.findFirst({ where: { organizationId: organization.id }, orderBy: { estimatedImpact: "desc" } }),
    db.opportunity.findFirst({ where: { organizationId: organization.id, stage: "WON" }, orderBy: { closedAt: "desc" } }),
    db.opportunity.findFirst({
      where: { organizationId: organization.id, stage: { in: ["QUALIFICATION", "PROPOSAL", "NEGOTIATION"] } },
      orderBy: { amount: "desc" },
    }),
    db.customer.findFirst({ where: { organizationId: organization.id, status: "AT_RISK" }, orderBy: { arr: "desc" } }),
    db.report.findFirst({ where: { organizationId: organization.id }, orderBy: { isPinned: "desc" } }),
  ]);

  const notificationCount = (await createNotifications(
    rng,
    organization.id,
    people,
    {
      topRisk: topRisk ? { id: topRisk.id, title: topRisk.title } : undefined,
      topInsight: topInsight ? { id: topInsight.id, title: topInsight.title } : undefined,
      stalledDeal: stalledDeal ? { id: stalledDeal.id, name: stalledDeal.name, amount: Number(stalledDeal.amount) } : undefined,
      atRiskCustomer: atRiskCustomer ? { id: atRiskCustomer.id, name: atRiskCustomer.name } : undefined,
      automation: automationsWithHistory.find((automation) => automation.status === "ACTIVE"),
      report: primaryReport ? { id: primaryReport.id, name: primaryReport.name } : undefined,
    },
    now,
  )).length;

  const auditCount = await createAuditTrail(
    rng,
    organization.id,
    people,
    {
      wonDeal: wonDealRow
        ? {
            id: wonDealRow.id,
            code: wonDealRow.code,
            name: wonDealRow.name,
            amount: Number(wonDealRow.amount),
          }
        : undefined,
      stageDeal: stalledDeal ? { id: stalledDeal.id, code: stalledDeal.code, name: stalledDeal.name } : undefined,
      customer: atRiskCustomer ? { id: atRiskCustomer.id, name: atRiskCustomer.name } : undefined,
    },
    now,
  );

  await persistEngineMetrics(organization.id);
  await persistEngineMetrics(secondary.id);

  /* ────────────────────────────── summary ────────────────────────────── */
  const [
    customerCount,
    contactCount,
    opportunityCount,
    openOpportunityCount,
    riskCount,
    insightCount,
    ticketCountTotal,
    automationExecutionCount,
    auditTotal,
    notificationTotal,
    sessionCount,
  ] = await Promise.all([
    db.customer.count({ where: { organizationId: organization.id } }),
    db.contact.count({ where: { organizationId: organization.id } }),
    db.opportunity.count({ where: { organizationId: organization.id } }),
    db.opportunity.count({ where: { organizationId: organization.id, stage: { in: ["DISCOVERY", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "CONTRACT_SENT"] } } }),
    db.risk.count({ where: { organizationId: organization.id, status: { in: ["OPEN", "MITIGATING", "MONITORING"] } } }),
    db.insight.count({ where: { organizationId: organization.id, status: { in: ["DETECTED", "REVIEWING", "IN_PROGRESS"] } } }),
    db.supportTicket.count({ where: { organizationId: organization.id } }),
    db.automationExecution.count({ where: { organizationId: organization.id } }),
    db.auditLog.count({ where: { organizationId: organization.id } }),
    db.notification.count({ where: { organizationId: organization.id } }),
    db.membership.count({ where: { organizationId: organization.id, status: "ACTIVE" } }),
  ]);

  const snapshot = await computeRevenueSnapshot(organization.id, resolveWindow("12m"));

  console.log("  ─────────────────────────────────────────────────────────");
  console.log(`  Northwind Group      ${customerCount} customers · ${contactCount} contacts · ${opportunityCount} deals (${openOpportunityCount} open)`);
  console.log(`  Revenue (12m)        ${formatCurrency(snapshot.revenue)}  ·  prior ${formatCurrency(snapshot.revenuePrev)}  (${formatPercent((snapshot.revenue / Math.max(1, snapshot.revenuePrev) - 1) * 100, { decimals: 1, sign: true })})`);
  console.log(`  Pipeline             ${formatCurrency(snapshot.pipelineOpen)} open  ·  ${formatCurrency(snapshot.pipelineWeighted)} weighted`);
  console.log(`  Win rate             ${formatPercent(snapshot.winRate)}  ·  avg deal ${formatCurrency(snapshot.averageDealSize)}  ·  cycle ${Math.round(snapshot.salesCycleDays)}d`);
  console.log(`  Recurring            MRR ${formatCurrency(snapshot.mrr)}  ·  ARR ${formatCurrency(snapshot.arr)}  ·  NRR ${formatPercent(snapshot.nrr)}`);
  console.log(`  Efficiency           ${formatPercent(snapshot.operationalEfficiency)}  ·  stalled ${formatCurrency(snapshot.pipelineStalled)} across ${snapshot.pipelineStalledCount} deals`);
  console.log(`  Intelligence         ${insightCount} open opportunities · ${riskCount} open risks · brief published`);
  console.log(`  Operations           ${ticketCountTotal} tickets · ${automationExecutionCount} automation runs · ${notificationTotal} notifications · ${auditTotal} audit entries`);
  console.log(`  Beacon Logistics     ${secondaryCustomers.length} customers · ${secondaryDeals.deals.length} deals · ${secondaryRun.risks.detected} risks · ${secondaryIntegrations.length} integrations`);
  console.log("  ─────────────────────────────────────────────────────────");
  console.log(`  Sign in with         alex.morgan@nexus-demo.com  /  ${DEMO_PASSWORD}`);
  console.log(`  Other roles          sofia.marques@nexus-demo.com (admin) · daniel.okafor@nexus-demo.com (manager) · marco.rossi@nexus-demo.com (analyst) · priya.raman@nexus-demo.com (member)`);
  console.log(`  Sessions seeded      ${sessionCount} active memberships  ·  ${executions.count} automation executions  ·  ${formatNumber(auditCount)} audit events`);
  console.log(`  Seed version         ${SEED_VERSION}  ·  completed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`);
}

/** Persists the headline series the dashboards trend over. */
async function persistEngineMetrics(organizationId: string) {
  const snapshot = await computeRevenueSnapshot(organizationId, resolveWindow("90d"));
  const { persistMetric } = await import("@/server/engines/metrics");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const series: [string, number, string, Prisma.MetricCreateManyInput["granularity"]][] = [
    ["revenue_period", snapshot.revenue, "EUR", "DAY"],
    ["pipeline_open", snapshot.pipelineOpen, "EUR", "DAY"],
    ["pipeline_weighted", snapshot.pipelineWeighted, "EUR", "DAY"],
    ["win_rate", snapshot.winRate, "%", "DAY"],
    ["conversion_rate", snapshot.conversionRate, "%", "DAY"],
    ["mrr", snapshot.mrr, "EUR", "DAY"],
    ["arr", snapshot.arr, "EUR", "DAY"],
    ["operational_efficiency", snapshot.operationalEfficiency, "%", "DAY"],
    ["at_risk_customers", snapshot.atRiskCustomers, "count", "DAY"],
    ["pipeline_stalled", snapshot.pipelineStalled, "EUR", "DAY"],
  ];

  for (const [key, value, unit, granularity] of series) {
    await persistMetric({
      organizationId,
      key,
      value,
      unit,
      granularity,
      periodStart: today,
      source: "engine",
    });
  }
}

main()
  .then(async () => {
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("\n  Seed failed.");
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`  Prisma code: ${error.code}${error.meta ? ` · ${JSON.stringify(error.meta)}` : ""}`);
    }
    await db.$disconnect();
    process.exit(1);
  });
