"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, BellRing, CheckCheck, Inbox } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { qk, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { apiPatch } from "@/lib/api-client";
import { relativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  entityType: string | null;
  entityId: string | null;
  severity: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  OPPORTUNITY_DETECTED: "Opportunity detected",
  RISK_DETECTED: "Risk detected",
  TASK_ASSIGNED: "Task assigned",
  AUTOMATION_COMPLETED: "Automation completed",
  INTEGRATION_ERROR: "Integration error",
  REPORT_GENERATED: "Report generated",
  DEAL_STAGE_CHANGED: "Deal stage changed",
  INVITE_ACCEPTED: "Invite accepted",
  PLAN_LIMIT: "Plan limit",
  MENTION: "Mention",
};

export function NotificationCenter({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const queryClient = useQueryClient();

  const countQuery = useApiQuery<{ unread: number; total: number }>(
    qk.notificationCount,
    "/api/notifications/count",
    { refetchInterval: 60_000 },
  );

  const listQuery = useApiQuery<{ items: NotificationItem[]; unread: number }>(
    qk.notifications(filter),
    `/api/notifications?filter=${filter}&pageSize=30`,
    { enabled: open },
  );

  const markRead = useApiMutation<{ id: string }, { id: string }>({
    path: (variables) => `/api/notifications/${variables.id}/read`,
    method: "POST",
    invalidate: [qk.notificationCount, qk.notifications(filter)],
  });

  const markAllRead = useApiMutation<{ updated: number }, void>({
    path: "/api/notifications/read-all",
    method: "POST",
    invalidate: [qk.notificationCount, qk.notifications(filter)],
    successMessage: "All notifications marked as read",
  });

  const unread = countQuery.data?.data.unread ?? 0;
  const items = listQuery.data?.data.items ?? [];
  const grouped = useMemo(() => groupByDay(items), [items]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          {unread > 0 ? <BellRing className="size-4" /> : <Bell className="size-4" />}
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground tabular">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Notifications
            {unread > 0 ? <Badge variant="danger">{unread} unread</Badge> : <Badge variant="neutral">Inbox zero</Badge>}
          </SheetTitle>
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-surface-sunken/60 p-0.5">
              {(["all", "unread"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                    filter === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={unread === 0 || markAllRead.isPending}
              loading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          </div>
        </SheetHeader>

        <SheetBody className="px-0">
          {listQuery.isLoading ? (
            <div className="space-y-3 px-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : listQuery.isError ? (
            <div className="px-5">
              <EmptyState
                icon={Inbox}
                compact
                title="Notifications unavailable"
                description={listQuery.error.message}
                action={{ label: "Try again", onClick: () => void listQuery.refetch() }}
              />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Bell}
              compact
              title={filter === "unread" ? "Nothing unread" : "No notifications yet"}
              description={
                filter === "unread"
                  ? "You have read every notification. Switch to All to review history."
                  : "Nexus OS notifies you when opportunities, risks, automation runs and integration issues need a decision."
              }
            />
          ) : (
            <div className="divide-y divide-border/60">
              {grouped.map(([day, entries]) => (
                <div key={day}>
                  <p className="bg-surface-sunken/60 px-5 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {day}
                  </p>
                  {entries.map((item) => (
                    <div
                      key={item.id}
                      className={cn("group flex gap-3 px-5 py-3 transition-colors hover:bg-secondary/40", !item.readAt && "bg-primary/[0.03]")}
                    >
                      <StatusDot tone={toneFor(item)} pulse={!item.readAt && item.type === "RISK_DETECTED"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-medium leading-snug">{item.title}</p>
                          <span className="shrink-0 whitespace-nowrap text-2xs text-muted-foreground">
                            {relativeTime(item.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                        <div className="mt-1.5 flex items-center gap-3">
                          <span className="text-2xs uppercase tracking-wide text-muted-foreground/80">
                            {TYPE_LABELS[item.type] ?? item.type.replace(/_/g, " ").toLowerCase()}
                          </span>
                          {item.href ? (
                            <Link
                              href={item.href}
                              onClick={() => {
                                if (!item.readAt) markRead.mutate({ id: item.id });
                                setOpen(false);
                              }}
                              className="text-2xs font-medium text-primary hover:underline"
                            >
                              Open
                            </Link>
                          ) : null}
                          {!item.readAt ? (
                            <button
                              onClick={() => {
                                void apiPatch(`/api/notifications/${item.id}/read`, {}).then(() =>
                                  queryClient.invalidateQueries({ queryKey: qk.notificationCount }),
                                );
                              }}
                              className="text-2xs font-medium text-muted-foreground hover:text-foreground"
                            >
                              Mark read
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div className="px-5 py-4">
                <Button asChild variant="secondary" size="sm" className="w-full">
                  <Link href="/notifications" onClick={() => setOpen(false)}>
                    View all notifications
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function toneFor(item: NotificationItem) {
  if (item.type === "RISK_DETECTED" || item.type === "INTEGRATION_ERROR") return "danger" as const;
  if (item.type === "OPPORTUNITY_DETECTED" || item.type === "REPORT_GENERATED") return "primary" as const;
  if (item.type === "AUTOMATION_COMPLETED") return "success" as const;
  return "neutral" as const;
}

function groupByDay(items: NotificationItem[]) {
  const groups = new Map<string, NotificationItem[]>();
  for (const item of items) {
    const date = new Date(item.createdAt);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const label =
      date.toDateString() === today.toDateString()
        ? "Today"
        : date.toDateString() === yesterday.toDateString()
          ? "Yesterday"
          : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups.entries()];
}
