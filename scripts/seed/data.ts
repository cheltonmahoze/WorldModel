import { randomUUID } from "node:crypto";

/**
 * Deterministic demo data pools + RNG.
 *
 * The whole demo tenant is generated from a single seed, so every environment
 * shows the same company, the same cohort of at-risk accounts and the same
 * pipeline — screenshots, tests and demos stay comparable over time.
 */

export function createRng(seed = 20_260_922) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    float: next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    some: <T>(items: readonly T[], count: number): T[] => {
      const pool = [...items];
      const picked: T[] = [];
      for (let index = 0; index < count && pool.length; index++) {
        picked.push(...pool.splice(Math.floor(next() * pool.length), 1));
      }
      return picked;
    },
    bool: (probability = 0.5) => next() < probability,
    /** Normal-ish distribution using the sum of three uniforms. */
    normal: (mean: number, spread: number) => mean + ((next() + next() + next()) / 3 - 0.5) * 2 * spread,
    weighted: <T>(entries: readonly [T, number][]): T => {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1]![0];
    },
    money: (min: number, max: number, step = 500) =>
      Math.round((min + next() * (max - min)) / step) * step,
  };
}

export type Rng = ReturnType<typeof createRng>;

const DAY = 86_400_000;

export const daysAgo = (days: number, from: Date = new Date()) => new Date(from.getTime() - days * DAY);
export const daysAhead = (days: number, from: Date = new Date()) => new Date(from.getTime() + days * DAY);
export const hoursAgo = (hours: number, from: Date = new Date()) => new Date(from.getTime() - hours * 3_600_000);

/** cuid-shaped identifier so seeded rows can reference each other before insert. */
let counter = 0;
export function id(prefix = "c") {
  counter += 1;
  const time = Date.now().toString(36);
  const entropy = randomUUID().replace(/-/g, "").slice(0, 14);
  return `${prefix}${time}${counter.toString(36)}${entropy}`;
}

export const COMPANY_NAMES = [
  "Aurora Dynamics", "Helvetia Logistik", "Brightwave Media", "Cortex Analytics", "Danube Steel Works",
  "Elbe Robotics", "Fjordline Shipping", "Glenmore Capital", "Hanseatic Foods", "Iberia Solar",
  "Jutland Pharma", "Kestrel Aerospace", "Lombard Retail Group", "Meridian Health Systems", "Nordkap Energy",
  "Orion Manufacturing", "Pillar Fintech", "Quercus Timber", "Rheinwerk Chemicals", "Solstice Travel",
  "Tatra Mining", "Umbra Security", "Vantage Insurance", "Westwind Utilities", "Zenith Telecom",
  "Atlas Freight", "Borealis Laboratories", "Cendres Textiles", "Drakkar Marine", "Ember Foods",
  "Fenwick Legal", "Granite Construction", "Hopper Analytics", "Ironclad Systems", "Jasper Mobility",
  "Kronos Payments", "Lumen Bio", "Marble Insurance", "Nimbus Cloud", "Onyx Retail",
  "Pinna Acoustics", "Quantum Retail", "Ravel Robotics", "Sable Fashion", "Tessera Semiconductor",
  "Verdant Agritech", "Willow Fintech", "Xenon Diagnostics", "Yarrow Logistics", "Zephyr Aviation",
  "Alpine Instruments", "Baltic Foods", "Copenhagen Rail", "Duna Water", "Estonia Digital",
] as const;

