import { z } from "zod";
import { ROLES } from "@/lib/rbac";

/* ── primitives ───────────────────────────────────────────────────────────── */

export const cuid = z.string().min(8).max(64);
export const idParam = cuid;
export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid work email");
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/\d/, "Include a number");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().max(40).optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(120).optional(),
});

export const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  range: z.enum(["7d", "30d", "90d", "qtd", "ytd", "12m", "custom"]).default("90d"),
});

export const stageEnum = z.enum([
  "DISCOVERY",
  "QUALIFICATION",
  "PROPOSAL",
  "NEGOTIATION",
  "CONTRACT_SENT",
  "WON",
  "LOST",
]);
export const segmentEnum = z.enum(["ENTERPRISE", "MID_MARKET", "SMB", "STARTUP"]);
export const customerStatusEnum = z.enum(["PROSPECT", "ONBOARDING", "ACTIVE", "AT_RISK", "CHURNED"]);
export const activityTypeEnum = z.enum([
  "CALL",
  "EMAIL",
  "MEETING",
  "DEMO",
  "TASK",
  "NOTE",
  "PROPOSAL_SENT",
  "QBR",
]);
export const riskCategoryEnum = z.enum([
  "REVENUE",
  "PIPELINE",
  "CUSTOMER",
  "OPERATIONAL",
  "COMPLIANCE",
  "FINANCIAL",
]);
export const severityEnum = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
export const priorityEnum = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
export const riskStatusEnum = z.enum(["OPEN", "MITIGATING", "MONITORING", "RESOLVED", "ACCEPTED"]);
export const insightStatusEnum = z.enum(["DETECTED", "REVIEWING", "IN_PROGRESS", "COMPLETED", "DISMISSED"]);
export const insightCategoryEnum = z.enum([
  "REVENUE_OPPORTUNITY",
  "COST_REDUCTION",
  "CUSTOMER_RETENTION",
  "SALES_ACCELERATION",
  "OPERATIONAL_EFFICIENCY",
  "RISK_PREVENTION",
]);
export const dealTypeEnum = z.enum(["NEW_BUSINESS", "EXPANSION", "RENEWAL"]);
export const dealSourceEnum = z.enum([
  "INBOUND",
  "OUTBOUND",
  "PARTNER",
  "REFERRAL",
  "PRODUCT_LED",
  "EVENT",
  "EXPANSION",
]);

const money = z.union([z.number(), z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Use a number")]);

/* ── auth ─────────────────────────────────────────────────────────────────── */

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(80),
  email: emailSchema,
  password: passwordSchema,
  companyName: z.string().trim().min(2, "Company name is required").max(120),
  companySize: z.string().max(40).optional(),
  industry: z.string().trim().max(80).optional(),
  jobTitle: z.string().max(80).optional(),
  inviteToken: z.string().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean().optional().default(true),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: z.string().min(10) });

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  industry: z.string().max(80).optional(),
  companySize: z.string().max(40).optional(),
  plan: z.enum(["STARTER", "GROWTH", "SCALE", "ENTERPRISE"]).default("GROWTH"),
  currency: z.string().length(3).default("EUR"),
  timezone: z.string().max(60).default("Europe/Lisbon"),
});

/* ── organization & team ──────────────────────────────────────────────────── */

export const organizationUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().max(160).optional().nullable(),
  domain: z.string().trim().max(120).optional().nullable(),
  industry: z.string().trim().max(80).optional().nullable(),
  companySize: z.string().trim().max(40).optional().nullable(),
  hqCountry: z.string().trim().length(2).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().max(60).optional(),
  locale: z.string().max(10).optional(),
  fiscalYearStart: z.coerce.number().int().min(1).max(12).optional(),
  aiEngineEnabled: z.boolean().optional(),
  churnRiskThreshold: z.coerce.number().int().min(10).max(95).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour")
    .optional()
    .nullable(),
});

export const teamSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  leadId: cuid.optional().nullable(),
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES).default("MEMBER"),
  title: z.string().trim().max(80).optional(),
  department: z.string().trim().max(80).optional(),
  teamId: cuid.optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(ROLES).optional(),
  title: z.string().trim().max(80).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  teamId: cuid.optional().nullable(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(2).max(80).optional(),
  password: passwordSchema.optional(),
});

/* ── customers & contacts ─────────────────────────────────────────────────── */

