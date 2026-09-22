"use client";

import * as React from "react";
import {
  BarChart3,
  CalendarClock,
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Pin,
  Play,
  Plus,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ConfirmDialog, InlineError, ModuleToolbar, StatCard, StatusPill, useCsvExport } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldHint, Label } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useApiMutation, useApiQuery, pageData, qk, toast } from "@/hooks/use-api";
import { downloadBlob } from "@/lib/api-client";
import { toCsv } from "@/lib/utils";
import { formatDateTime, formatNumber, relativeTime, titleCase } from "@/lib/utils";

type SavedReport = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  config: { dataset?: string; range?: string; groupBy?: string | null; metrics?: string[]; filters?: Record<string, unknown> } | null;
  schedule: string;
  recipients: string[];
  format: string;
  isShared: boolean;
  isPinned: boolean;
  lastGeneratedAt: string | null;
  lastRunDurationMs: number | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
};

type ReportsMeta = { total: number; page: number; pageCount: number };

type RunResult = {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
  generatedAt: string;
  summary: { label: string; value: number; unit?: string }[];
};

const REPORT_TYPES = ["EXECUTIVE", "REVENUE", "PIPELINE", "CUSTOMER", "OPERATIONAL", "CUSTOM", "SAVED_VIEW"] as const;
const DATASETS = ["opportunities", "customers", "activities", "risks", "insights", "tickets"] as const;
const RANGES = ["30d", "90d", "qtd", "ytd", "12m"] as const;
const SCHEDULES = ["NONE", "DAILY", "WEEKLY", "MONTHLY"] as const;
const FORMATS = ["csv", "xlsx", "json"] as const;
const METRICS = ["amount", "probability", "healthScore", "arr", "impact", "slaBreached", "estimatedImpact", "durationMinutes"] as const;

const DATASET_LABELS: Record<string, string> = {
  opportunities: "Opportunities",
  customers: "Customers",
  activities: "Activities",
  risks: "Risks",
  insights: "AI opportunities",
  tickets: "Support tickets",
};

type FormState = {
  name: string;
  description: string;
  type: string;
  dataset: string;
  range: string;
  groupBy: string;
  metrics: string[];
  schedule: string;
  format: string;
  recipients: string;
  isShared: boolean;
  isPinned: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  type: "CUSTOM",
  dataset: "opportunities",
  range: "90d",
  groupBy: "",
  metrics: [],
  schedule: "NONE",
  format: "csv",
  recipients: "",
  isShared: false,
  isPinned: false,
};

