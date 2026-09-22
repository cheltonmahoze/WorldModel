"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, Clock, Loader2, Pause, Play, RotateCw, Trash2, Zap } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ConfirmDialog, InfoRow, InlineError, StatCard, StatusPill } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Label } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiMutation, useApiQuery, qk, toast } from "@/hooks/use-api";
import { formatDateTime, formatNumber, formatPercent, relativeTime, titleCase } from "@/lib/utils";

type Automation = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  conditions: { field: string; operator: string; value?: unknown }[];
  actions: { type: string; config: Record<string, unknown> }[];
  tags: string[];
  runCount: number;
  successCount: number;
  failureCount: number;
  timeSavedMinutes: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

type DetailResponse = {
  automation: Automation;
  executions: { id: string; status: string; startedAt: string; finishedAt: string | null; durationMs: number | null; error: string | null; trigger: string | null; actionsRun: number; actionsFailed: number; result: Record<string, unknown> | null }[];
  stats: { status: string; count: number; averageDuration: number | null }[];
};

export default function AutomationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const query = useApiQuery<DetailResponse>(qk.automation(params.id), `/api/automations/${params.id}`);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deletePending, setDeletePending] = React.useState(false);

  const update = useApiMutation<Automation, { name?: string; description?: string | null; status?: string }>({
    path: `/api/automations/${params.id}`,
    method: "PATCH",
    invalidate: [qk.automation(params.id), ["automations"], ["operations"]],
    successMessage: "Automation updated.",
    onSuccess: () => {
      setName("");
      setDescription("");
    },
  });

  const run = useApiMutation<{ status: string; actionsRun: number; actionsFailed: number; summary: string }, { force?: boolean }>({
    path: `/api/automations/${params.id}/run`,
    invalidate: [qk.automation(params.id), ["automations"], ["operations"], qk.notificationCount],
    successMessage: (data) => data.summary,
  });

  const remove = useApiMutation<{ id: string }, void>({
    path: `/api/automations/${params.id}`,
    method: "DELETE",
    invalidate: [["automations"], ["operations"]],
    successMessage: "Automation deleted.",
    onSettled: () => setDeletePending(false),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Automation not found" description="It may have been deleted or belongs to another organization." />
        <InlineError message={query.error?.message ?? "We could not load this automation."} onRetry={() => query.refetch()} />
        <Button asChild variant="outline" size="sm">
          <Link href="/automations">
            <ArrowLeft className="size-3.5" /> Back to automations
          </Link>
        </Button>
      </div>
    );
  }

  const { automation, executions, stats } = query.data.data;
  const reliability = automation.runCount ? ((automation.runCount - automation.failureCount) / automation.runCount) * 100 : 100;

  return (
    <div className="space-y-6">
      <Link href="/automations" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Automations
      </Link>

      <PageHeader
        eyebrow={`Automation · updated ${relativeTime(automation.updatedAt)}`}
        title={automation.name}
        description={automation.description ?? "No description recorded."}
        actions={
          <>
            <StatusPill value={automation.status} className="h-7 px-2.5 text-xs" />
            <Button variant="outline" size="sm" disabled={run.isPending} onClick={() => run.mutate({ force: true })}>
              {run.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
              Run now
            </Button>
            {automation.status === "ACTIVE" ? (
              <Button variant="outline" size="sm" disabled={update.isPending} onClick={() => update.mutate({ status: "PAUSED" })}>
                <Pause className="size-3.5" /> Pause
              </Button>
            ) : (
              <Button size="sm" disabled={update.isPending} onClick={() => update.mutate({ status: "ACTIVE" })}>
                <Play className="size-3.5" /> Activate
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label="Delete automation">
              <Trash2 className="size-3.5" />
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Executions" value={formatNumber(automation.runCount)} hint={automation.lastRunAt ? `Last run ${relativeTime(automation.lastRunAt)}` : "Never run"} icon={Zap} />
        <StatCard label="Reliability" value={formatPercent(reliability)} hint={`${formatNumber(automation.successCount)} succeeded · ${formatNumber(automation.failureCount)} failed`} tone={reliability < 85 && automation.runCount > 4 ? "warning" : "positive"} />
        <StatCard label="Time saved" value={`${formatNumber(Math.round(automation.timeSavedMinutes / 60))}h`} hint="Manual coordination removed" icon={Clock} />
        <StatCard label="Recorded runs" value={formatNumber(executions.length)} hint={`${stats.length} distinct outcomes`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>The rule</CardTitle>
                <CardDescription>WHEN → IF → THEN, exactly as stored on the record.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <RuleBlock label="WHEN" tone="info">
                <p className="font-medium">{titleCase(automation.triggerType.replace(/_/g, " "))}</p>
                {Object.keys(automation.triggerConfig).length ? (
                  <dl className="mt-2 space-y-1">
                    {Object.entries(automation.triggerConfig).map(([key, value]) => (
                      <div key={key} className="flex items-baseline justify-between gap-3 text-2xs">
                        <dt className="text-muted-foreground">{titleCase(key.replace(/([A-Z])/g, " $1"))}</dt>
                        <dd className="font-medium">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </RuleBlock>

              <RuleBlock label="IF" tone="warning">
                {automation.conditions.length ? (
                  <ul className="space-y-1">
                    {automation.conditions.map((condition, index) => (
                      <li key={index} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="font-normal">
                          {titleCase(condition.field.replace(/([A-Z])/g, " $1"))}
                        </Badge>
                        <span className="text-muted-foreground">{condition.operator.replace(/_/g, " ")}</span>
                        {condition.value !== undefined ? <span className="font-medium">{String(condition.value)}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No conditions — fires on every match of the trigger.</p>
                )}
              </RuleBlock>

              <RuleBlock label="THEN" tone="success">
                <ol className="space-y-2">
                  {automation.actions.map((action, index) => (
                    <li key={index} className="flex gap-2 text-xs">
                      <span className="tabular text-muted-foreground">{index + 1}.</span>
                      <span className="min-w-0">
                        <span className="font-medium">{titleCase(action.type.replace(/_/g, " "))}</span>
                        <span className="mt-1 block space-y-0.5">
                          {Object.entries(action.config)
                            .filter(([key]) => ["title", "subject", "text", "role", "body", "severity", "stage", "assigneeRole", "dueInDays"].includes(key))
                            .map(([key, value]) => (
                              <span key={key} className="block text-2xs text-muted-foreground">
                                {titleCase(key.replace(/([A-Z])/g, " $1"))}: {String(value)}
                              </span>
                            ))}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </RuleBlock>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Execution log</CardTitle>
                <CardDescription>{executions.length ? `${executions.length} recorded runs, most recent first` : "No runs recorded yet"}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {executions.length ? (
                <ul className="divide-y divide-border/60">
                  {executions.map((execution) => (
                    <li key={execution.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-xs">
                          <StatusPill value={execution.status} />
                          <span className="text-muted-foreground">{execution.trigger ? titleCase(execution.trigger.replace(/_/g, " ")) : "Manual run"}</span>
                        </p>
                        <p className="mt-0.5 text-2xs text-muted-foreground">
                          {formatDateTime(execution.startedAt)}
                          {execution.durationMs ? ` · ${execution.durationMs}ms` : ""} · {execution.actionsRun} action{execution.actionsRun === 1 ? "" : "s"}
                          {execution.actionsFailed ? ` · ${execution.actionsFailed} failed` : ""}
                        </p>
                        {execution.error ? <p className="mt-1 text-2xs text-rose-600 dark:text-rose-400">{execution.error}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={Zap}
                  title="This automation has not run yet"
                  description="Activate it so the scheduler picks it up, or run it now to see the result of the current data."
                  action={{ label: "Run now", onClick: () => run.mutate({ force: true }) }}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Edit</CardTitle>
                <CardDescription>Rename or re-describe the playbook. The rule itself is edited in the builder.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field>
                <Label htmlFor="automation-name">Name</Label>
                <Input id="automation-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={automation.name} />
              </Field>
              <Field>
                <Label htmlFor="automation-description">Description</Label>
                <Textarea id="automation-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={automation.description ?? "Describe the outcome"} />
              </Field>
              <Button
                size="sm"
                className="w-full"
                disabled={(!name && !description) || update.isPending}
                onClick={() => update.mutate({ name: name || undefined, description: description || undefined })}
              >
                {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Save changes
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  toast.info("To change the rule, create a new automation from the builder — the execution history stays attached to this one.");
                }}
              >
                Change the rule
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Facts</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <InfoRow label="Created" value={formatDateTime(automation.createdAt)} />
              <InfoRow label="Last updated" value={formatDateTime(automation.updatedAt)} />
              <InfoRow label="Last status" value={automation.lastStatus ? titleCase(automation.lastStatus) : "—"} />
              <InfoRow label="Tags" value={automation.tags.length ? automation.tags.join(", ") : "—"} />
              {stats.length ? (
                <>
                  <div className="h-px w-full bg-border/70" />
                  {stats.map((stat) => (
                    <InfoRow key={stat.status} label={`${titleCase(stat.status)} runs`} value={`${formatNumber(stat.count)}${stat.averageDuration ? ` · ${Math.round(stat.averageDuration)}ms avg` : ""}`} />
                  ))}
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>How runs are triggered</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-2xs text-muted-foreground">
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                Event triggers fire from the matching action elsewhere in the product (stage change, won/lost, new risk, SLA breach).
              </p>
              <p className="flex gap-2">
                <Clock className="mt-0.5 size-3 shrink-0" />
                Schedule and sweep triggers run from the background worker every few minutes.
              </p>
              <p className="flex gap-2">
                <CircleAlert className="mt-0.5 size-3 shrink-0 text-amber-500" />
                Email and Slack steps remain queued until a provider credential is connected — the run reports that explicitly.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this automation?"
        description="It stops running immediately. The execution history is kept for audit, but the playbook will no longer appear in the list."
        confirmLabel="Delete automation"
        pending={deletePending}
        onConfirm={() => {
          setDeletePending(true);
          remove.mutate(undefined, { onSuccess: () => router.push("/automations") });
        }}
      />
    </div>
  );
}

function RuleBlock({ label, tone, children }: { label: string; tone: "info" | "warning" | "success"; children: React.ReactNode }) {
  const toneClass = {
    info: "border-sky-500/25 bg-sky-500/[0.05]",
    warning: "border-amber-500/25 bg-amber-500/[0.05]",
    success: "border-emerald-500/25 bg-emerald-500/[0.05]",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-2xs font-semibold uppercase tracking-[0.14em]">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