export const customerCreateSchema = z.object({
  name: z.string().trim().min(2, "Company name is required").max(120),
  domain: z.string().trim().max(120).optional().nullable(),
  website: z.string().trim().max(160).optional().nullable(),
  industry: z.string().trim().max(80).optional().nullable(),
  segment: segmentEnum.default("MID_MARKET"),
  region: z.string().trim().max(60).optional().nullable(),
  country: z.string().trim().max(60).optional().nullable(),
  city: z.string().trim().max(60).optional().nullable(),
  companySize: z.string().trim().max(40).optional().nullable(),
  employeeCount: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  status: customerStatusEnum.default("ACTIVE"),
  plan: z.string().trim().max(60).optional().nullable(),
  tier: z.enum(["STRATEGIC", "ENTERPRISE", "STANDARD", "LONG_TAIL"]).optional().nullable(),
  arr: money.optional(),
  mrr: money.optional(),
  ownerId: cuid.optional().nullable(),
  csmId: cuid.optional().nullable(),
  renewalDate: z.string().optional().nullable(),
  contractStart: z.string().optional().nullable(),
  acquisitionChannel: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  tags: z.array(z.string().trim().max(40)).max(12).optional(),
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const customerFilterSchema = paginationSchema.extend({
  status: customerStatusEnum.optional(),
  segment: segmentEnum.optional(),
  region: z.string().optional(),
  tier: z.string().optional(),
  health: z.enum(["healthy", "watch", "at_risk"]).optional(),
  ownerId: cuid.optional(),
  minArr: z.coerce.number().optional(),
});

export const ticketFilterSchema = paginationSchema.extend({
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: cuid.optional(),
  customerId: cuid.optional(),
  slaBreached: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  q: z.string().trim().min(1).max(80).optional(),
});

export const contactCreateSchema = z.object({
  customerId: cuid,
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: emailSchema.optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  mobile: z.string().trim().max(40).optional().nullable(),
  title: z.string().trim().max(80).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
  seniority: z.enum(["C_LEVEL", "VP", "DIRECTOR", "MANAGER", "IC"]).optional().nullable(),
  role: z.string().trim().max(80).optional().nullable(),
  linkedinUrl: z.string().trim().max(200).optional().nullable(),
  country: z.string().trim().max(60).optional().nullable(),
  language: z.string().trim().max(10).optional().nullable(),
  isPrimary: z.boolean().optional(),
  isDecisionMaker: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const contactUpdateSchema = contactCreateSchema.partial().omit({ customerId: true });

/* ── opportunities ────────────────────────────────────────────────────────── */

export const opportunityCreateSchema = z.object({
  customerId: cuid,
  name: z.string().trim().min(2, "Name the opportunity").max(140),
  stage: stageEnum.default("DISCOVERY"),
  type: dealTypeEnum.default("NEW_BUSINESS"),
  source: dealSourceEnum.default("INBOUND"),
  amount: money,
  currency: z.string().length(3).default("EUR"),
  probability: z.coerce.number().int().min(0).max(100).default(20),
  expectedCloseDate: z.string().min(4, "Pick an expected close date"),
  ownerId: cuid.optional().nullable(),
  nextStep: z.string().trim().max(200).optional().nullable(),
  nextStepDueAt: z.string().optional().nullable(),
  competitor: z.string().trim().max(80).optional().nullable(),
  productLine: z.string().trim().max(80).optional().nullable(),
  dealRegion: z.string().trim().max(60).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
  forecastCategory: z.enum(["COMMIT", "BEST_CASE", "PIPELINE", "OMITTED"]).optional().nullable(),
  lossReason: z.string().trim().max(160).optional().nullable(),
});

export const opportunityUpdateSchema = opportunityCreateSchema.partial().omit({ customerId: true });

export const opportunityFilterSchema = paginationSchema.extend({
  stage: z.union([stageEnum, z.literal("OPEN")]).optional(),
  type: dealTypeEnum.optional(),
  source: dealSourceEnum.optional(),
  ownerId: cuid.optional(),
  customerId: cuid.optional(),
  region: z.string().optional(),
  productLine: z.string().optional(),
  minAmount: z.coerce.number().optional(),
  inactiveDays: z.coerce.number().int().min(0).optional(),
  riskOnly: z.coerce.boolean().optional(),
});

export const stageChangeSchema = z.object({
  stage: stageEnum,
  probability: z.coerce.number().int().min(0).max(100).optional(),
  lossReason: z.string().trim().max(160).optional(),
  note: z.string().trim().max(500).optional(),
});

/* ── activities ───────────────────────────────────────────────────────────── */

export const activityCreateSchema = z.object({
  type: activityTypeEnum,
  subject: z.string().trim().min(2, "Add a subject").max(160),
  customerId: cuid.optional().nullable(),
  contactId: cuid.optional().nullable(),
  opportunityId: cuid.optional().nullable(),
  userId: cuid.optional().nullable(),
  direction: z.enum(["INBOUND", "OUTBOUND", "INTERNAL"]).default("OUTBOUND"),
  outcome: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "NO_RESPONSE"]).optional().nullable(),
  body: z.string().trim().max(4000).optional().nullable(),
  durationMinutes: z.coerce.number().int().min(0).max(1440).optional().nullable(),
  occurredAt: z.string().optional(),
  dueAt: z.string().optional().nullable(),
  channel: z.string().trim().max(40).optional().nullable(),
});

export const activityUpdateSchema = activityCreateSchema.partial();

export const activityFilterSchema = paginationSchema.extend({
  type: activityTypeEnum.optional(),
  customerId: cuid.optional(),
  opportunityId: cuid.optional(),
  userId: cuid.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  overdueOnly: z.coerce.boolean().optional(),
});

/* ── risks & insights ─────────────────────────────────────────────────────── */

export const riskCreateSchema = z.object({
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(4).max(2000),
  category: riskCategoryEnum,
  severity: severityEnum.default("MEDIUM"),
  probability: z.coerce.number().int().min(0).max(100).default(50),
  impact: money,
  mitigation: z.string().trim().max(2000).optional().nullable(),
  recommendation: z.string().trim().max(2000).optional().nullable(),
  ownerId: cuid.optional().nullable(),
  customerId: cuid.optional().nullable(),
  opportunityId: cuid.optional().nullable(),
  dueAt: z.string().optional().nullable(),
});

export const riskUpdateSchema = riskCreateSchema.partial().extend({
  status: riskStatusEnum.optional(),
});

export const riskFilterSchema = paginationSchema.extend({
  status: riskStatusEnum.optional(),
  category: riskCategoryEnum.optional(),
  severity: severityEnum.optional(),
  ownerId: cuid.optional(),
  customerId: cuid.optional(),
});

export const insightUpdateSchema = z.object({
  status: insightStatusEnum.optional(),
  priority: priorityEnum.optional(),
  ownerId: cuid.optional().nullable(),
  dueAt: z.string().optional().nullable(),
  reviewNotes: z.string().trim().max(2000).optional().nullable(),
});

export const insightFilterSchema = paginationSchema.extend({
  status: insightStatusEnum.optional(),
  category: insightCategoryEnum.optional(),
  priority: priorityEnum.optional(),
  ownerId: cuid.optional(),
});

export const runEngineSchema = z.object({
  engines: z.array(z.enum(["opportunity", "risk", "brief", "metrics"])).default(["opportunity", "risk", "brief"]),
});

/* ── automations ──────────────────────────────────────────────────────────── */

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "contains",
  "in",
  "not_in",
  "is_set",
  "is_empty",
  "older_than_days",
] as const;

export const conditionSchema = z.object({
  field: z.string().min(1).max(60),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
});

export const ACTION_TYPES = [
  "notify_user",
  "notify_role",
  "create_task",
  "update_stage",
  "assign_owner",
  "send_email",
  "slack_message",
  "webhook",
  "create_risk",
  "escalate",
] as const;

export const actionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  config: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  delayMinutes: z.coerce.number().int().min(0).max(20_160).optional(),
});