export const CITIES: { city: string; country: string; region: string }[] = [
  { city: "Lisbon", country: "Portugal", region: "Southern Europe" },
  { city: "Porto", country: "Portugal", region: "Southern Europe" },
  { city: "Madrid", country: "Spain", region: "Southern Europe" },
  { city: "Barcelona", country: "Spain", region: "Southern Europe" },
  { city: "Milan", country: "Italy", region: "Southern Europe" },
  { city: "Paris", country: "France", region: "Western Europe" },
  { city: "Lyon", country: "France", region: "Western Europe" },
  { city: "Amsterdam", country: "Netherlands", region: "Western Europe" },
  { city: "Rotterdam", country: "Netherlands", region: "Western Europe" },
  { city: "Brussels", country: "Belgium", region: "Western Europe" },
  { city: "London", country: "United Kingdom", region: "UK & Ireland" },
  { city: "Manchester", country: "United Kingdom", region: "UK & Ireland" },
  { city: "Dublin", country: "Ireland", region: "UK & Ireland" },
  { city: "Berlin", country: "Germany", region: "DACH" },
  { city: "Munich", country: "Germany", region: "DACH" },
  { city: "Hamburg", country: "Germany", region: "DACH" },
  { city: "Zurich", country: "Switzerland", region: "DACH" },
  { city: "Vienna", country: "Austria", region: "DACH" },
  { city: "Stockholm", country: "Sweden", region: "Nordics" },
  { city: "Copenhagen", country: "Denmark", region: "Nordics" },
  { city: "Oslo", country: "Norway", region: "Nordics" },
  { city: "Helsinki", country: "Finland", region: "Nordics" },
  { city: "Warsaw", country: "Poland", region: "Central Europe" },
  { city: "Prague", country: "Czechia", region: "Central Europe" },
] as const;

export const INDUSTRIES = [
  "Manufacturing", "Logistics & Transport", "Financial Services", "Healthcare", "Energy & Utilities",
  "Retail & E-commerce", "Telecommunications", "Professional Services", "Technology", "Construction",
] as const;

export const CUSTOMER_PLANS = ["Platform", "Platform + Analytics", "Platform + Automation", "Enterprise Suite"] as const;
export const TIERS = ["Starter", "Growth", "Scale", "Enterprise"] as const;
export const SUPPORT_TIERS = ["Standard", "Priority", "Premium", "Dedicated"] as const;
export const CHANNELS = ["Inbound", "Outbound", "Partner", "Referral", "Event", "Product-led"] as const;
export const PRODUCT_LINES = ["Core Platform", "Analytics", "Automation Suite", "Integrations Hub", "Professional Services"] as const;
export const DEPARTMENTS = ["Revenue", "Customer Success", "Operations", "Finance", "Product"] as const;

export const FIRST_NAMES = [
  "Alex", "Sofia", "Daniel", "Elena", "Marco", "Priya", "Tomás", "Hannah", "Lucas", "Yuki",
  "Nadia", "Jonas", "Ines", "Rafael", "Clara", "Mateo", "Anouk", "Freja", "Mateo", "Katrin",
  "Oliver", "Beatrice", "Nils", "Amara", "Felix", "Martina", "Anders", "Camille", "Ravi", "Sanne",
] as const;

export const LAST_NAMES = [
  "Morgan", "Marques", "Okafor", "Petrova", "Rossi", "Raman", "Silva", "Weber", "Bernard", "Tanaka",
  "Haddad", "Berg", "Ferreira", "Costa", "Novak", "Lindqvist", "Keller", "Dubois", "Bianchi", "Larsen",
  "Moreau", "Schneider", "Jensen", "Kowalski", "Vargas", "Holm", "Møller", "Grant", "Fischer", "Andersen",
] as const;

export const JOB_TITLES = [
  "Chief Technology Officer", "VP Engineering", "Head of Operations", "Chief Financial Officer",
  "Procurement Director", "Head of Digital", "Operations Manager", "IT Director",
  "Head of Customer Experience", "Managing Director", "Head of Data", "Facilities Director",
] as const;

export const LEADERSHIP_TITLES = [
  "Chief Executive Officer", "Chief Operating Officer", "Chief Revenue Officer", "Chief Financial Officer",
  "VP Sales", "Head of Revenue Operations",
] as const;

export const CONTACT_SENIORITY = ["C-Level", "VP", "Director", "Manager", "Individual Contributor"] as const;
export const CONTACT_DEPARTMENTS = ["Executive", "Operations", "Finance", "IT", "Procurement", "Marketing", "Customer Service"] as const;

