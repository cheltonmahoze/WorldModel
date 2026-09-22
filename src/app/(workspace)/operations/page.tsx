"use client";

import Link from "next/link";
import * as React from "react";
import { Activity, AlarmClock, Bot, Clock, LifeBuoy, Loader2, Play, Plus, Server, Users, Wrench } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { BarsByCategory, DonutBreakdown, ScoreBars } from "@/components/charts";
import { InlineError, InfoRow, StatCard, StatusPill, WindowPicker } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardToolbar } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldHint, Label } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonCards } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiMutation, useApiQuery, qk, toast } from "@/hooks/use-api";
import { formatDate, formatNumber, formatPercent, relativeTime, titleCase } from "@/lib/utils";

type OperationsResponse = {
  window: { key: string; from: string; to: string };
  support: {
    total: number;
    open: number;
    breached: number;
    breachRate: number;
    averageFirstResponse: number;
    averageResolution: number;
    csat: number | null;
    byPriority: { key: string; count: number }[];
    byStatus: { key: string; count: number }[];
    workload: { id: string; name?: string; open: number; resolved: number; breached: number }[];
  };
  tasks: {
    total: number;
    overdue: number;
    items: { id: string; subject: string; dueAt: string | null; isOverdue: boolean; priority: string | null; customer: { id: string; name: string } | null; user: { id: string; name: string } | null }[];
  };
  capacity: {
    activities: number;
    hoursLogged: number;
    manualHours: number;
    byType: { key: string; count: number }[];
    byUser: { key: string; count: number }[];
  };
  automation: {
    total: number;
    active: number;
    paused: number;
    draft: number;
    runs: number;
    failureRate: number;
    hoursSaved: number;
    items: { id: string; name: string; status: string; runCount: number; failureCount: number; lastRunAt: string | null; triggerType: string }[];
    recent: { id: string; automationId: string; status: string; startedAt: string; durationMs: number | null; automation: { name: string } | null }[];
  };
  jobs: { id: string; name: string; type: string; status: string; attempts: number; maxAttempts: number; scheduledFor: string; finishedAt: string | null; durationMs: number | null; lastError: string | null }[];
  tickets: {
    id: string;
    reference: string;
    subject: string;
    priority: string;
    status: string;
    slaBreached: boolean;
    openedAt: string;
    firstResponseMinutes: number | null;
    csatScore: number | null;
    customer: { id: string; name: string } | null;
    assignee: { id: string; name: string } | null;
  }[];
};

const PRIORITIES = ["", "LOW", "MEDIUM", "HIGH", "URGENT"];
const TICKET_STATUSES = ["", "OPEN", "PENDING", "RESOLVED", "CLOSED"];

type JobsQueryItem = { id: string; name: string; type: string; status: string };

type JobsMeta = {
  summary: { pending: number; running: number; succeeded: number; failed: number; total: number; successRate: number };
  handlers: { name: string; type: string; title: string; description: string; cadence: string }[];
  canManage: boolean;
};


