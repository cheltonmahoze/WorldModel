"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowDownRight, ArrowUpRight, CircleHelp, Download, Loader2, Minus, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/tooltip";
import { Input, NativeSelect } from "@/components/ui/input";
import { Sparkline } from "@/components/charts";
import { downloadBlob, queryString, apiGet } from "@/lib/api-client";
import { useApiMutation, qk, toast } from "@/hooks/use-api";
import { cn, formatCompactCurrency, formatCurrency, formatNumber, formatPercent, titleCase, toCsv } from "@/lib/utils";

/* ──────────────────────────────── glossary ─────────────────────────────── */

export const STATUS_LABELS: Record<string, string> = {
  DETECTED: "Detected",
  REVIEWING: "Reviewing",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  DISMISSED: "Dismissed",
  OPEN: "Open",
  MITIGATING: "Mitigating",
  MONITORING: "Monitoring",
  RESOLVED: "Resolved",
  ACCEPTED: "Accepted",
  ACTIVE: "Active",
  PAUSED: "Paused",
  DRAFT: "Draft",
  ARCHIVED: "Archived",
  CONNECTED: "Connected",
  DISCONNECTED: "Disconnected",
  ERROR: "Error",
  PENDING: "Pending",
  SPEND: "Spend",
  ONBOARDING: "Onboarding",
  CHURNED: "Churned",
  AT_RISK: "At risk",
  TRIALING: "Trialing",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  QUEUED: "Queued",
  RUNNING: "Running",
};

const PRIORITY_TONE: Record<string, string> = {
  CRITICAL: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300",
  HIGH: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  MEDIUM: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  LOW: "border-border bg-muted/60 text-muted-foreground",
};

const STAGE_TONE: Record<string, string> = {
  DISCOVERY: "border-slate-400/30 bg-slate-400/10 text-slate-600 dark:text-slate-300",
  QUALIFICATION: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  PROPOSAL: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  NEGOTIATION: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  WON: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  LOST: "border-border bg-muted/60 text-muted-foreground",
};

export function PriorityBadge({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide", PRIORITY_TONE[value] ?? PRIORITY_TONE.LOW, className)}>
      {titleCase(value)}
    </span>
  );
}

export function StageBadge({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium", STAGE_TONE[value] ?? STAGE_TONE.DISCOVERY, className)}>
      {titleCase(value)}
    </span>
  );
}

export function StatusPill({ value, className }: { value: string; className?: string }) {
  const tone =
    ["COMPLETED", "RESOLVED", "WON", "CONNECTED", "ACTIVE", "SUCCEEDED", "PAID", "HEALTHY"].includes(value)
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : ["OPEN", "AT_RISK", "ERROR", "FAILED", "LOST", "CRITICAL", "BREACHED"].includes(value)
        ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300"
        : ["IN_PROGRESS", "REVIEWING", "RUNNING", "MITIGATING", "PENDING", "QUEUED"].includes(value)
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-border bg-muted/60 text-muted-foreground";
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium", tone, className)}>{STATUS_LABELS[value] ?? titleCase(value)}</span>;
}

export function HealthBadge({ score, showScore = true }: { score: number; showScore?: boolean }) {
  const tone = score >= 80 ? "emerald" : score >= 60 ? "amber" : "rose";
  const label = score >= 80 ? "Healthy" : score >= 60 ? "Watch" : "At risk";
  const classes = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium", classes)}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
      {showScore ? <span className="tabular opacity-80">{Math.round(score)}</span> : null}
    </span>
  );
}

export function SeverityMeter({ score, label = "Risk score" }: { score: number; label?: string }) {
  const tone = score >= 82 ? "bg-rose-500" : score >= 64 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-2xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular font-medium text-foreground">{Math.round(score)}/100</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(3, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}

/* ─────────────────────────────── headline KPI ──────────────────────────── */

export type Kpi = {
  key: string;
  label: string;
  value: number;
  unit: "EUR" | "%" | "count";
  delta: number;
  deltaUnit: "percent" | "points";
  comparison: string;
  context?: string;
  formula?: string;
  href?: string;
  series?: { period: string | Date; value: number }[];
};

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const positive = kpi.delta >= 0;
  const flat = Math.abs(kpi.delta) < 0.05;
  const TrendIcon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  const value = kpi.unit === "EUR" ? formatCurrency(kpi.value) : kpi.unit === "%" ? formatPercent(kpi.value) : formatNumber(kpi.value);
  const deltaLabel = flat
    ? "flat"
    : `${positive ? "+" : ""}${kpi.deltaUnit === "percent" ? formatPercent(kpi.delta).replace("+", "+").replace("-", "−") : `${kpi.delta.toFixed(1)} pts`}`;

  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{kpi.label}</span>
            {kpi.formula ? (
              <InfoTip label={kpi.formula}>
                <CircleHelp className="size-3 text-muted-foreground/70 transition-colors hover:text-foreground" />
              </InfoTip>
            ) : null}
          </div>
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-2xs font-medium", flat ? "border-border text-muted-foreground" : positive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300")}>
            <TrendIcon className="size-3" />
            {deltaLabel}
          </span>
        </div>
        <div className="mt-2.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="tabular truncate text-[26px] font-semibold leading-none tracking-[-0.02em]">{value}</div>
            <div className="mt-1.5 text-2xs text-muted-foreground">{kpi.comparison}</div>
          </div>
          {kpi.series?.length ? (
            <div className="w-24 shrink-0">
              <Sparkline data={kpi.series.slice(-30).map((point) => point.value)} />
            </div>
          ) : null}
        </div>
        {kpi.context ? <p className="mt-2 truncate text-2xs text-muted-foreground">{kpi.context}</p> : null}
      </CardContent>
      {kpi.href ? <Link href={kpi.href} className="absolute inset-0" aria-label={`Open ${kpi.label}`} /> : null}
    </Card>
  );
}