export const ACTIVITY_SUBJECTS: Record<string, string[]> = {
  CALL: ["Discovery call", "Follow-up call", "Pricing discussion", "Quarterly check-in", "Renewal call", "Escalation call"],
  EMAIL: ["Proposal follow-up", "Intro email", "Contract redlines", "Onboarding checklist", "Invoice reminder", "Meeting recap"],
  MEETING: ["Executive briefing", "Technical deep-dive", "Roadmap review", "Commercial negotiation", "Steering committee"],
  DEMO: ["Product demo — Analytics", "Product demo — Automations", "Solution walkthrough", "Platform demo"],
  TASK: ["Prepare mutual action plan", "Send security questionnaire", "Update forecast", "Draft SOW", "Collect references"],
  NOTE: ["Call notes", "Account research", "Champion feedback", "Competitive intel", "Renewal risk notes"],
  PROPOSAL_SENT: ["Proposal sent — Core Platform", "Proposal sent — Analytics add-on", "Revised proposal sent"],
  QBR: ["QBR — usage review", "QBR — value delivered", "QBR — roadmap alignment", "QBR — renewal preparation"],
};

export const TICKET_SUBJECTS = [
  "API authentication failing intermittently", "Dashboard data lag beyond 2 hours", "SSO configuration not applying",
  "Bulk import rejects valid rows", "Automation not triggering on webhook", "Report export times out",
  "Invoice mapping incorrect for multi-entity", "Webhook retries flooding endpoint", "Permissions regression for analysts",
  "Mobile session drops after 15 minutes", "Custom metric returns null values", "Integration sync stuck in progress",
  "Contact merge duplicated records", "Rate limit hit during nightly sync", "Audit log missing actor field",
  "CSV import mangles accented characters", "Two-factor reset loop", "Forecast chart mislabels quarter",
  "Slack notification sent to wrong channel", "Deal stage rules not applied on import",
] as const;

export { INTEGRATION_CATALOGUE as INTEGRATION_CATALOG } from "@/lib/integrations";

export const WEBHOOK_EVENTS = [
  "opportunity.created", "opportunity.stage_changed", "risk.detected", "insight.detected",
  "customer.health_changed", "automation.completed", "invoice.overdue", "report.generated",
] as const;