export const TRIGGER_TYPES = [
  "deal_inactive",
  "deal_stage_changed",
  "deal_created",
  "deal_won",
  "deal_lost",
  "customer_health_dropped",
  "customer_renewal_approaching",
  "ticket_sla_breached",
  "risk_detected",
  "opportunity_detected",
  "schedule_daily",
  "schedule_weekly",
  "activity_overdue",
] as const;

export const automationCreateSchema = z.object({
  name: z.string().trim().min(3, "Name the automation").max(120),
  description: z.string().trim().max(400).optional().nullable(),
  triggerType: z.enum(TRIGGER_TYPES),
  triggerConfig: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  conditions: z.array(conditionSchema).max(6).default([]),
  actions: z.array(actionSchema).min(1, "Add at least one action").max(6),
  tags: z.array(z.string().trim().max(30)).max(6).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]).default("DRAFT"),
});

export const automationUpdateSchema = automationCreateSchema.partial();

export const automationFilterSchema = paginationSchema.extend({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]).optional(),
});

export const automationExecutionFilterSchema = paginationSchema.extend({
  status: z.enum(["SUCCESS", "PARTIAL", "FAILED", "SKIPPED"]).optional(),
  automationId: cuid.optional(),
  matched: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  q: z.string().trim().min(1).max(80).optional(),
});

