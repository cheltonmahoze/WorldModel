import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { toCsv } from "@/lib/utils";
import { computeRevenueSnapshot, resolveWindow } from "@/server/engines/metrics";

export type ReportDataset = "opportunities" | "customers" | "activities" | "risks" | "insights" | "tickets" | "audit";

export type ReportResult = {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
  generatedAt: string;
  summary: { label: string; value: number; unit?: string }[];
};

const EXPORT_DATASETS = ["pipeline", "revenue", "customers", "risks", "insights", "activities", "tickets", "audit"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

const DATASET_COLUMNS: Record<ReportDataset, { key: string; label: string }[]> = {
  opportunities: [
    { key: "code", label: "Code" },
    { key: "name", label: "Opportunity" },
    { key: "customer", label: "Customer" },
    { key: "stage", label: "Stage" },
    { key: "amount", label: "Amount" },
    { key: "probability", label: "Probability" },
    { key: "owner", label: "Owner" },
    { key: "expectedCloseDate", label: "Expected close" },
    { key: "lastActivityAt", label: "Last activity" },
    { key: "daysInStage", label: "Days in stage" },
  ],
  customers: [
    { key: "name", label: "Customer" },
    { key: "segment", label: "Segment" },
    { key: "region", label: "Region" },
    { key: "status", label: "Status" },
    { key: "arr", label: "ARR" },
    { key: "healthScore", label: "Health" },
    { key: "churnProbability", label: "Churn probability" },
    { key: "renewalDate", label: "Renewal" },
    { key: "owner", label: "Owner" },
    { key: "csm", label: "CSM" },
  ],
  activities: [
    { key: "occurredAt", label: "Date" },
    { key: "type", label: "Type" },
    { key: "subject", label: "Subject" },
    { key: "customer", label: "Customer" },
    { key: "opportunity", label: "Opportunity" },
    { key: "user", label: "Owner" },
    { key: "outcome", label: "Outcome" },
    { key: "durationMinutes", label: "Minutes" },
  ],
  risks: [
    { key: "title", label: "Risk" },
    { key: "category", label: "Category" },
    { key: "severity", label: "Severity" },
    { key: "status", label: "Status" },
    { key: "probability", label: "Probability" },
    { key: "impact", label: "Impact" },
    { key: "riskScore", label: "Score" },
    { key: "owner", label: "Owner" },
    { key: "detectedAt", label: "Detected" },
  ],
  insights: [
    { key: "title", label: "Opportunity" },
    { key: "category", label: "Category" },
    { key: "priority", label: "Priority" },
    { key: "status", label: "Status" },
    { key: "estimatedImpact", label: "Estimated impact" },
    { key: "confidence", label: "Confidence" },
    { key: "owner", label: "Owner" },
    { key: "detectedAt", label: "Detected" },
  ],
  tickets: [
    { key: "reference", label: "Reference" },
    { key: "subject", label: "Subject" },
    { key: "customer", label: "Customer" },
    { key: "priority", label: "Priority" },
    { key: "status", label: "Status" },
    { key: "slaBreached", label: "SLA breached" },
    { key: "resolutionMinutes", label: "Resolution (min)" },
    { key: "openedAt", label: "Opened" },
  ],
  audit: [
    { key: "createdAt", label: "Timestamp" },
    { key: "actorName", label: "Actor" },
    { key: "actorRole", label: "Role" },
    { key: "action", label: "Action" },
    { key: "entityType", label: "Entity type" },
    { key: "entityLabel", label: "Entity" },
    { key: "severity", label: "Severity" },
    { key: "source", label: "Source" },
    { key: "ip", label: "IP" },
    { key: "changes", label: "Changed fields" },
  ],
};

function iso(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Runs a saved report definition against live data. */
export async function runReport(organizationId: string, reportId: string): Promise<ReportResult> {
  const report = await db.report.findFirst({ where: { id: reportId, organizationId, deletedAt: null } });
  if (!report) throw AppError.notFound("Report");

  const config = (report.config ?? {}) as {
    dataset?: ReportDataset;
    range?: "30d" | "90d" | "qtd" | "ytd" | "12m";
    filters?: Record<string, string | number | boolean>;
    groupBy?: string;
    metrics?: string[];
  };

  const dataset: ReportDataset = config.dataset ?? defaultDataset(report.type);
  const range = config.range ?? "90d";
  const window = resolveWindow(range);
  const filters = config.filters ?? {};

  const rows = await loadRows(organizationId, dataset, window, filters);
  const columns = DATASET_COLUMNS[dataset];
  const truncated = rows.slice(0, 500);

  await db.report.update({
    where: { id: report.id },
    data: { runCount: { increment: 1 }, lastGeneratedAt: new Date(), lastRunDurationMs: 0 },
  });

  return {
    columns,
    rows: truncated,
    generatedAt: new Date().toISOString(),
    summary: buildSummary(dataset, truncated),
  };
}

export async function exportReport(
  organizationId: string,
  dataset: ExportDataset,
  range: { from?: Date; to?: Date },
): Promise<{ rows: Record<string, string | number | null>[]; columns: { key: string; label: string }[]; filename: string; csv: string }> {
  const window = resolveWindow("12m");
  const window2 = { from: range.from ?? window.from, to: range.to ?? window.to };
  const resolved: ReportDataset = dataset === "pipeline" || dataset === "revenue" ? "opportunities" : dataset;
  const rows = await loadRows(organizationId, resolved, window2, dataset === "revenue" ? { stage: "WON" } : {});
  const columns = DATASET_COLUMNS[resolved];
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    rows,
    columns,
    filename: `nexus-${dataset}-${stamp}.csv`,
    csv: toCsv(rows, columns.map((column) => column.key)),
  };
}

function defaultDataset(type: string): ReportDataset {
  switch (type) {
    case "PIPELINE":
      return "opportunities";
    case "CUSTOMER":
      return "customers";
    case "OPERATIONAL":
      return "activities";
    default:
      return "opportunities";
  }
}

async function loadRows(
  organizationId: string,
  dataset: ReportDataset,
  window: { from: Date; to: Date },
  filters: Record<string, string | number | boolean>,
): Promise<Record<string, string | number | null>[]> {
  const ownerId = typeof filters.ownerId === "string" ? filters.ownerId : undefined;
  const region = typeof filters.region === "string" ? filters.region : undefined;
  const segment = typeof filters.segment === "string" ? filters.segment : undefined;

  switch (dataset) {
    case "opportunities": {
      const deals = await db.opportunity.findMany({
        where: {
          organizationId,
          deletedAt: null,
          ...(ownerId ? { ownerId } : {}),
          ...(region ? { dealRegion: region } : {}),
          ...(segment ? { customer: { segment: segment as never } } : {}),
          ...(typeof filters.stage === "string" ? { stage: filters.stage as never } : {}),
        },
        orderBy: { amount: "desc" },
        take: 500,
        include: { customer: { select: { name: true } }, owner: { select: { name: true } } },
      });
      return deals.map((deal) => ({
        code: deal.code,
        name: deal.name,
        customer: deal.customer.name,
        stage: deal.stage,
        amount: Number(deal.amount),
        probability: deal.probability,
        owner: deal.owner?.name ?? null,
        expectedCloseDate: iso(deal.expectedCloseDate),
        lastActivityAt: iso(deal.lastActivityAt),
        daysInStage: deal.daysInStage,
      }));
    }
    case "customers": {
      const customers = await db.customer.findMany({
        where: {
          organizationId,
          deletedAt: null,
          ...(ownerId ? { ownerId } : {}),
          ...(region ? { region } : {}),
          ...(segment ? { segment: segment as never } : {}),
        },
        orderBy: { arr: "desc" },
        take: 500,
        include: { owner: { select: { name: true } }, csm: { select: { name: true } } },
      });
      return customers.map((customer) => ({
        name: customer.name,
        segment: customer.segment,
        region: customer.region,
        status: customer.status,
        arr: Number(customer.arr),
        healthScore: customer.healthScore,
        churnProbability: customer.churnProbability,
        renewalDate: iso(customer.renewalDate),
        owner: customer.owner?.name ?? null,
        csm: customer.csm?.name ?? null,
      }));
    }
    case "activities": {
      const activities = await db.activity.findMany({
        where: { organizationId, deletedAt: null, occurredAt: { gte: window.from, lte: window.to }, ...(ownerId ? { userId: ownerId } : {}) },
        orderBy: { occurredAt: "desc" },
        take: 500,
        include: { customer: { select: { name: true } }, opportunity: { select: { name: true } }, user: { select: { name: true } } },
      });
      return activities.map((activity) => ({
        occurredAt: iso(activity.occurredAt),
        type: activity.type,
        subject: activity.subject,
        customer: activity.customer?.name ?? null,
        opportunity: activity.opportunity?.name ?? null,
        user: activity.user?.name ?? null,
        outcome: activity.outcome,
        durationMinutes: activity.durationMinutes,
      }));
    }
    case "risks": {
      const risks = await db.risk.findMany({
        where: { organizationId, deletedAt: null, ...(ownerId ? { ownerId } : {}) },
        orderBy: { riskScore: "desc" },
        take: 500,
        include: { owner: { select: { name: true } } },
      });
      return risks.map((risk) => ({
        title: risk.title,
        category: risk.category,
        severity: risk.severity,
        status: risk.status,
        probability: risk.probability,
        impact: Number(risk.impact),
        riskScore: risk.riskScore,
        owner: risk.owner?.name ?? null,
        detectedAt: iso(risk.detectedAt),
      }));
    }
    case "insights": {
      const insights = await db.insight.findMany({
        where: { organizationId, deletedAt: null, ...(ownerId ? { ownerId } : {}) },
        orderBy: { priorityScore: "desc" },
        take: 500,
        include: { owner: { select: { name: true } } },
      });
      return insights.map((insight) => ({
        title: insight.title,
        category: insight.category,
        priority: insight.priority,
        status: insight.status,
        estimatedImpact: Number(insight.estimatedImpact),
        confidence: insight.confidence,
        owner: insight.owner?.name ?? null,
        detectedAt: iso(insight.detectedAt),
      }));
    }
    case "tickets": {
      const tickets = await db.supportTicket.findMany({
        where: { organizationId, deletedAt: null, openedAt: { gte: window.from, lte: window.to }, ...(ownerId ? { assigneeId: ownerId } : {}) },
        orderBy: { openedAt: "desc" },
        take: 500,
        include: { customer: { select: { name: true } } },
      });
      return tickets.map((ticket) => ({
        reference: ticket.reference,
        subject: ticket.subject,
        customer: ticket.customer.name,
        priority: ticket.priority,
        status: ticket.status,
        slaBreached: ticket.slaBreached ? "yes" : "no",
        resolutionMinutes: ticket.resolutionMinutes,
        openedAt: iso(ticket.openedAt),
      }));
    }
    case "audit": {
      const logs = await db.auditLog.findMany({
        where: { organizationId, createdAt: { gte: window.from, lte: window.to } },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return logs.map((log) => ({
        createdAt: iso(log.createdAt),
        actorName: log.actorName,
        actorRole: log.actorRole ?? "",
        action: log.action,
        entityType: log.entityType,
        entityLabel: log.entityLabel ?? log.entityId ?? "",
        severity: log.severity,
        source: log.source,
        ip: log.ip ?? "",
        changes: log.diff ? Object.keys(log.diff as Record<string, unknown>).join(" | ") : "",
      }));
    }
  }
}

function buildSummary(dataset: ReportDataset, rows: Record<string, string | number | null>[]): { label: string; value: number; unit?: string }[] {
  switch (dataset) {
    case "opportunities":
      return [
        { label: "Opportunities", value: rows.length },
        { label: "Pipeline value", value: rows.reduce((acc, row) => acc + Number(row.amount ?? 0), 0), unit: "EUR" },
        { label: "Average deal", value: rows.length ? Math.round(rows.reduce((acc, row) => acc + Number(row.amount ?? 0), 0) / rows.length) : 0, unit: "EUR" },
      ];
    case "customers":
      return [
        { label: "Customers", value: rows.length },
        { label: "ARR", value: rows.reduce((acc, row) => acc + Number(row.arr ?? 0), 0), unit: "EUR" },
        { label: "Below 60 health", value: rows.filter((row) => Number(row.healthScore ?? 0) < 60).length },
      ];
    case "risks":
      return [
        { label: "Risks", value: rows.length },
        { label: "Exposure", value: rows.reduce((acc, row) => acc + Number(row.impact ?? 0), 0), unit: "EUR" },
        { label: "Critical", value: rows.filter((row) => row.severity === "CRITICAL").length },
      ];
    case "insights":
      return [
        { label: "Opportunities", value: rows.length },
        { label: "Modelled upside", value: rows.reduce((acc, row) => acc + Number(row.estimatedImpact ?? 0), 0), unit: "EUR" },
      ];
    case "activities":
      return [
        { label: "Activities", value: rows.length },
        { label: "Hours logged", value: Math.round(rows.reduce((acc, row) => acc + Number(row.durationMinutes ?? 0), 0) / 60), unit: "h" },
      ];
    case "tickets":
      return [
        { label: "Tickets", value: rows.length },
        { label: "SLA breaches", value: rows.filter((row) => row.slaBreached === "yes").length },
      ];
    case "audit":
      return [
        { label: "Events", value: rows.length },
        { label: "Warnings", value: rows.filter((row) => row.severity !== "INFO").length },
      ];
    default:
      return [{ label: "Rows", value: rows.length }];
  }
}

/** Board-level pack used by the "Export report" command and the analytics page. */
export async function executiveSummary(organizationId: string) {
  const snapshot = await computeRevenueSnapshot(organizationId, resolveWindow("12m"));
  return {
    revenue: snapshot.revenue,
    growth: snapshot.revenuePrev ? snapshot.revenue / snapshot.revenuePrev - 1 : 0,
    pipeline: snapshot.pipelineOpen,
    coverage: snapshot.coverage,
    nrr: snapshot.nrr,
    atRisk: snapshot.atRiskCustomers,
    efficiency: snapshot.operationalEfficiency,
  };
}