export const AUTOMATION_TEMPLATES = [
  {
    name: "Stalled deal escalation",
    description:
      "When a deal above €10K has had no activity for 7 days, alert the manager, create a follow-up task and post to Slack.",
    triggerType: "deal_inactive",
    triggerConfig: { days: 7 },
    conditions: [
      { field: "amount", operator: "greater_than", value: 10000 },
      { field: "stage", operator: "in", value: ["QUALIFICATION", "PROPOSAL", "NEGOTIATION"] },
    ],
    actions: [
      { type: "notify_role", config: { role: "MANAGER", title: "Deal going quiet", body: "{{name}} ({{customerName}}) has had no activity and sits in {{stage}}.", severity: "HIGH", actionUrl: "/opportunities" } },
      { type: "create_task", config: { subject: "Re-engage {{customerName}} on {{name}}", body: "Auto-created because the deal was idle.", dueInDays: 2, assigneeRole: "MANAGER" } },
      { type: "slack_message", config: { text: "⚠️ {{name}} idle — {{amount}} at {{stage}}" } },
    ],
    tags: ["pipeline", "escalation"],
  },
  {
    name: "Renewal playbook — 60 days out",
    description:
      "60 days before renewal, book the QBR, notify the CSM and queue the renewal brief.",
    triggerType: "customer_renewal_approaching",
    triggerConfig: { days: 60 },
    conditions: [{ field: "daysToRenewal", operator: "less_than", value: 61 }],
    actions: [
      { type: "create_task", config: { subject: "Schedule QBR for {{name}}", dueInDays: 5, assigneeRole: "MANAGER" } },
      { type: "notify_role", config: { role: "MANAGER", title: "Renewal approaching", body: "{{name}} renews in {{daysToRenewal}} days · ARR {{arr}}.", severity: "MEDIUM", actionUrl: "/customers" } },
      { type: "send_email", config: { subject: "Renewal brief: {{name}}", body: "ARR {{arr}}, health {{healthScore}}. Review before the QBR." } },
    ],
    tags: ["retention", "renewal"],
  },
  {
    name: "Churn-risk intervention",
    description:
      "When health drops, escalate to the CS lead, log a risk and start a save play on accounts above €25K ARR.",
    triggerType: "customer_health_dropped",
    triggerConfig: { threshold: 55 },
    conditions: [{ field: "arr", operator: "greater_than", value: 25000 }],
    actions: [
      { type: "escalate", config: { title: "Health drop: {{name}}", body: "Health is {{healthScore}} on {{arr}} ARR — initiate the save play." } },
      { type: "create_risk", config: { title: "Churn exposure — {{name}}", description: "Raised by the churn-risk intervention playbook.", category: "CUSTOMER", severity: "HIGH", probability: 65, recommendation: "Executive sponsor call within five working days." } },
      { type: "create_task", config: { subject: "Executive check-in with {{name}}", dueInDays: 3, assigneeRole: "MANAGER" } },
    ],
    tags: ["retention"],
  },
  {
    name: "SLA breach follow-up",
    description: "When a high-priority ticket breaches SLA, raise a post-mortem task and tell the support lead.",
    triggerType: "ticket_sla_breached",
    triggerConfig: {},
    conditions: [{ field: "priority", operator: "in", value: ["HIGH", "URGENT"] }],
    actions: [
      { type: "create_task", config: { subject: "Post-mortem for {{reference}}", body: "SLA breached on a {{priority}} ticket.", dueInDays: 2, assigneeRole: "MANAGER" } },
      { type: "notify_role", config: { role: "MANAGER", title: "SLA breached", body: "{{reference}} — {{subject}}", severity: "HIGH", actionUrl: "/operations" } },
    ],
    tags: ["support"],
  },
  {
    name: "Overdue task sweep",
    description: "Tasks more than three days overdue get a nudge and, if unowned, are assigned to the team lead.",
    triggerType: "activity_overdue",
    triggerConfig: { days: 3 },
    conditions: [{ field: "daysOverdue", operator: "greater_than", value: 3 }],
    actions: [
      { type: "create_task", config: { subject: "Chase overdue task: {{subject}}", dueInDays: 1, assigneeRole: "MANAGER" } },
      { type: "escalate", config: { title: "Overdue task needs attention", body: "{{subject}} is {{daysOverdue}} days overdue." } },
    ],
    tags: ["operations", "hygiene"],
  },
  {
    name: "New customer onboarding",
    description: "On deal won, provision the kickoff task, notify the onboarding owner and fire the webhook.",
    triggerType: "deal_won",
    triggerConfig: {},
    conditions: [{ field: "amount", operator: "greater_than", value: 5000 }],
    actions: [
      { type: "create_task", config: { subject: "Kickoff for {{customerName}}", body: "Won deal {{name}} ({{amount}}).", dueInDays: 3, assigneeRole: "MANAGER" } },
      { type: "notify_role", config: { role: "ADMIN", title: "New customer won", body: "{{customerName}} closed at {{amount}}.", severity: "MEDIUM", actionUrl: "/customers" } },
      { type: "escalate", config: { title: "Onboarding booked: {{customerName}}", body: "Revenue {{amount}} — CS to confirm kickoff within 3 days." } },
    ],
    tags: ["onboarding"],
  },
  {
    name: "Weekly pipeline hygiene",
    description: "Every Monday, flag deals without a next step and remind managers to clean the forecast.",
    triggerType: "schedule_weekly",
    triggerConfig: { dayOfWeek: 1, hour: 7 },
    conditions: [{ field: "ranAt", operator: "is_set" }],
    actions: [
      { type: "create_task", config: { subject: "Review deals with no next step", dueInDays: 1, assigneeRole: "MANAGER" } },
      { type: "notify_role", config: { role: "MANAGER", title: "Pipeline hygiene run complete", body: "Deals without a confirmed next step need attention.", severity: "LOW" } },
    ],
    tags: ["operations", "hygiene"],
  },
  {
    name: "High-intent opportunity follow-up",
    description: "When the engine surfaces a large opportunity, assign the top-converting rep and create the follow-up.",
    triggerType: "opportunity_detected",
    triggerConfig: {},
    conditions: [{ field: "impact", operator: "greater_than", value: 50000 }],
    actions: [
      { type: "assign_owner", config: { strategy: "top_converter" } },
      { type: "create_task", config: { subject: "Act on detected opportunity", body: "{{title}}", dueInDays: 1, assigneeRole: "MANAGER" } },
    ],
    tags: ["demand-gen"],
  },
  {
    name: "Expansion review on risk signals",
    description: "When the risk engine raises a critical account issue, brief the owner before the next customer call.",
    triggerType: "risk_detected",
    triggerConfig: {},
    conditions: [{ field: "severity", operator: "in", value: ["CRITICAL", "HIGH"] }],
    actions: [
      { type: "notify_role", config: { role: "MANAGER", title: "Critical risk detected", body: "{{title}}", severity: "HIGH", actionUrl: "/risks" } },
      { type: "create_task", config: { subject: "Prepare mitigation for: {{title}}", dueInDays: 2, assigneeRole: "MANAGER" } },
    ],
    tags: ["growth", "risk"],
  },
  {
    name: "Quarter-end forecast lock",
    description: "On the last day of each month, remind leadership to freeze the forecast and export the board pack.",
    triggerType: "schedule_daily",
    triggerConfig: { lastBusinessDayOfMonth: true },
    conditions: [{ field: "ranAt", operator: "is_set" }],
    actions: [
      { type: "notify_role", config: { role: "OWNER", title: "Forecast review due", body: "Export the board pack and freeze forecast categories.", severity: "LOW", actionUrl: "/analytics" } },
      { type: "create_task", config: { subject: "Export board pack", dueInDays: 1, assigneeRole: "ADMIN" } },
    ],
    tags: ["reporting"],
  },
] as const;

