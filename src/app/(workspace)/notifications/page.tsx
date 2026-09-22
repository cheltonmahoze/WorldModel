"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BellRing,
  CheckCheck,
  FileText,
  Filter,
  Lightbulb,
  Plug,
  ShieldAlert,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { InlineError, StatCard, StatusPill, useCsvExport } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useApiMutation, useApiQuery, qk, toast } from "@/hooks/use-api";
import { cn, formatNumber, relativeTime, titleCase } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsPayload = {
  items: Notification[];
  unread: number;
  total: number;
  page: number;
  pageSize: number;
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  OPPORTUNITY_DETECTED: Lightbulb,
  RISK_DETECTED: ShieldAlert,
  TASK_ASSIGNED: CheckCheck,
  AUTOMATION_COMPLETED: Workflow,
  INTEGRATION_ERROR: Plug,
  REPORT_GENERATED: FileText,
  BRIEF_PUBLISHED: Sparkles,
  DEAL_UPDATED: ArrowUpRight,
  CUSTOMER_AT_RISK: AlertTriangle,
  SYSTEM: Bell,
};

const TYPE_LABELS: Record<string, string> = {
  OPPORTUNITY_DETECTED: "Opportunity detected",
  RISK_DETECTED: "Risk detected",
  TASK_ASSIGNED: "Task assigned",
  AUTOMATION_COMPLETED: "Automation completed",
  INTEGRATION_ERROR: "Integration error",
  REPORT_GENERATED: "Report generated",
  BRIEF_PUBLISHED: "Brief published",
  DEAL_UPDATED: "Deal updated",
  CUSTOMER_AT_RISK: "Customer at risk",
  SYSTEM: "System",
};

const SEVERITY_TONE: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "neutral",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "archived", label: "Archived" },
] as const;

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  opportunity: (id) => `/opportunities/${id}`,
  insight: (id) => `/intelligence/${id}`,
  risk: (id) => `/risks/${id}`,
  customer: (id) => `/customers/${id}`,
  ticket: (id) => `/operations/tickets/${id}`,
  automation: (id) => `/automations/${id}`,
  integration: () => `/integrations`,
  report: () => `/reports`,
  job: () => `/operations?tab=jobs`,
  notification: () => `/notifications`,
};

