-- Nexus OS — initial schema
-- Generated from prisma/schema.prisma by scripts/generate-migration.ts.
-- Do not edit by hand: run `npm run migrate:generate` instead.

-- Enum: OrgPlan
CREATE TYPE "OrgPlan" AS ENUM ('STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE');

-- Enum: SubscriptionStatus
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'PAUSED');

-- Enum: Role
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'ANALYST', 'MEMBER');

-- Enum: MembershipStatus
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

-- Enum: AuthTokenType
CREATE TYPE "AuthTokenType" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFICATION', 'INVITE', 'MFA_CHALLENGE');

-- Enum: CompanySegment
CREATE TYPE "CompanySegment" AS ENUM ('ENTERPRISE', 'MID_MARKET', 'SMB', 'STARTUP');

-- Enum: CustomerStatus
CREATE TYPE "CustomerStatus" AS ENUM ('PROSPECT', 'ONBOARDING', 'ACTIVE', 'AT_RISK', 'CHURNED');

-- Enum: HealthTrend
CREATE TYPE "HealthTrend" AS ENUM ('IMPROVING', 'STABLE', 'DECLINING');

-- Enum: DealStage
CREATE TYPE "DealStage" AS ENUM ('DISCOVERY', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CONTRACT_SENT', 'WON', 'LOST');

-- Enum: DealType
CREATE TYPE "DealType" AS ENUM ('NEW_BUSINESS', 'EXPANSION', 'RENEWAL');

-- Enum: DealSource
CREATE TYPE "DealSource" AS ENUM ('INBOUND', 'OUTBOUND', 'PARTNER', 'REFERRAL', 'PRODUCT_LED', 'EVENT', 'EXPANSION');

-- Enum: ActivityType
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'DEMO', 'TASK', 'NOTE', 'PROPOSAL_SENT', 'QBR');

-- Enum: ActivityDirection
CREATE TYPE "ActivityDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- Enum: ActivityOutcome
CREATE TYPE "ActivityOutcome" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'NO_RESPONSE');

-- Enum: RiskCategory
CREATE TYPE "RiskCategory" AS ENUM ('REVENUE', 'PIPELINE', 'CUSTOMER', 'OPERATIONAL', 'COMPLIANCE', 'FINANCIAL');

-- Enum: Severity
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- Enum: RiskStatus
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MITIGATING', 'MONITORING', 'RESOLVED', 'ACCEPTED');

-- Enum: InsightCategory
CREATE TYPE "InsightCategory" AS ENUM ('REVENUE_OPPORTUNITY', 'COST_REDUCTION', 'CUSTOMER_RETENTION', 'SALES_ACCELERATION', 'OPERATIONAL_EFFICIENCY', 'RISK_PREVENTION');

-- Enum: InsightStatus
CREATE TYPE "InsightStatus" AS ENUM ('DETECTED', 'REVIEWING', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED');

-- Enum: Priority
CREATE TYPE "Priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- Enum: AutomationStatus
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- Enum: ExecutionStatus
CREATE TYPE "ExecutionStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED');

-- Enum: IntegrationCategory
CREATE TYPE "IntegrationCategory" AS ENUM ('CRM', 'COMMUNICATION', 'FINANCE', 'PRODUCTIVITY', 'DATA', 'SUPPORT', 'MARKETING');

-- Enum: IntegrationStatus
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'PENDING', 'CONNECTED', 'ERROR');

-- Enum: TicketPriority
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- Enum: TicketStatus
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- Enum: NotificationType
CREATE TYPE "NotificationType" AS ENUM ('OPPORTUNITY_DETECTED', 'RISK_DETECTED', 'TASK_ASSIGNED', 'AUTOMATION_COMPLETED', 'INTEGRATION_ERROR', 'REPORT_GENERATED', 'BRIEF_PUBLISHED', 'DEAL_UPDATED', 'CUSTOMER_AT_RISK', 'SYSTEM');

-- Enum: AuditSeverity
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- Enum: AuditSource
CREATE TYPE "AuditSource" AS ENUM ('WEB', 'API', 'AUTOMATION', 'SYSTEM');