export const REPORT_BLUEPRINTS = [
  { name: "Board pack", type: "EXECUTIVE" as const, schedule: "MONTHLY" as const, description: "ARR, NRR, pipeline coverage and risk posture for the board." },
  { name: "Revenue by segment", type: "REVENUE" as const, schedule: "WEEKLY" as const, description: "Closed-won, expansion and churn split by company segment." },
  { name: "Pipeline coverage", type: "PIPELINE" as const, schedule: "WEEKLY" as const, description: "Weighted pipeline versus quarterly target with stage ageing." },
  { name: "Customer health review", type: "CUSTOMER" as const, schedule: "WEEKLY" as const, description: "Accounts below the health threshold with owner and renewal date." },
  { name: "Operations scorecard", type: "OPERATIONAL" as const, schedule: "DAILY" as const, description: "SLA performance, automation coverage and task throughput." },
  { name: "Overdue receivables", type: "REVENUE" as const, schedule: "DAILY" as const, description: "Unpaid invoices past due with days overdue and owner." },
  { name: "Forecast accuracy", type: "PIPELINE" as const, schedule: "MONTHLY" as const, description: "Committed versus actual per quarter per owner." },
  { name: "Churn post-mortem", type: "CUSTOMER" as const, schedule: "NONE" as const, description: "Reason codes for churned accounts and saved accounts." },
  { name: "Team productivity", type: "OPERATIONAL" as const, schedule: "WEEKLY" as const, description: "Activities, meetings and cycle time per rep." },
] as const;

export const AUTOMATION_EXECUTION_ERRORS = [
  "Slack channel #revenue-alerts not found",
  "CRM rate limit reached (429) — will retry",
  "Webhook endpoint returned 502",
  "SMTP relay rejected recipient",
] as const;