export default function ReportsPage() {
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SavedReport | null>(null);
  const [deleting, setDeleting] = React.useState<SavedReport | null>(null);
  const [preview, setPreview] = React.useState<{ report: SavedReport; result: RunResult; durationMs: number } | null>(null);
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const { exporting, run: runExport } = useCsvExport();

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (query) params.set("q", query);
  if (type) params.set("type", type);

  const reports = useApiQuery<SavedReport[]>(qk.reports, `/api/reports?${params.toString()}`);
  const { items, meta } = pageData<SavedReport, ReportsMeta>(reports.data);
  const canManage = true;

  const createReport = useApiMutation<SavedReport, Record<string, unknown>>({
    path: "/api/reports",
    method: "POST",
    invalidate: [qk.reports],
    onSuccess: () => {
      toast.success("Report saved");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
  });

  const updateReport = useApiMutation<SavedReport, { id: string; body: Record<string, unknown> }>({
    path: (variables) => `/api/reports/${variables.id}`,
    method: "PATCH",
    invalidate: [qk.reports],
    onSuccess: () => {
      toast.success("Report updated");
      setEditing(null);
      setCreateOpen(false);
    },
  });

  const deleteReport = useApiMutation<{ id: string }, { id: string }>({
    path: (variables) => `/api/reports/${variables.id}`,
    method: "DELETE",
    invalidate: [qk.reports],
    onSuccess: () => {
      toast.success("Report deleted");
      setDeleting(null);
    },
  });

  const runReport = useApiMutation<{ report: SavedReport; result: RunResult; durationMs: number }, { id: string }>({
    path: (variables) => `/api/reports/${variables.id}/run`,
    method: "POST",
    invalidate: [qk.reports, qk.notificationCount],
    onSuccess: (data, variables) => {
      setPreview({ report: items.find((item) => item.id === variables.id) ?? data.data.report, result: data.data.result, durationMs: data.data.durationMs });
      setRunningId(null);
    },
    onError: () => setRunningId(null),
  });

  const scheduled = items.filter((report) => report.schedule !== "NONE").length;
  const pinned = items.filter((report) => report.isPinned).length;
  const runs = items.reduce((acc, report) => acc + report.runCount, 0);

  function submit() {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      config: {
        dataset: form.dataset,
        range: form.range,
        groupBy: form.groupBy.trim() || undefined,
        metrics: form.metrics,
        filters: {},
      },
      schedule: form.schedule,
      recipients: form.recipients
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean),
      format: form.format,
      isShared: form.isShared,
      isPinned: form.isPinned,
    };
    if (editing) updateReport.mutate({ id: editing.id, body: payload });
    else createReport.mutate(payload);
  }

  function openEdit(report: SavedReport) {
    setEditing(report);
    setForm({
      name: report.name,
      description: report.description ?? "",
      type: report.type,
      dataset: (report.config?.dataset as string) ?? "opportunities",
      range: (report.config?.range as string) ?? "90d",
      groupBy: (report.config?.groupBy as string) ?? "",
      metrics: (report.config?.metrics as string[]) ?? [],
      schedule: report.schedule,
      format: report.format,
      recipients: report.recipients.join(", "),
      isShared: report.isShared,
      isPinned: report.isPinned,
    });
    setCreateOpen(true);
  }

  function exportPreview() {
    if (!preview) return;
    const columns = preview.result.columns.map((column) => column.key);
    downloadBlob(`${preview.report.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, toCsv(preview.result.rows, columns));
    toast.success(`Exported ${preview.result.rows.length} rows`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports & exports"
        title="Reporting workspace"
        description="Saved datasets with schedules, recipients and formats — generated on demand or by the background worker, exported as CSV/JSON, and delivered to the people who need them."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <a href="/api/reports/export?type=pipeline&format=csv">
                <Download className="size-4" />
                Board pack (CSV)
              </a>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY_FORM);
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" />
              New report
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Saved reports" value={formatNumber(meta?.total ?? items.length)} hint={type ? `Filtered by ${titleCase(type)}` : "Across this workspace"} icon={FileText} />
        <StatCard label="Scheduled" value={formatNumber(scheduled)} hint="Daily, weekly or monthly on this page" icon={CalendarClock} />
        <StatCard label="Total runs" value={formatNumber(runs)} hint="Generated since the report was created" icon={Play} />
        <StatCard label="Pinned to dashboard" value={formatNumber(pinned)} hint="Always visible to the team" icon={Pin} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Report library</CardTitle>
            <CardDescription>{meta ? `${formatNumber(meta.total)} saved report(s)` : "Loading…"}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModuleToolbar
            search={query}
            onSearch={(value) => {
              setQuery(value);
              setPage(1);
            }}
            searchPlaceholder="Search reports by name…"
            filters={[
              {
                key: "type",
                label: "Type",
                value: type,
                options: [{ value: "", label: "All types" }, ...REPORT_TYPES.map((option) => ({ value: option, label: titleCase(option) }))],
              },
            ]}
            onFilter={(key, value) => {
              if (key === "type") setType(value);
              setPage(1);
            }}
            onExport={() =>
              runExport(
                "nexus-reports",
                items.map((report) => ({
                  name: report.name,
                  type: report.type,
                  dataset: report.config?.dataset ?? "",
                  range: report.config?.range ?? "",
                  schedule: report.schedule,
                  format: report.format,
                  recipients: report.recipients.join(" | "),
                  runs: report.runCount,
                  lastGeneratedAt: report.lastGeneratedAt ?? "",
                  pinned: report.isPinned ? "yes" : "no",
                })),
                ["name", "type", "dataset", "range", "schedule", "format", "recipients", "runs", "lastGeneratedAt", "pinned"],
              )
            }
            exporting={exporting}
          />

          {reports.isError ? <InlineError message={reports.error?.message ?? "Could not load reports."} onRetry={() => reports.refetch()} /> : null}

          {reports.isLoading ? (
            <SkeletonTable rows={6} columns={5} />
          ) : items.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {items.map((report) => (
                <div key={report.id} className="rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-border">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {report.isPinned ? <Star className="size-3.5 fill-warning text-warning" /> : null}
                        <p className="truncate text-sm font-semibold">{report.name}</p>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {report.description ?? "No description — edit the report to document what it measures."}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {titleCase(report.type)}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-2xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <FileSpreadsheet className="size-3.5" />
                      {DATASET_LABELS[(report.config?.dataset as string) ?? ""] ?? "Dataset"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BarChart3 className="size-3.5" />
                      {(report.config?.range as string) ?? "90d"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3.5" />
                      {report.schedule === "NONE" ? "On demand" : titleCase(report.schedule)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" />
                      {report.recipients.length ? `${report.recipients.length} recipient(s)` : "No recipients"}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <div className="text-2xs text-muted-foreground">
                      {report.lastGeneratedAt ? (
                        <>
                          Last run {relativeTime(report.lastGeneratedAt)}
                          {report.lastRunDurationMs !== null ? ` · ${report.lastRunDurationMs}ms` : ""}
                        </>
                      ) : (
                        <>Never generated · {report.runCount} run(s)</>
                      )}
                      <span className="block">Updated {formatDateTime(report.updatedAt)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={runReport.isPending && runningId === report.id}
                        onClick={() => {
                          setRunningId(report.id);
                          runReport.mutate({ id: report.id });
                        }}
                      >
                        <Play className="size-3.5" />
                        {runReport.isPending && runningId === report.id ? "Generating…" : "Run"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        title={report.isPinned ? "Unpin" : "Pin to dashboard"}
                        disabled={!canManage || updateReport.isPending}
                        onClick={() => updateReport.mutate({ id: report.id, body: { isPinned: !report.isPinned } })}
                      >
                        <Pin className={report.isPinned ? "size-3.5 fill-primary text-primary" : "size-3.5"} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" title="Edit" disabled={!canManage} onClick={() => openEdit(report)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" title="Delete" disabled={!canManage} onClick={() => setDeleting(report)}>
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="No reports yet"
              description="Create a saved report to snapshot a dataset, schedule it for the background worker and send it to stakeholders automatically."
              action={{ label: "Create the first report", onClick: () => setCreateOpen(true) }}
              secondaryAction={{ label: "Export the board pack", href: "/api/reports/export?type=pipeline&format=csv" }}
            />
          )}

          {meta && meta.pageCount > 1 ? (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>
                Page {meta.page} of {meta.pageCount}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" className="h-8" disabled={page >= meta.pageCount} onClick={() => setPage((current) => current + 1)}>
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Datasets available for export</CardTitle>
            <CardDescription>Each one is generated server-side from live tenant data, with the export recorded in the audit trail.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {(["pipeline", "revenue", "customers", "risks", "insights", "activities", "tickets", "audit"] as const).map((dataset) => (
              <a
                key={dataset}
                href={`/api/reports/export?type=${dataset}&format=csv`}
                className="group flex items-center justify-between rounded-lg border border-border/70 bg-surface-sunken px-3 py-2.5 transition-colors hover:border-primary/40"
              >
                <span className="text-xs font-medium">{titleCase(dataset)}</span>
                <Download className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
              </a>
            ))}
          </div>
          <p className="mt-4 text-2xs text-muted-foreground">
            Exports are capped by plan and rate limited; large datasets stream from the database with the workspace filter applied, never from another tenant.
          </p>
        </CardContent>
      </Card>

      {/* Create / edit */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit “${editing.name}”` : "New report"}</DialogTitle>
            <DialogDescription>
              Pick a dataset and range, optionally schedule it, and decide who receives the file. Runs are executed by the worker when scheduled.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <Label htmlFor="report-name">Name</Label>
              <Input
                id="report-name"
                value={form.name}
                placeholder="Weekly pipeline review"
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
              <FieldHint>A name is required — unique per workspace.</FieldHint>
            </Field>

            <Field className="sm:col-span-2">
              <Label htmlFor="report-description">Description</Label>
              <Textarea
                id="report-description"
                rows={2}
                value={form.description}
                placeholder="What this report answers for the reader."
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </Field>

            <Field>
              <Label htmlFor="report-type">Report type</Label>
              <NativeSelect id="report-type" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>
                {REPORT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <Label htmlFor="report-dataset">Dataset</Label>
              <NativeSelect id="report-dataset" value={form.dataset} onChange={(event) => setForm((current) => ({ ...current, dataset: event.target.value }))}>
                {DATASETS.map((option) => (
                  <option key={option} value={option}>
                    {DATASET_LABELS[option]}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <Label htmlFor="report-range">Range</Label>
              <NativeSelect id="report-range" value={form.range} onChange={(event) => setForm((current) => ({ ...current, range: event.target.value }))}>
                {RANGES.map((option) => (
                  <option key={option} value={option}>
                    {option.toUpperCase()}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <Label htmlFor="report-group">Group by</Label>
              <Input
                id="report-group"
                value={form.groupBy}
                placeholder="stage, owner, region…"
                onChange={(event) => setForm((current) => ({ ...current, groupBy: event.target.value }))}
              />
              <FieldHint>Optional — the dimension used for the first breakdown.</FieldHint>
            </Field>

            <Field className="sm:col-span-2">
              <Label>Metrics</Label>
              <div className="flex flex-wrap gap-1.5">
                {METRICS.map((metric) => {
                  const active = form.metrics.includes(metric);
                  return (
                    <button
                      key={metric}
                      type="button"
                      className={
                        active
                          ? "rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-2xs text-foreground"
                          : "rounded-md border border-border/70 px-2 py-1 text-2xs text-muted-foreground transition-colors hover:text-foreground"
                      }
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          metrics: active ? current.metrics.filter((value) => value !== metric) : [...current.metrics, metric],
                        }))
                      }
                    >
                      {metric}
                    </button>
                  );
                })}
              </div>
              <FieldHint>Column-level metrics included in the generated file.</FieldHint>
            </Field>

            <Field>
              <Label htmlFor="report-schedule">Schedule</Label>
              <NativeSelect id="report-schedule" value={form.schedule} onChange={(event) => setForm((current) => ({ ...current, schedule: event.target.value }))}>
                {SCHEDULES.map((option) => (
                  <option key={option} value={option}>
                    {option === "NONE" ? "On demand" : titleCase(option)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <Label htmlFor="report-format">Format</Label>
              <NativeSelect id="report-format" value={form.format} onChange={(event) => setForm((current) => ({ ...current, format: event.target.value }))}>
                {FORMATS.map((option) => (
                  <option key={option} value={option}>
                    {option.toUpperCase()}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field className="sm:col-span-2">
              <Label htmlFor="report-recipients">Recipients</Label>
              <Input
                id="report-recipients"
                value={form.recipients}
                placeholder="cfo@company.com, revops@company.com"
                onChange={(event) => setForm((current) => ({ ...current, recipients: event.target.value }))}
              />
              <FieldHint>Comma separated emails. Scheduled runs notify these addresses.</FieldHint>
            </Field>

            <div className="flex flex-wrap gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="size-3.5 accent-primary"
                  checked={form.isShared}
                  onChange={(event) => setForm((current) => ({ ...current, isShared: event.target.checked }))}
                />
                Share with the whole workspace
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="size-3.5 accent-primary"
                  checked={form.isPinned}
                  onChange={(event) => setForm((current) => ({ ...current, isPinned: event.target.checked }))}
                />
                Pin to the dashboard
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setCreateOpen(false); setEditing(null); }}>
              Cancel
            </Button>
            <Button size="sm" disabled={form.name.trim().length < 2 || createReport.isPending || updateReport.isPending} onClick={submit}>
              {createReport.isPending || updateReport.isPending ? "Saving…" : editing ? "Save changes" : "Create report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run preview */}
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{preview?.report.name}</DialogTitle>
            <DialogDescription>
              Generated {preview ? relativeTime(preview.result.generatedAt) : ""} · {preview?.result.rows.length ?? 0} rows · {preview?.durationMs ?? 0}ms
            </DialogDescription>
          </DialogHeader>

          {preview ? (
            <div className="space-y-4">
              <div className="grid gap-2.5 sm:grid-cols-3">
                {preview.result.summary.map((row) => (
                  <div key={row.label} className="rounded-lg border border-border/70 bg-surface-sunken p-3">
                    <p className="text-2xs uppercase tracking-wide text-muted-foreground">{row.label}</p>
                    <p className="mt-0.5 text-sm font-semibold tabular">
                      {row.unit === "EUR" ? `€${formatNumber(row.value)}` : formatNumber(row.value)}
                      {row.unit && row.unit !== "EUR" ? ` ${row.unit}` : ""}
                    </p>
                  </div>
                ))}
              </div>

              <div className="max-h-80 overflow-auto rounded-lg border border-border/70">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-sunken">
                    <tr>
                      {preview.result.columns.map((column) => (
                        <th key={column.key} className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {preview.result.rows.slice(0, 40).map((row, index) => (
                      <tr key={index}>
                        {preview.result.columns.map((column) => (
                          <td key={column.key} className="whitespace-nowrap px-3 py-2">
                            {row[column.key] === null || row[column.key] === undefined ? "—" : String(row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.result.rows.length > 40 ? (
                <p className="text-2xs text-muted-foreground">Showing the first 40 of {preview.result.rows.length} rows — export to get everything.</p>
              ) : null}

              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                  Close
                </Button>
                <Button size="sm" onClick={exportPreview}>
                  <Download className="size-4" />
                  Export {preview.result.rows.length} rows
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="The report is soft-deleted: scheduled runs stop immediately and the row stays in the audit trail. This cannot be undone from the UI."
        confirmLabel={deleteReport.isPending ? "Deleting…" : "Delete report"}
        onConfirm={() => deleting && deleteReport.mutate({ id: deleting.id })}
      />

      <div className="flex flex-wrap items-center gap-3 text-2xs text-muted-foreground">
        <StatusPill value="SCHEDULED" />
        <span>Scheduled reports are generated by the background worker (`npm run worker`) and notify recipients on completion.</span>
      </div>
    </div>
  );
}