export default function NotificationsPage() {
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["key"]>("all");
  const [page, setPage] = React.useState(1);
  const [typeFilter, setTypeFilter] = React.useState("");
  const { exporting, run: runExport } = useCsvExport();

  const query = useApiQuery<NotificationsPayload>(qk.notifications(filter), `/api/notifications?filter=${filter}&page=${page}&pageSize=30`);
  const list = query.data?.data;
  const items = list?.items ?? [];

  const markRead = useApiMutation<{ id: string }, { id: string }>({
    path: (variables) => `/api/notifications/${variables.id}/read`,
    method: "POST",
    invalidate: [qk.notifications(filter), qk.notificationCount],
    successMessage: "Marked as read",
  });

  const markAll = useApiMutation<{ read: number }, Record<string, never>>({
    path: "/api/notifications/read-all",
    method: "POST",
    invalidate: [qk.notifications(filter), qk.notificationCount],
    onSuccess: (data) => toast.success(`${formatNumber(data.data.read)} notification(s) marked as read`),
  });

  const filtered = typeFilter ? items.filter((row) => row.type === typeFilter) : items;
  const typeCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of items) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const severe = items.filter((row) => row.severity === "HIGH" || row.severity === "CRITICAL").length;
  const pageCount = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notification centre"
        title="Everything that needs you"
        description="Opportunities detected, risks raised, tasks assigned, automation runs, integration failures and generated reports — routed to the right person, with the original entity one click away."
        actions={
          <Button size="sm" variant={list?.unread ? "default" : "outline"} disabled={!list?.unread || markAll.isPending} onClick={() => markAll.mutate({})}>
            <CheckCheck className="size-4" />
            {markAll.isPending ? "Marking…" : "Mark all as read"}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unread" value={formatNumber(list?.unread ?? 0)} hint="Across every module" icon={BellRing} tone={list?.unread ? "warning" : undefined} />
        <StatCard label="High severity" value={formatNumber(severe)} hint="HIGH or CRITICAL, this page" icon={AlertTriangle} tone={severe ? "danger" : undefined} />
        <StatCard label={filter === "all" ? "In this view" : `In “${filter}”`} value={formatNumber(list?.total ?? 0)} hint={`Page ${page} of ${pageCount}`} icon={Filter} />
        <StatCard label="Event types" value={formatNumber(typeCounts.length)} hint="Distinct producers on this page" icon={Workflow} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Notification stream</CardTitle>
            <CardDescription>{list ? `${formatNumber(list.total)} entries · newest first, unread on top` : "Loading…"}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((option) => (
              <Button
                key={option.key}
                size="sm"
                variant={filter === option.key ? "default" : "outline"}
                className="h-8"
                onClick={() => {
                  setFilter(option.key);
                  setPage(1);
                }}
              >
                {option.label}
                {option.key === "unread" && list?.unread ? <span className="ml-1.5 tabular text-2xs opacity-80">{list.unread}</span> : null}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={exporting || !filtered.length}
              onClick={() =>
                runExport(
                  `nexus-notifications-${filter}`,
                  filtered.map((row) => ({
                    createdAt: row.createdAt,
                    type: row.type,
                    severity: row.severity,
                    title: row.title,
                    body: row.body,
                    entity: row.entityType ? `${row.entityType}:${row.entityId ?? ""}` : "",
                    read: row.readAt ? "yes" : "no",
                  })),
                  ["createdAt", "type", "severity", "title", "body", "entity", "read"],
                )
              }
            >
              Export page
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {query.isError ? <InlineError message={query.error?.message ?? "Could not load notifications."} onRetry={() => query.refetch()} /> : null}

          {typeCounts.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                className={cn(
                  "rounded-md border px-2 py-1 text-2xs transition-colors",
                  typeFilter ? "border-border/70 text-muted-foreground hover:text-foreground" : "border-primary/40 bg-primary/10 text-foreground",
                )}
                onClick={() => setTypeFilter("")}
              >
                All types
              </button>
              {typeCounts.map(([type, count]) => (
                <button
                  key={type}
                  className={cn(
                    "rounded-md border px-2 py-1 text-2xs transition-colors",
                    typeFilter === type ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/70 text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setTypeFilter(typeFilter === type ? "" : type)}
                >
                  {TYPE_LABELS[type] ?? titleCase(type.toLowerCase())} · {count}
                </button>
              ))}
            </div>
          ) : null}

          {query.isLoading ? (
            <SkeletonTable rows={8} columns={4} />
          ) : filtered.length ? (
            <ul className="divide-y divide-border/60">
              {filtered.map((notification) => {
                const Icon = TYPE_ICONS[notification.type] ?? Bell;
                const target = notification.actionUrl ?? (notification.entityType && notification.entityId
                  ? ENTITY_ROUTES[notification.entityType]?.(notification.entityId)
                  : null);
                return (
                  <li key={notification.id} className={cn("flex flex-col gap-3 py-3.5 sm:flex-row sm:items-start", !notification.readAt && "bg-primary/[0.02]")}>
                    <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border", notification.readAt ? "border-border/70 bg-surface-sunken" : "border-primary/30 bg-primary/10")}>
                      <Icon className={cn("size-4", notification.readAt ? "text-muted-foreground" : "text-primary")} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn("text-sm", notification.readAt ? "font-medium text-muted-foreground" : "font-semibold")}>{notification.title}</p>
                        <Badge variant={SEVERITY_TONE[notification.severity] ?? "neutral"} className="h-4 px-1.5 text-[10px]">
                          {notification.severity}
                        </Badge>
                        {!notification.readAt ? <span className="size-1.5 rounded-full bg-primary" aria-label="Unread" /> : null}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{notification.body}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                        <span>{TYPE_LABELS[notification.type] ?? titleCase(notification.type.toLowerCase())}</span>
                        <span>{relativeTime(notification.createdAt)}</span>
                        {notification.entityType ? <StatusPill value={notification.entityType.toUpperCase()} /> : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 sm:mt-0.5">
                      {target ? (
                        <Button asChild size="sm" variant="outline" className="h-8">
                          <Link href={target} onClick={() => !notification.readAt && markRead.mutate({ id: notification.id })}>
                            Open
                            <ArrowUpRight className="size-3.5" />
                          </Link>
                        </Button>
                      ) : null}
                      {!notification.readAt ? (
                        <Button size="sm" variant="ghost" className="h-8" disabled={markRead.isPending} onClick={() => markRead.mutate({ id: notification.id })}>
                          Mark read
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={filter === "unread" ? CheckCheck : Bell}
              title={filter === "unread" ? "Inbox zero — nothing unread" : typeFilter ? "No notifications of that type on this page" : "No notifications yet"}
              description={
                filter === "unread"
                  ? "Every routed alert has been acknowledged. New detections land here the moment the engines run."
                  : "Opportunity detections, risk alerts, automation runs and generated reports will appear here with a link to the source entity."
              }
              action={typeFilter ? { label: "Clear type filter", onClick: () => setTypeFilter("") } : { label: "Run an intelligence scan", href: "/intelligence" }}
            />
          )}

          {pageCount > 1 ? (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>
                Page {page} of {pageCount}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" className="h-8" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>
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
            <CardTitle>Routing rules</CardTitle>
            <CardDescription>Which events reach this centre, and who they are addressed to.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { type: "OPPORTUNITY_DETECTED", audience: "Opportunity owner + managers", severity: "MEDIUM" },
              { type: "RISK_DETECTED", audience: "Risk owner + owners/admins", severity: "HIGH" },
              { type: "TASK_ASSIGNED", audience: "Assignee", severity: "LOW" },
              { type: "AUTOMATION_COMPLETED", audience: "Rule owner", severity: "LOW" },
              { type: "INTEGRATION_ERROR", audience: "Owners + admins", severity: "HIGH" },
              { type: "REPORT_GENERATED", audience: "Requester + recipients", severity: "LOW" },
            ].map((rule) => (
              <div key={rule.type} className="rounded-lg border border-border/70 bg-surface-sunken p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">{TYPE_LABELS[rule.type]}</p>
                  <Badge variant={SEVERITY_TONE[rule.severity] ?? "neutral"} className="h-4 px-1.5 text-[10px]">
                    {rule.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-2xs text-muted-foreground">{rule.audience}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-2xs text-muted-foreground">
            Delivery is resolved server-side from memberships, so a role change re-routes future alerts without touching the engine rules.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