/* ───────────────────────────────── toolbar ─────────────────────────────── */

export type FilterSelect = {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
};

export function ModuleToolbar({
  search,
  onSearch,
  searchPlaceholder = "Search…",
  filters = [],
  onFilter,
  onExport,
  exporting,
  children,
  className,
}: {
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterSelect[];
  onFilter?: (key: string, value: string) => void;
  onExport?: () => void;
  exporting?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {onSearch ? (
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search ?? ""} onChange={(event) => onSearch(event.target.value)} placeholder={searchPlaceholder} className="h-9 pl-8" />
        </div>
      ) : null}
      {filters.map((filter) => (
        <NativeSelect key={filter.key} value={filter.value} onChange={(event) => onFilter?.(filter.key, event.target.value)} className="h-9 w-auto min-w-[130px]" aria-label={filter.label}>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      {children}
      {onExport ? (
        <Button variant="outline" size="sm" className="h-9" onClick={onExport} disabled={exporting}>
          {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Export
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Client-side export used by list views: the rows that are on screen are the
 * rows that get exported, so the file always matches the applied filters.
 */
export function useCsvExport() {
  const [exporting, setExporting] = React.useState(false);
  const run = React.useCallback(async (filename: string, rows: Record<string, unknown>[], columns?: string[]) => {
    if (!rows.length) {
      toast.error("Nothing to export for the current filters.");
      return;
    }
    setExporting(true);
    try {
      const content = toCsv(rows, columns);
      downloadBlob(filename.endsWith(".csv") ? filename : `${filename}.csv`, content);
      toast.success(`Exported ${rows.length} rows to ${filename.replace(/\.csv$/, "")}.csv`);
    } finally {
      setExporting(false);
    }
  }, []);
  return { exporting, run };
}

/** Server-side export: streams a report from the reporting service. */
export async function exportFromServer(type: "pipeline" | "revenue" | "customers" | "risks", format: "csv" | "json" = "csv") {
  try {
    const response = await apiGet<{ content: string; filename: string }>(`/api/reports/export${queryString({ type, format })}`);
    downloadBlob(response.data.filename, response.data.content, format === "json" ? "application/json" : "text/csv;charset=utf-8");
    toast.success(`Report ready — ${response.data.filename}`);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Export failed.");
  }
}


/* ─────────────────────────── shared layout pieces ──────────────────────── */

export type WindowKey = "7d" | "30d" | "90d" | "qtd" | "ytd" | "12m" | "24m";

export const WINDOW_OPTIONS: { value: WindowKey; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "qtd", label: "Quarter to date" },
  { value: "ytd", label: "Year to date" },
  { value: "12m", label: "Last 12 months" },
  { value: "24m", label: "Last 24 months" },
];

/** Period selector: one control, used by every time-aware module. */
export function WindowPicker({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <NativeSelect value={value} onChange={(event) => onChange(event.target.value)} className={cn("h-9 w-auto min-w-[150px]", className)} aria-label="Reporting period">
      {WINDOW_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Compact headline metric used across the modules. */
export function StatCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "positive" | "danger" | "warning";
  icon?: React.ElementType;
  className?: string;
}) {
  const valueTone =
    tone === "positive" ? "text-emerald-600 dark:text-emerald-400" : tone === "danger" ? "text-rose-600 dark:text-rose-400" : tone === "warning" ? "text-amber-600 dark:text-amber-400" : "";
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          {Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
        </div>
        <p className={cn("tabular mt-2 text-2xl font-semibold leading-none", valueTone)}>{value}</p>
        {hint ? <p className="mt-2 text-2xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/** Definition row (label + value) used in side panels. */
export function InfoRow({ label, value, tone, mono }: { label: string; value: React.ReactNode; tone?: "danger" | "positive"; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium", mono && "font-mono text-2xs", tone === "danger" && "text-rose-600 dark:text-rose-400", tone === "positive" && "text-emerald-600 dark:text-emerald-400")}>{value}</span>
    </div>
  );
}

/** Confirmation dialog for destructive actions — never a silent delete. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────── empty + errors ─────────────────────────── */

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs">
      <span className="text-destructive">{message}</span>
      {onRetry ? (
        <Button variant="outline" size="sm" className="h-7" onClick={onRetry}>
          <RefreshCw className="size-3" /> Retry
        </Button>
      ) : null}
    </div>
  );
}

export function DataRowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/40", className)}>
      {children}
    </Link>
  );
}

/** Shared "run the intelligence engines" affordance used in several modules. */
export function RunIntelligenceButton({ engines, size = "sm", label = "Run intelligence" }: { engines?: string[]; size?: "sm" | "default"; label?: string }) {
  const mutation = useApiMutation<{ insights: unknown[]; risks: unknown[]; briefUpdatedAt: string; durationMs: number; scanned: Record<string, number> }, { engines?: string[] }>({
    path: "/api/intelligence/run",
    invalidate: [qk.dashboard, ["intelligence"], ["insights", {}], ["risks", {}], qk.notificationCount],
    successMessage: (data) => `Analysis complete — ${data.insights.length} opportunities and ${data.risks.length} risks in ${(data.durationMs / 1000).toFixed(1)}s.`,
  });

  return (
    <Button variant="outline" size={size} onClick={() => mutation.mutate({ engines })} disabled={mutation.isPending}>
      {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      {mutation.isPending ? "Analysing…" : label}
    </Button>
  );
}

export { Badge, formatCompactCurrency, formatCurrency, formatNumber, formatPercent };