/* ── integrations, webhooks, api keys ─────────────────────────────────────── */

export const integrationConnectSchema = z.object({
  provider: z.string().min(2).max(40),
  enabled: z.boolean().default(true),
  config: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  credential: z.string().max(400).optional(),
  syncFrequency: z.enum(["realtime", "15min", "hourly", "6h", "daily", "manual"]).default("hourly"),
  syncDirection: z.enum(["inbound", "outbound", "bidirectional"]).default("inbound"),
});

export const integrationUpdateSchema = integrationConnectSchema.partial().omit({ provider: true });

export const webhookSchema = z.object({
  url: z.string().url("Enter a valid HTTPS endpoint").max(400),
  description: z.string().trim().max(200).optional().nullable(),
  events: z.array(z.string().min(2).max(60)).min(1, "Select at least one event"),
  active: z.boolean().default(true),
});

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(["read", "write", "admin"])).min(1).default(["read"]),
  expiresInDays: z.coerce.number().int().min(1).max(3650).optional(),
});

/* ── reports, notifications, jobs ─────────────────────────────────────────── */

export const reportCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).optional().nullable(),
  type: z.enum(["EXECUTIVE", "REVENUE", "PIPELINE", "CUSTOMER", "OPERATIONAL", "CUSTOM", "SAVED_VIEW"]).default("CUSTOM"),
  config: z
    .object({
      dataset: z.enum(["opportunities", "customers", "activities", "risks", "insights", "tickets"]),
      filters: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
      groupBy: z.string().max(40).optional(),
      metrics: z.array(z.string().max(40)).max(12).default([]),
      range: z.enum(["30d", "90d", "qtd", "ytd", "12m"]).default("90d"),
    })
    .partial()
    .passthrough(),
  schedule: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).default("NONE"),
  recipients: z.array(emailSchema).max(20).default([]),
  format: z.enum(["csv", "xlsx", "json"]).default("csv"),
  isShared: z.boolean().default(false),
  isPinned: z.boolean().default(false),
});

export const reportUpdateSchema = reportCreateSchema.partial();

export const notificationUpdateSchema = z.object({
  read: z.boolean().optional(),
  markAll: z.boolean().optional(),
});

export const billingPlanChangeSchema = z.object({
  plan: z.enum(["STARTER", "GROWTH", "SCALE", "ENTERPRISE"]),
  seats: z.coerce.number().int().min(1).max(5000).optional(),
  billingInterval: z.enum(["monthly", "annual"]).default("monthly"),
  couponCode: z.string().trim().max(40).optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  jobTitle: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  timezone: z.string().max(60).optional(),
  locale: z.string().max(10).optional(),
  themePreference: z.enum(["light", "dark", "system"]).optional(),
  avatarUrl: z.string().max(400).optional().nullable(),
});

export const bulkReassignSchema = z.object({
  opportunityIds: z.array(cuid).min(1).max(200),
  ownerId: cuid,
  reason: z.string().trim().max(200).optional(),
});

export const importCsvSchema = z.object({
  dataset: z.enum(["customers", "contacts", "opportunities", "activities"]),
  rows: z.array(z.record(z.string())).min(1).max(2000),
  dryRun: z.boolean().default(false),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>;
export type AutomationCreateInput = z.infer<typeof automationCreateSchema>;
export type ReportCreateInput = z.infer<typeof reportCreateSchema>;

/* ── audit & notifications ────────────────────────────────────────────────── */

export const auditFilterSchema = paginationSchema.extend({
  action: z.string().max(80).optional(),
  entityType: z.string().max(60).optional(),
  actorId: cuid.optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  source: z.enum(["WEB", "API", "AUTOMATION", "SYSTEM"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const notificationFilterSchema = z.object({
  filter: z.enum(["all", "unread", "archived"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const jobFilterSchema = paginationSchema.extend({
  status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]).optional(),
  type: z.string().max(40).optional(),
  name: z.string().max(80).optional(),
});

export const jobCreateSchema = z.object({
  name: z.string().trim().min(3).max(80),
  payload: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  /** When omitted the job runs as soon as a worker picks it up. */
  delaySeconds: z.coerce.number().int().min(0).max(86_400).optional(),
  maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
});

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