export default function OperationsPage() {
  const [window, setWindow] = React.useState("90d");
  const [priority, setPriority] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [updating, setUpdating] = React.useState<string | null>(null);

  const operations = useApiQuery<OperationsResponse>(qk.operations(window), `/api/operations?window=${window}`);

  const updateTicket = useApiMutation<{ id: string }, { id: string; status?: string; priority?: string }>({
    path: (variables: { id: string }) => `/api/tickets/${variables.id}`,
    method: "PATCH",
    invalidate: [["operations"], qk.dashboard, ["analytics"]],
    successMessage: "Ticket updated.",
    onSettled: () => setUpdating(null),
  });

  if (operations.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Operations" description="Loading operational data…" />
        <SkeletonCards />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (operations.isError || !operations.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Operations" description="We could not load the operations view." />
        <InlineError message={operations.error?.message ?? "The operations request failed."} onRetry={() => operations.refetch()} />
      </div>
    );
  }

  const jobs = useApiQuery<JobsQueryItem[]>(qk.jobs, "/api/jobs?pageSize=50");
  const jobsMeta = jobs.data?.meta as JobsMeta | undefined;
  const [queueOpen, setQueueOpen] = React.useState(false);
  const [queueForm, setQueueForm] = React.useState({ name: "", delaySeconds: 0, provider: "" });

  const runJob = useApiMutation<{ outcome: { ok: boolean; summary: string } }, { id: string }>({
    path: (variables) => `/api/jobs/${variables.id}/run`,
    method: "POST",
    invalidate: [qk.jobs, qk.operations(window)],
    onSuccess: (payload) => toast.success(payload.data.outcome.summary),
  });

  const queueJob = useApiMutation<{ executed: boolean; job: { name: string } }, { name: string; delaySeconds: number }>({
    path: "/api/jobs",
    method: "POST",
    invalidate: [qk.jobs],
    onSuccess: (payload) => {
      toast.success(payload.data.executed ? `${payload.data.job.name} ran immediately` : `${payload.data.job.name} queued for the worker`);
      setQueueOpen(false);
      setQueueForm({ name: "", delaySeconds: 0, provider: "" });
    },
  });

  const data = operations.data.data;
  const support = data.support;
  const tickets = data.tickets.filter((ticket) => (!priority || ticket.priority === priority) && (!status || ticket.status === status));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Operations · ${formatDate(data.window.from)} → ${formatDate(data.window.to)}`}
        title="Operations"
        description="Support load, task hygiene, team capacity, background jobs and automation reliability — the operational inputs behind the efficiency score."
        actions={<WindowPicker value={window} onChange={setWindow} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open tickets" value={formatNumber(support.open)} hint={`${formatNumber(support.total)} raised in period`} icon={LifeBuoy} />
        <StatCard
          label="SLA breaches"
          value={formatNumber(support.breached)}
          hint={`${formatPercent(support.breachRate)} of tickets breached`}
          tone={support.breachRate > 15 ? "danger" : "warning"}
          icon={AlarmClock}
        />
        <StatCard label="First response" value={`${Math.round(support.averageFirstResponse)} min`} hint={`${Math.round(support.averageResolution)} min average resolution`} icon={Clock} />
        <StatCard label="CSAT" value={support.csat ? `${support.csat.toFixed(2)}/5` : "—"} hint={support.csat ? "Average customer satisfaction" : "No survey responses yet"} tone={support.csat && support.csat >= 4 ? "positive" : undefined} icon={Activity} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open tasks" value={formatNumber(data.tasks.total)} hint={`${formatNumber(data.tasks.overdue)} overdue`} tone={data.tasks.overdue ? "warning" : undefined} icon={Wrench} />
        <StatCard label="Hours logged" value={`${formatNumber(data.capacity.hoursLogged)}h`} hint={`${formatNumber(data.capacity.manualHours)}h on manual coordination`} icon={Users} />
        <StatCard label="Automation runs" value={formatNumber(data.automation.runs)} hint={`${formatPercent(100 - data.automation.failureRate)} success rate · ${formatNumber(data.automation.hoursSaved)}h saved`} tone={data.automation.failureRate > 15 ? "warning" : "positive"} icon={Bot} />
        <StatCard label="Background jobs" value={formatNumber(data.jobs.length)} hint={`${data.jobs.filter((job) => job.status === "FAILED").length} failed · ${data.jobs.filter((job) => job.status === "PENDING").length} queued`} icon={Server} />
      </div>

      <Tabs defaultValue="support">
        <TabsList>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="capacity">Capacity</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="support" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Tickets by priority</CardTitle>
                  <CardDescription>Where support demand is concentrated.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {support.byPriority.length ? (
                  <DonutBreakdown data={support.byPriority.map((row) => ({ label: titleCase(row.key), value: row.count }))} />
                ) : (
                  <EmptyState icon={LifeBuoy} title="No tickets" description="Support tickets will appear here." compact />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Workload by team member</CardTitle>
                  <CardDescription>Open, resolved and breached tickets per assignee.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {support.workload.length ? (
                  <ul className="divide-y divide-border/60">
                    {support.workload.slice(0, 8).map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                        <span className="truncate">{row.name ?? "Team member"}</span>
                        <span className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                          <span>{formatNumber(row.open)} open</span>
                          <span>{formatNumber(row.resolved)} resolved</span>
                          <span className={row.breached ? "text-rose-600 dark:text-rose-400" : ""}>{formatNumber(row.breached)} breached</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={Users} title="No workload data" description="Assign tickets to see the distribution." compact />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Ticket queue</CardTitle>
                <CardDescription>{formatNumber(tickets.length)} tickets in the current view — update status or priority inline.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filter by priority">
                  {PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {value ? titleCase(value) : "Any priority"}
                    </option>
                  ))}
                </select>
                <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
                  {TICKET_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {value ? titleCase(value) : "Any status"}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {tickets.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 text-left font-medium">Ticket</th>
                        <th className="py-2 text-left font-medium">Account</th>
                        <th className="py-2 text-left font-medium">Priority</th>
                        <th className="py-2 text-left font-medium">Status</th>
                        <th className="py-2 text-right font-medium">First response</th>
                        <th className="py-2 text-right font-medium">CSAT</th>
                        <th className="py-2 text-left font-medium">Opened</th>
                        <th className="py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {tickets.slice(0, 40).map((ticket) => (
                        <tr key={ticket.id} className="transition-colors hover:bg-muted/30">
                          <td className="py-2.5">
                            <Link href={`/operations/tickets/${ticket.id}`} className="block">
                              <span className="flex items-center gap-2">
                                <span className="tabular text-2xs text-muted-foreground">{ticket.reference}</span>
                                {ticket.slaBreached ? <Badge variant="danger" className="h-4 px-1.5 text-[10px]">SLA</Badge> : null}
                              </span>
                              <span className="mt-0.5 block max-w-[280px] truncate font-medium">{ticket.subject}</span>
                            </Link>
                          </td>
                          <td className="py-2.5 text-xs">
                            {ticket.customer ? (
                              <Link href={`/customers/${ticket.customer.id}`} className="hover:underline">
                                {ticket.customer.name}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2.5">
                            <select
                              className="h-7 rounded-md border border-input bg-background px-1.5 text-2xs"
                              value={ticket.priority}
                              disabled={updating === ticket.id}
                              onChange={(event) => {
                                setUpdating(ticket.id);
                                updateTicket.mutate({ id: ticket.id, priority: event.target.value });
                              }}
                              aria-label={`Priority for ${ticket.reference}`}
                            >
                              {PRIORITIES.filter(Boolean).map((value) => (
                                <option key={value} value={value}>
                                  {titleCase(value)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5">
                            <select
                              className="h-7 rounded-md border border-input bg-background px-1.5 text-2xs"
                              value={ticket.status}
                              disabled={updating === ticket.id}
                              onChange={(event) => {
                                setUpdating(ticket.id);
                                updateTicket.mutate({ id: ticket.id, status: event.target.value });
                              }}
                              aria-label={`Status for ${ticket.reference}`}
                            >
                              {TICKET_STATUSES.filter(Boolean).map((value) => (
                                <option key={value} value={value}>
                                  {titleCase(value)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="tabular py-2.5 text-right text-xs">{ticket.firstResponseMinutes ? `${ticket.firstResponseMinutes}m` : "—"}</td>
                          <td className="tabular py-2.5 text-right text-xs">{ticket.csatScore ? `${ticket.csatScore}/5` : "—"}</td>
                          <td className="py-2.5 text-xs text-muted-foreground">{relativeTime(ticket.openedAt)}</td>
                          <td className="py-2.5 text-right">
                            <Button asChild variant="ghost" size="sm" className="h-7">
                              <Link href={`/operations/tickets/${ticket.id}`}>Open</Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={LifeBuoy} title="No tickets match the filters" description="Clear the priority or status filter to see the full queue." action={{ label: "Clear filters", onClick: () => { setPriority(""); setStatus(""); } }} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Open tasks</CardTitle>
                <CardDescription>{formatNumber(data.tasks.overdue)} of {formatNumber(data.tasks.total)} past their due date.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.tasks.items.length ? (
                <ul className="divide-y divide-border/60">
                  {data.tasks.items.map((task) => (
                    <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">{task.subject}</p>
                        <p className="text-2xs text-muted-foreground">
                          {task.user?.name ?? "Unassigned"}
                          {task.customer ? ` · ${task.customer.name}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-2xs">
                        {task.priority ? <Badge variant="outline" className="font-normal">{titleCase(task.priority)}</Badge> : null}
                        <span className={task.isOverdue ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground"}>
                          {task.dueAt ? `${task.isOverdue ? "Overdue — " : "Due "}${formatDate(task.dueAt)}` : "No due date"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Wrench} title="No open tasks" description="Every follow-up is complete — the queue is clear." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capacity" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Activity mix</CardTitle>
                  <CardDescription>How logged time breaks down by activity type.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.capacity.byType.length ? (
                  <BarsByCategory data={data.capacity.byType.map((row) => ({ label: titleCase(row.key.replace(/_/g, " ")), value: row.count }))} height={260} horizontal color="#22d3ee" />
                ) : (
                  <EmptyState icon={Activity} title="No activity" description="Log activities to see the mix." compact />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Effort by team member</CardTitle>
                  <CardDescription>Logged activities per person in the period.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.capacity.byUser.length ? (
                  <BarsByCategory data={data.capacity.byUser.map((row) => ({ label: row.key.startsWith("usr") ? "Team member" : row.key, value: row.count }))} height={260} horizontal color="#a78bfa" />
                ) : (
                  <EmptyState icon={Users} title="No effort data" description="Activities carry the person who logged them." compact />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="automation" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Playbook reliability</CardTitle>
                  <CardDescription>Runs, failures and hours saved per automation.</CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/automations">Manage automations</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {data.automation.items.length ? (
                  <ul className="divide-y divide-border/60">
                    {data.automation.items.map((automation) => {
                      const reliability = automation.runCount ? ((automation.runCount - automation.failureCount) / automation.runCount) * 100 : 100;
                      return (
                        <li key={automation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <Link href={`/automations/${automation.id}`} className="text-[13px] font-medium hover:underline">
                              {automation.name}
                            </Link>
                            <p className="text-2xs text-muted-foreground">
                              {titleCase(automation.triggerType.replace(/_/g, " "))} · last run {automation.lastRunAt ? relativeTime(automation.lastRunAt) : "never"}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3 text-2xs">
                            <StatusPill value={automation.status} />
                            <span className="text-muted-foreground">{formatNumber(automation.runCount)} runs</span>
                            <span className={reliability < 85 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>{formatPercent(reliability)} reliable</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState icon={Bot} title="No automations" description="Create a playbook to automate follow-ups." action={{ label: "Open automations", href: "/automations" }} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Recent runs</CardTitle>
                  <CardDescription>The last executions recorded.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.automation.recent.length ? (
                  <ul className="space-y-2.5">
                    {data.automation.recent.slice(0, 10).map((run) => (
                      <li key={run.id} className="flex items-start justify-between gap-3 text-xs">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{run.automation?.name ?? "Automation"}</span>
                          <span className="block text-2xs text-muted-foreground">
                            {relativeTime(run.startedAt)}
                            {run.durationMs ? ` · ${run.durationMs}ms` : ""}
                          </span>
                        </span>
                        <StatusPill value={run.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={Bot} title="No runs yet" description="Activate a playbook to start recording executions." compact />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Efficiency inputs</CardTitle>
                <CardDescription>The five operations levers that produce the Operational Efficiency KPI.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ScoreBars
                factors={[
                  {
                    label: "SLA adherence",
                    score: 100 - support.breachRate,
                    weight: 0.3,
                    detail: `${formatNumber(support.breached)} of ${formatNumber(support.total)} tickets breached their target`,
                  },
                  {
                    label: "Automation coverage",
                    score: data.automation.total ? Math.min(100, (data.automation.active / data.automation.total) * 120) : 40,
                    weight: 0.15,
                    detail: `${data.automation.active} of ${data.automation.total} playbooks active`,
                  },
                  {
                    label: "Automation reliability",
                    score: 100 - data.automation.failureRate,
                    weight: 0.15,
                    detail: `${formatNumber(data.automation.runs)} runs at ${formatPercent(100 - data.automation.failureRate)} success`,
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Background jobs</CardTitle>
                <CardDescription>
                  Queued and completed work — digests, rollups, syncs and automation sweeps, executed by <span className="font-mono text-2xs">npm run worker</span>.
                </CardDescription>
              </div>
              <CardToolbar>
                <Button size="sm" variant="outline" className="h-8" disabled={!jobsMeta?.canManage} onClick={() => setQueueOpen(true)}>
                  <Plus className="size-3.5" />
                  Queue a job
                </Button>
              </CardToolbar>
            </CardHeader>
            <CardContent>
              {data.jobs.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 text-left font-medium">Job</th>
                        <th className="py-2 text-left font-medium">Type</th>
                        <th className="py-2 text-left font-medium">Status</th>
                        <th className="py-2 text-right font-medium">Attempts</th>
                        <th className="py-2 text-left font-medium">Scheduled</th>
                        <th className="py-2 text-right font-medium">Duration</th>
                        <th className="py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {data.jobs.map((job) => (
                        <tr key={job.id}>
                          <td className="py-2.5">
                            <span className="font-mono text-2xs">{job.name}</span>
                            {job.lastError ? <span className="mt-0.5 block text-2xs text-rose-600 dark:text-rose-400">{job.lastError}</span> : null}
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground">{titleCase(job.type)}</td>
                          <td className="py-2.5">
                            <StatusPill value={job.status} />
                          </td>
                          <td className="tabular py-2.5 text-right text-xs">
                            {job.attempts}/{job.maxAttempts}
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground">{formatDate(job.scheduledFor)}</td>
                          <td className="tabular py-2.5 text-right text-xs">{job.durationMs ? `${job.durationMs}ms` : "—"}</td>
                          <td className="py-2.5 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-2xs"
                              disabled={!jobsMeta?.canManage || job.status === "RUNNING" || (runJob.isPending && runJob.variables?.id === job.id)}
                              onClick={() => runJob.mutate({ id: job.id })}
                            >
                              {runJob.isPending && runJob.variables?.id === job.id ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                              Run now
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={Server} title="No jobs queued" description="Background work will appear here as schedules fire." />
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <div>
                <CardTitle>Queue health</CardTitle>
                <CardDescription>Scheduler throughput and retry pressure.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <InfoRow label="Pending" value={formatNumber(data.jobs.filter((job) => job.status === "PENDING").length)} />
              <InfoRow label="Succeeded" value={formatNumber(data.jobs.filter((job) => job.status === "SUCCEEDED").length)} tone="positive" />
              <InfoRow label="Failed" value={formatNumber(data.jobs.filter((job) => job.status === "FAILED").length)} tone="danger" />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <div>
                <CardTitle>Worker handlers</CardTitle>
                <CardDescription>What the worker knows how to execute, and how often each handler is meant to run.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {(jobsMeta?.handlers ?? []).map((handler) => (
                <div key={handler.name} className="rounded-lg border border-border/70 bg-surface-sunken p-3">
                  <p className="font-mono text-2xs font-medium">{handler.name}</p>
                  <p className="mt-1 text-2xs text-muted-foreground">{handler.description}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusPill value={handler.type} />
                    <span className="text-2xs text-muted-foreground">{handler.cadence}</span>
                  </div>
                </div>
              ))}
              {jobsMeta && !jobsMeta.handlers.length ? (
                <p className="text-xs text-muted-foreground">No handlers registered.</p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Queue a background job</DialogTitle>
            <DialogDescription>
              The job is written to the queue and picked up by <span className="font-mono text-2xs">npm run worker</span>. Digest, billing and retention handlers run
              inline because they are cheap and idempotent.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Field>
              <Label htmlFor="job-name">Handler</Label>
              <NativeSelect
                id="job-name"
                value={queueForm.name}
                onChange={(event) => setQueueForm((current) => ({ ...current, name: event.target.value }))}
              >
                <option value="">Select a handler…</option>
                {(jobsMeta?.handlers ?? []).map((handler) => (
                  <option key={handler.name} value={handler.name}>
                    {handler.name} — {handler.title}
                  </option>
                ))}
              </NativeSelect>
              <FieldHint>{jobsMeta?.handlers.find((handler) => handler.name === queueForm.name)?.description ?? "Pick the work to run."}</FieldHint>
            </Field>

            {queueForm.name.includes("*") ? (
              <Field>
                <Label htmlFor="job-provider">Provider segment</Label>
                <Input
                  id="job-provider"
                  value={queueForm.provider}
                  placeholder="salesforce"
                  onChange={(event) => setQueueForm((current) => ({ ...current, provider: event.target.value }))}
                />
                <FieldHint>Replaces the <span className="font-mono">*</span> in the handler name — e.g. salesforce, hubspot, stripe.</FieldHint>
              </Field>
            ) : null}

            <Field>
              <Label htmlFor="job-delay">Delay (seconds)</Label>
              <Input
                id="job-delay"
                type="number"
                min={0}
                max={86400}
                value={queueForm.delaySeconds}
                onChange={(event) => setQueueForm((current) => ({ ...current, delaySeconds: Number(event.target.value) }))}
              />
              <FieldHint>0 queues it for the next worker tick.</FieldHint>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setQueueOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!queueForm.name || queueJob.isPending}
              onClick={() =>
                queueJob.mutate({
                  name: queueForm.name.includes("*")
                    ? queueForm.name.replace("*", queueForm.provider.trim() || "unknown")
                    : queueForm.name,
                  delaySeconds: queueForm.delaySeconds,
                })
              }
            >
              {queueJob.isPending ? "Queueing…" : "Queue job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