-- Enum: MetricGranularity
CREATE TYPE "MetricGranularity" AS ENUM ('DAY', 'WEEK', 'MONTH', 'QUARTER');

-- Enum: ReportType
CREATE TYPE "ReportType" AS ENUM ('EXECUTIVE', 'REVENUE', 'PIPELINE', 'CUSTOMER', 'OPERATIONAL', 'CUSTOM', 'SAVED_VIEW');

-- Enum: ReportSchedule
CREATE TYPE "ReportSchedule" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

-- Enum: InvoiceStatus
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- Enum: JobStatus
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- Enum: BriefStatus
CREATE TYPE "BriefStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- Table: Organization
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "domain" TEXT,
    "industry" TEXT,
    "hqCountry" TEXT DEFAULT 'PT',
    "companySize" TEXT,
    "plan" "OrgPlan" NOT NULL DEFAULT 'GROWTH',
    "dataRegion" TEXT NOT NULL DEFAULT 'eu-west-1',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Lisbon',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "locale" TEXT NOT NULL DEFAULT 'en-GB',
    "fiscalYearStart" INTEGER NOT NULL DEFAULT 1,
    "aiEngineEnabled" BOOLEAN NOT NULL DEFAULT true,
    "churnRiskThreshold" INTEGER NOT NULL DEFAULT 60,
    "primaryColor" TEXT DEFAULT '#4F46E5',
    "logoUrl" TEXT,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- Table: User
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "avatarUrl" TEXT,
    "jobTitle" TEXT,
    "phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Lisbon',
    "locale" TEXT NOT NULL DEFAULT 'en-GB',
    "themePreference" TEXT NOT NULL DEFAULT 'system',
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Table: Membership
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "department" TEXT,
    "costCenter" TEXT,
    "invitedById" TEXT,
    "invitedEmail" TEXT,
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- Table: Session
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "device" TEXT,
    "location" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- Table: AuthToken
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- Table: Team
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "department" TEXT,
    "color" TEXT DEFAULT '#6366F1',
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- Table: TeamMember
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- Table: Customer
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "domain" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "industry" TEXT,
    "segment" "CompanySegment" NOT NULL DEFAULT 'MID_MARKET',
    "region" TEXT,
    "country" TEXT,
    "city" TEXT,
    "companySize" TEXT,
    "employeeCount" INTEGER,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" TEXT,
    "tier" TEXT,
    "supportTier" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "arr" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mrr" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lifetimeValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expansionMrr" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "churnedMrr" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "healthScore" INTEGER NOT NULL DEFAULT 70,
    "healthTrend" "HealthTrend" NOT NULL DEFAULT 'STABLE',
    "churnProbability" INTEGER NOT NULL DEFAULT 10,
    "engagementScore" INTEGER NOT NULL DEFAULT 70,
    "supportScore" INTEGER NOT NULL DEFAULT 70,
    "usageScore" INTEGER NOT NULL DEFAULT 70,
    "revenueScore" INTEGER NOT NULL DEFAULT 70,
    "npsScore" INTEGER,
    "openTicketCount" INTEGER NOT NULL DEFAULT 0,
    "openDealCount" INTEGER NOT NULL DEFAULT 0,
    "activityCount" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "csmId" TEXT,
    "acquisitionChannel" TEXT,
    "contractStart" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "onboardedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "notes" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- Table: Contact
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "title" TEXT,
    "department" TEXT,
    "seniority" TEXT,
    "role" TEXT,
    "linkedinUrl" TEXT,
    "country" TEXT,
    "language" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "sentiment" TEXT,
    "engagementScore" INTEGER NOT NULL DEFAULT 60,
    "timezone" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- Table: Opportunity
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'DISCOVERY',
    "type" "DealType" NOT NULL DEFAULT 'NEW_BUSINESS',
    "source" "DealSource" NOT NULL DEFAULT 'INBOUND',
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "probability" INTEGER NOT NULL DEFAULT 20,
    "weightedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "aiScore" INTEGER,
    "expectedCloseDate" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daysInStage" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "activityCount" INTEGER NOT NULL DEFAULT 0,
    "nextStep" TEXT,
    "nextStepDueAt" TIMESTAMP(3),
    "competitor" TEXT,
    "lossReason" TEXT,
    "productLine" TEXT,
    "dealRegion" TEXT,
    "department" TEXT,
    "forecastCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- Table: Activity
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "userId" TEXT,
    "type" "ActivityType" NOT NULL,
    "direction" "ActivityDirection" NOT NULL DEFAULT 'OUTBOUND',
    "outcome" "ActivityOutcome",
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "durationMinutes" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- Table: SupportTicket
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "reference" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "channel" TEXT NOT NULL DEFAULT 'email',
    "firstResponseMinutes" INTEGER,
    "resolutionMinutes" INTEGER,
    "slaTargetMinutes" INTEGER NOT NULL DEFAULT 480,
    "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    "csatScore" INTEGER,
    "reopenedCount" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- Table: Insight
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" "InsightCategory" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "priorityScore" INTEGER NOT NULL DEFAULT 50,
    "confidence" INTEGER NOT NULL DEFAULT 70,
    "estimatedImpact" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impactUnit" TEXT NOT NULL DEFAULT 'EUR',
    "impactScope" TEXT NOT NULL DEFAULT 'ANNUAL',
    "source" TEXT NOT NULL,
    "signal" JSONB,
    "recommendation" TEXT,
    "actions" JSONB,
    "status" "InsightStatus" NOT NULL DEFAULT 'DETECTED',
    "ownerId" TEXT,
    "dueAt" TIMESTAMP(3),
    "entityType" TEXT,
    "entityId" TEXT,
    "relatedCount" INTEGER NOT NULL DEFAULT 0,
    "fingerprint" TEXT NOT NULL,
    "reviewNotes" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- Table: Risk
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "RiskCategory" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "probability" INTEGER NOT NULL DEFAULT 50,
    "impact" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "riskScore" INTEGER NOT NULL DEFAULT 50,
    "mitigation" TEXT,
    "recommendation" TEXT,
    "ownerId" TEXT,
    "customerId" TEXT,
    "opportunityId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "detectedBy" TEXT NOT NULL DEFAULT 'risk_engine',
    "fingerprint" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- Table: AiBrief
