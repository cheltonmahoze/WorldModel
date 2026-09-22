"use client";

import Link from "next/link";
import * as React from "react";
import { Activity, Bot, Filter, Pause, Play, Plus, Sparkles, Workflow, Zap } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { InlineError, ModuleToolbar, StatCard, StatusPill } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { pageData, useApiMutation, useApiQuery, qk } from "@/hooks/use-api";
import { formatNumber, formatPercent, relativeTime, titleCase } from "@/lib/utils";

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
  _count: { executions: number };
};

type AutomationsResponse = {
  items: Automation[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
    summary: { active: number; paused: number; draft: number; hoursSaved: number };
    recentExecutions: { id: string; status: string; startedAt: string; durationMs: number | null; automation: { id: string; name: string } | null }[];
  };
};

const TEMPLATES: { name: string; description: string; triggerType: string; triggerConfig: Record<string, unknown>; conditions: { field: string; operator: string; value?: unknown }[]; actions: { type: string; config: Record<string, unknown> }[]; tags: string[] }[] = [
  {
    name: "Stalled deal escalation",
    description: "When a deal over €10,000 goes quiet for 7 days, alert the manager, open a task and post to Slack.",
    triggerType: "deal_inactive",
    triggerConfig: { inactiveDays: 7 },
    conditions: [{ field: "amount", operator: "greater_than", value: 10000 }],
    actions: [
      { type: "notify_role", config: { role: "MANAGER", title: "Deal stalled", body: "A qualified deal has had no activity for 7 days.", severity: "HIGH" } },
      { type: "create_task", config: { subject: "Re-engage stalled deal", dueInDays: 2, assigneeRole: "MANAGER" } },
      { type: "slack_message", config: { text: "Deal escalation: no activity for 7 days on a deal above €10,000." } },
    ],
    tags: ["pipeline", "escalation"],
  },
  {
    name: "Renewal defence",
    description: "60 days out from renewal, create the CS review task and notify the account owner.",
    triggerType: "customer_renewal_approaching",
    triggerConfig: { daysBefore: 60 },
    conditions: [],
    actions: [
      { type: "create_task", config: { subject: "Renewal value review", dueInDays: 5, assigneeRole: "MANAGER" } },
      { type: "notify_user", config: { title: "Renewal approaching", body: "Book the value review with the account.", severity: "MEDIUM" } },
    ],
    tags: ["retention"],
  },
  {
    name: "SLA breach recovery",
    description: "When a ticket breaches its SLA, escalate to the support lead and send the customer a status update.",
    triggerType: "ticket_sla_breached",
    triggerConfig: {},
    conditions: [],
    actions: [
      { type: "escalate", config: { title: "SLA breach", body: "Route to the senior pod and send a proactive update." } },
      { type: "send_email", config: { subject: "We are on it", body: "Your ticket has been escalated to a senior engineer." } },
    ],
    tags: ["support"],
  },
  {
    name: "Critical risk notification",
    description: "Any critical risk detected by the engines notifies the owner and its assignee immediately.",
    triggerType: "risk_detected",
    triggerConfig: { severity: "CRITICAL" },
    conditions: [],
    actions: [
      { type: "notify_role", config: { role: "ADMIN", title: "Critical risk detected", body: "Open the risk register and assign an owner.", severity: "CRITICAL" } },
      { type: "create_risk", config: { title: "Escalated from automation", description: "Automated escalation of a critical detection.", category: "OPERATIONAL", severity: "HIGH", probability: 70 } },
    ],
    tags: ["risk"],
  },
  {
    name: "Weekly pipeline digest",
    description: "Every Monday, summarise pipeline movement and send the digest to the leadership team.",
    triggerType: "schedule_weekly",
    triggerConfig: { dayOfWeek: 1, hour: 8 },
    conditions: [],
    actions: [
      { type: "send_email", config: { subject: "Weekly pipeline digest", body: "Pipeline movement, stalled deals and forecast coverage." } },
      { type: "notify_role", config: { role: "OWNER", title: "Weekly digest ready", body: "The pipeline digest has been published.", severity: "LOW" } },
    ],
    tags: ["reporting"],
  },
];