CREATE TABLE "AiBrief" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "whatChanged" JSONB NOT NULL,
    "whyItMatters" JSONB NOT NULL,
    "attention" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'nexus-deterministic-v1',
    "model" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 80,
    "status" "BriefStatus" NOT NULL DEFAULT 'PUBLISHED',
    "generatedById" TEXT,
    "generationMs" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "AiBrief_pkey" PRIMARY KEY ("id")
);

-- Table: Automation
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" TEXT NOT NULL,
    "triggerConfig" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "conditions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "actions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "timeSavedMinutes" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" "ExecutionStatus",
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- Table: AutomationExecution
CREATE TABLE "AutomationExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "steps" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "errorMessage" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "entityType" TEXT,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "triggeredBy" TEXT NOT NULL DEFAULT 'scheduler',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- Table: Integration
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "IntegrationCategory" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "credentialRef" TEXT,
    "secretPreview" TEXT,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "syncFrequency" TEXT NOT NULL DEFAULT 'hourly',
    "syncDirection" TEXT NOT NULL DEFAULT 'inbound',
    "lastSyncAt" TIMESTAMP(3),
    "nextSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- Table: Webhook
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "secret" TEXT NOT NULL,
    "events" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- Table: WebhookDelivery
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseCode" INTEGER,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- Table: ApiKey
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- Table: Metric
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "value" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'EUR',
    "granularity" "MetricGranularity" NOT NULL DEFAULT 'DAY',
    "dimensionKey" TEXT NOT NULL DEFAULT 'all',
    "dimension" JSONB,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'engine',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- Table: Report
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ReportType" NOT NULL DEFAULT 'CUSTOM',
    "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "schedule" "ReportSchedule" NOT NULL DEFAULT 'NONE',
    "recipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "format" TEXT NOT NULL DEFAULT 'csv',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "lastGeneratedAt" TIMESTAMP(3),
    "lastRunDurationMs" INTEGER,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- Table: UsageEvent
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- Table: Subscription
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" "OrgPlan" NOT NULL DEFAULT 'GROWTH',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "seats" INTEGER NOT NULL DEFAULT 10,
    "seatPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "mrr" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "billingInterval" TEXT NOT NULL DEFAULT 'monthly',
    "billingEmail" TEXT,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "taxId" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "canceledReason" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- Table: Invoice
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "seats" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "hostedUrl" TEXT,
    "lineItems" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- Table: AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "before" JSONB,
    "after" JSONB,
    "diff" JSONB,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    "source" "AuditSource" NOT NULL DEFAULT 'WEB',
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Table: Notification
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "entityType" TEXT,
    "entityId" TEXT,
    "actionUrl" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "readById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- Table: Job
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE UNIQUE INDEX "Team_organizationId_name_key" ON "Team"("organizationId", "name");
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
CREATE UNIQUE INDEX "Customer_organizationId_name_key" ON "Customer"("organizationId", "name");
CREATE UNIQUE INDEX "Opportunity_organizationId_code_key" ON "Opportunity"("organizationId", "code");
CREATE UNIQUE INDEX "SupportTicket_organizationId_reference_key" ON "SupportTicket"("organizationId", "reference");
CREATE UNIQUE INDEX "Insight_organizationId_fingerprint_key" ON "Insight"("organizationId", "fingerprint");
CREATE UNIQUE INDEX "Risk_organizationId_fingerprint_key" ON "Risk"("organizationId", "fingerprint");
CREATE UNIQUE INDEX "Automation_organizationId_name_key" ON "Automation"("organizationId", "name");
CREATE UNIQUE INDEX "Integration_organizationId_provider_key" ON "Integration"("organizationId", "provider");
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE UNIQUE INDEX "Metric_organizationId_key_granularity_dimensionKey_periodStart_key" ON "Metric"("organizationId", "key", "granularity", "dimensionKey", "periodStart");
CREATE UNIQUE INDEX "Report_organizationId_name_key" ON "Report"("organizationId", "name");
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");
CREATE UNIQUE INDEX "Invoice_organizationId_number_key" ON "Invoice"("organizationId", "number");

CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX "Membership_organizationId_status_idx" ON "Membership"("organizationId", "status");
CREATE INDEX "Membership_inviteTokenHash_idx" ON "Membership"("inviteTokenHash");
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");
CREATE INDEX "Team_organizationId_idx" ON "Team"("organizationId");
CREATE INDEX "TeamMember_organizationId_idx" ON "TeamMember"("organizationId");
CREATE INDEX "Customer_organizationId_status_idx" ON "Customer"("organizationId", "status");
CREATE INDEX "Customer_organizationId_healthScore_idx" ON "Customer"("organizationId", "healthScore");
CREATE INDEX "Customer_organizationId_segment_idx" ON "Customer"("organizationId", "segment");
CREATE INDEX "Customer_organizationId_renewalDate_idx" ON "Customer"("organizationId", "renewalDate");
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");
CREATE INDEX "Contact_organizationId_customerId_idx" ON "Contact"("organizationId", "customerId");
CREATE INDEX "Contact_organizationId_email_idx" ON "Contact"("organizationId", "email");
CREATE INDEX "Contact_deletedAt_idx" ON "Contact"("deletedAt");
CREATE INDEX "Opportunity_organizationId_stage_idx" ON "Opportunity"("organizationId", "stage");
CREATE INDEX "Opportunity_organizationId_customerId_idx" ON "Opportunity"("organizationId", "customerId");
CREATE INDEX "Opportunity_organizationId_ownerId_idx" ON "Opportunity"("organizationId", "ownerId");
CREATE INDEX "Opportunity_organizationId_expectedCloseDate_idx" ON "Opportunity"("organizationId", "expectedCloseDate");
CREATE INDEX "Opportunity_organizationId_lastActivityAt_idx" ON "Opportunity"("organizationId", "lastActivityAt");
CREATE INDEX "Opportunity_deletedAt_idx" ON "Opportunity"("deletedAt");
CREATE INDEX "Activity_organizationId_occurredAt_idx" ON "Activity"("organizationId", "occurredAt");
CREATE INDEX "Activity_organizationId_customerId_occurredAt_idx" ON "Activity"("organizationId", "customerId", "occurredAt");
CREATE INDEX "Activity_organizationId_userId_occurredAt_idx" ON "Activity"("organizationId", "userId", "occurredAt");
CREATE INDEX "Activity_organizationId_dueAt_idx" ON "Activity"("organizationId", "dueAt");
CREATE INDEX "Activity_deletedAt_idx" ON "Activity"("deletedAt");
CREATE INDEX "SupportTicket_organizationId_status_idx" ON "SupportTicket"("organizationId", "status");
CREATE INDEX "SupportTicket_organizationId_customerId_idx" ON "SupportTicket"("organizationId", "customerId");
CREATE INDEX "SupportTicket_organizationId_openedAt_idx" ON "SupportTicket"("organizationId", "openedAt");
CREATE INDEX "Insight_organizationId_status_priority_idx" ON "Insight"("organizationId", "status", "priority");
CREATE INDEX "Insight_organizationId_category_idx" ON "Insight"("organizationId", "category");
CREATE INDEX "Insight_organizationId_detectedAt_idx" ON "Insight"("organizationId", "detectedAt");
CREATE INDEX "Risk_organizationId_status_severity_idx" ON "Risk"("organizationId", "status", "severity");
CREATE INDEX "Risk_organizationId_category_idx" ON "Risk"("organizationId", "category");
CREATE INDEX "Risk_organizationId_detectedAt_idx" ON "Risk"("organizationId", "detectedAt");
CREATE INDEX "AiBrief_organizationId_generatedAt_idx" ON "AiBrief"("organizationId", "generatedAt");
CREATE INDEX "Automation_organizationId_status_idx" ON "Automation"("organizationId", "status");
CREATE INDEX "AutomationExecution_organizationId_startedAt_idx" ON "AutomationExecution"("organizationId", "startedAt");
CREATE INDEX "AutomationExecution_automationId_startedAt_idx" ON "AutomationExecution"("automationId", "startedAt");
CREATE INDEX "Integration_organizationId_status_idx" ON "Integration"("organizationId", "status");
CREATE INDEX "Webhook_organizationId_active_idx" ON "Webhook"("organizationId", "active");
CREATE INDEX "WebhookDelivery_organizationId_createdAt_idx" ON "WebhookDelivery"("organizationId", "createdAt");
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");
CREATE INDEX "ApiKey_organizationId_revokedAt_idx" ON "ApiKey"("organizationId", "revokedAt");
CREATE INDEX "Metric_organizationId_key_periodStart_idx" ON "Metric"("organizationId", "key", "periodStart");
CREATE INDEX "Report_organizationId_type_idx" ON "Report"("organizationId", "type");
CREATE INDEX "UsageEvent_organizationId_key_recordedAt_idx" ON "UsageEvent"("organizationId", "key", "recordedAt");
CREATE INDEX "Invoice_organizationId_status_idx" ON "Invoice"("organizationId", "status");
CREATE INDEX "Invoice_organizationId_customerId_idx" ON "Invoice"("organizationId", "customerId");
CREATE INDEX "Invoice_organizationId_dueAt_idx" ON "Invoice"("organizationId", "dueAt");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");
CREATE INDEX "AuditLog_organizationId_actorId_idx" ON "AuditLog"("organizationId", "actorId");
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");
CREATE INDEX "Notification_organizationId_userId_readAt_idx" ON "Notification"("organizationId", "userId", "readAt");
CREATE INDEX "Job_status_scheduledFor_idx" ON "Job"("status", "scheduledFor");
CREATE INDEX "Job_organizationId_name_idx" ON "Job"("organizationId", "name");

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_csmId_fkey" FOREIGN KEY ("csmId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiBrief" ADD CONSTRAINT "AiBrief_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