export default function AutomationsPage() {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [creating, setCreating] = React.useState<string | null>(null);
  const [toggling, setToggling] = React.useState<string | null>(null);

  const params = new URLSearchParams({ pageSize: "50" });
  if (query) params.set("q", query);
  if (status) params.set("status", status);

  const automations = useApiQuery<AutomationsResponse>(qk.automations({ query, status }), `/api/automations?${params.toString()}`);

  const create = useApiMutation<{ id: string }, (typeof TEMPLATES)[number] & { status: string }>({
    path: "/api/automations",
    invalidate: [["automations"], ["operations"], qk.dashboard],
    successMessage: (data, variables) => `“${variables.name}” created as ${variables.status.toLowerCase()}.`,
    onSuccess: () => setCreating(null),
    onError: () => setCreating(null),
  });

  const setAutomationStatus = useApiMutation<Automation, { id: string; status: string }>({
    path: (variables: { id: string }) => `/api/automations/${variables.id}`,
    method: "PATCH",
    invalidate: [["automations"], ["operations"], qk.dashboard],
    successMessage: (data, variables) => `Automation ${variables.status === "ACTIVE" ? "activated" : "paused"}.`,
    onSettled: () => setToggling(null),
  });

  const list = pageData<Automation, AutomationsResponse["meta"]>(automations.data);
  const items = list.items;
  const summary = list.meta?.summary;
  const recent = list.meta?.recentExecutions ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation engine"
        title="Automations"
        description="WHEN something happens, IF it matters, THEN do this. Every playbook runs against real records, writes to the audit trail and reports its own reliability."
        actions={
          <Button asChild size="sm">
            <Link href="/automations/new">
              <Plus className="size-3.5" /> New automation
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active playbooks" value={formatNumber(summary?.active ?? 0)} hint={`${formatNumber(summary?.paused ?? 0)} paused · ${formatNumber(summary?.draft ?? 0)} drafts`} icon={Play} />
        <StatCard label="Executions" value={formatNumber(items.reduce((acc, automation) => acc + automation.runCount, 0))} hint={`${formatNumber(recent.length)} recorded recently`} icon={Activity} />
        <StatCard
          label="Success rate"
          value={formatPercent(
            items.reduce((acc, automation) => acc + automation.runCount, 0)
              ? (items.reduce((acc, automation) => acc + automation.successCount, 0) / items.reduce((acc, automation) => acc + automation.runCount, 0)) * 100
              : 100,
          )}
          hint={`${formatNumber(items.reduce((acc, automation) => acc + automation.failureCount, 0))} failed runs`}
          tone={items.some((automation) => automation.runCount > 4 && automation.failureCount / automation.runCount > 0.15) ? "warning" : "positive"}
          icon={Zap}
        />
        <StatCard label="Hours saved" value={`${formatNumber(summary?.hoursSaved ?? 0)}h`} hint="Manual coordination removed by active playbooks" icon={Workflow} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Playbooks</CardTitle>
            <CardDescription>{list.meta?.total ?? 0} automations in this workspace</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModuleToolbar
            search={query}
            onSearch={setQuery}
            searchPlaceholder="Search automations…"
            filters={[
              {
                key: "status",
                label: "Status",
                value: status,
                options: [
                  { value: "", label: "Any status" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "PAUSED", label: "Paused" },
                  { value: "DRAFT", label: "Draft" },
                ],
              },
            ]}
            onFilter={(_, value) => setStatus(value)}
          />

          {automations.isError ? <InlineError message={automations.error?.message ?? "Could not load automations."} onRetry={() => automations.refetch()} /> : null}

          {automations.isLoading ? (
            <SkeletonTable rows={6} columns={5} />
          ) : items.length ? (
            <ul className="space-y-3">
              {items.map((automation) => {
                const reliability = automation.runCount ? ((automation.runCount - automation.failureCount) / automation.runCount) * 100 : 100;
                return (
                  <li key={automation.id} className="rounded-xl border border-border/70 p-4 transition-colors hover:border-border">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill value={automation.status} />
                          <span className="text-2xs text-muted-foreground">trigger: {titleCase(automation.triggerType.replace(/_/g, " "))}</span>
                          {automation.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <Link href={`/automations/${automation.id}`} className="block text-[13px] font-medium hover:underline">
                          {automation.name}
                        </Link>
                        {automation.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{automation.description}</p> : null}
                        <p className="text-2xs text-muted-foreground">
                          WHEN {titleCase(automation.triggerType.replace(/_/g, " "))}
                          {automation.conditions.length ? ` · IF ${automation.conditions.length} condition${automation.conditions.length === 1 ? "" : "s"}` : ""} · THEN{" "}
                          {automation.actions.map((action) => titleCase(action.type.replace(/_/g, " "))).join(" → ")}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                        <div className="flex items-center gap-4 text-2xs text-muted-foreground">
                          <span>{formatNumber(automation.runCount)} runs</span>
                          <span className={reliability < 85 && automation.runCount > 4 ? "font-medium text-amber-600 dark:text-amber-400" : ""}>{formatPercent(reliability)} reliable</span>
                          <span>{formatNumber(Math.round(automation.timeSavedMinutes / 60))}h saved</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button asChild variant="outline" size="sm" className="h-8">
                            <Link href={`/automations/${automation.id}`}>Configure</Link>
                          </Button>
                          {automation.status === "ACTIVE" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              disabled={toggling === automation.id}
                              onClick={() => {
                                setToggling(automation.id);
                                setAutomationStatus.mutate({ id: automation.id, status: "PAUSED" });
                              }}
                            >
                              <Pause className="size-3.5" /> Pause
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="h-8"
                              disabled={toggling === automation.id}
                              onClick={() => {
                                setToggling(automation.id);
                                setAutomationStatus.mutate({ id: automation.id, status: "ACTIVE" });
                              }}
                            >
                              <Play className="size-3.5" /> Activate
                            </Button>
                          )}
                        </div>
                        <span className="text-2xs text-muted-foreground">{automation.lastRunAt ? `Last run ${relativeTime(automation.lastRunAt)}` : "Never run"}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Filter}
              title="No automations match these filters"
              description="Clear the filters, or start from one of the templates below."
              action={{ label: "Clear filters", onClick: () => { setQuery(""); setStatus(""); } }}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4" /> Start from a template
              </CardTitle>
              <CardDescription>These create a real automation you can then edit, activate or delete.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {TEMPLATES.map((template) => (
              <div key={template.name} className="flex flex-col gap-2 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{template.name}</p>
                  <p className="line-clamp-2 text-2xs text-muted-foreground">{template.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8" disabled={creating === template.name} onClick={() => { setCreating(template.name); create.mutate({ ...template, status: "DRAFT" }); }}>
                    Create draft
                  </Button>
                  <Button size="sm" className="h-8" disabled={creating === template.name} onClick={() => { setCreating(template.name); create.mutate({ ...template, status: "ACTIVE" }); }}>
                    {creating === template.name ? "Creating…" : "Create & activate"}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent executions</CardTitle>
              <CardDescription>The engine's own log.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {recent.length ? (
              <ul className="space-y-3">
                {recent.slice(0, 10).map((execution) => (
                  <li key={execution.id} className="text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/automations/${execution.automation?.id ?? ""}`} className="truncate font-medium hover:underline">
                        {execution.automation?.name ?? "Automation"}
                      </Link>
                      <StatusPill value={execution.status} />
                    </div>
                    <p className="mt-0.5 text-2xs text-muted-foreground">
                      {relativeTime(execution.startedAt)}
                      {execution.durationMs ? ` · ${execution.durationMs}ms` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Activity} title="No executions yet" description="Activate a playbook to see it run." compact />
            )}
          </CardContent>
        </Card>
      </div>

      {items.some((automation) => automation.runCount > 4 && automation.failureCount / automation.runCount > 0.15) ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs">
            <span className="flex items-center gap-2">
              <Bot className="size-3.5 text-amber-500" />
              Some playbooks are failing more than 15% of the time — the reliability recommendations in Nexus Intelligence explain what to fix.
            </span>
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link href="/intelligence?category=OPERATIONAL_EFFICIENCY">Open recommendations</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
