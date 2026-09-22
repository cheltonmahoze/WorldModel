"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { ArrowLeft, Building2, Clock, LifeBuoy, Loader2, MessageSquare, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { InlineError, PriorityBadge, StatusPill } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiMutation, useApiQuery, qk } from "@/hooks/use-api";
import { formatDateTime, relativeTime, titleCase } from "@/lib/utils";

type Ticket = {
  id: string;
  reference: string;
  subject: string;
  description: string | null;
  priority: string;
  status: string;
  channel: string | null;
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  slaTargetMinutes: number;
  slaBreached: boolean;
  csatScore: number | null;
  reopenedCount: number;
  openedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  customerId: string | null;
  assigneeId: string | null;
  customer?: { id: string; name: string; healthScore: number; arr: number } | null;
  assignee?: { id: string; name: string } | null;
};

const STATUSES = ["OPEN", "PENDING", "RESOLVED", "CLOSED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticket = useApiQuery<Ticket>(qk.ticket(params.id), `/api/tickets/${params.id}`);
  const [status, setStatus] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [csat, setCsat] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState("");

  const team = useApiQuery<{ members: { userId: string; user: { id: string; name: string } }[] }>(qk.team, "/api/team");

  const update = useApiMutation<Ticket, { status?: string; priority?: string; csatScore?: number | null; assigneeId?: string | null }>({
    path: `/api/tickets/${params.id}`,
    method: "PATCH",
    invalidate: [qk.ticket(params.id), ["operations"], qk.dashboard],
    successMessage: "Ticket updated.",
    onSuccess: () => {
      setStatus("");
      setPriority("");
      setCsat("");
      setAssigneeId("");
    },
  });

  if (ticket.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (ticket.isError || !ticket.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ticket not found" description="It may have been deleted or belongs to another organization." />
        <InlineError message={ticket.error?.message ?? "We could not load this ticket."} onRetry={() => ticket.refetch()} />
        <Button asChild variant="outline" size="sm">
          <Link href="/operations">
            <ArrowLeft className="size-3.5" /> Back to operations
          </Link>
        </Button>
      </div>
    );
  }

  const data = ticket.data.data;
  const breachedTarget = data.firstResponseMinutes !== null && data.firstResponseMinutes > data.slaTargetMinutes;

  return (
    <div className="space-y-6">
      <Link href="/operations" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Operations
      </Link>

      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <LifeBuoy className="size-3.5" /> {data.reference} · opened {relativeTime(data.openedAt)} · via {data.channel ?? "unspecified channel"}
          </span>
        }
        title={data.subject}
        description={`Target first response ${Math.round(data.slaTargetMinutes)} minutes${data.reopenedCount ? ` · reopened ${data.reopenedCount}×` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <PriorityBadge value={data.priority} className="h-7 px-2.5 text-xs" />
            <StatusPill value={data.status} className="h-7 px-2.5 text-xs" />
            {data.slaBreached ? <Badge variant="danger" className="h-7 px-2.5 text-xs">SLA breached</Badge> : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="size-4" /> Reported issue
                </CardTitle>
                <CardDescription>Submitted through the customer portal.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{data.description ?? "No description recorded."}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Update the ticket</CardTitle>
                <CardDescription>Changes are recorded in the audit trail with your name.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <Label htmlFor="ticket-status">Status</Label>
                  <NativeSelect id="ticket-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="">Keep “{titleCase(data.status)}”</option>
                    {STATUSES.filter((option) => option !== data.status).map((option) => (
                      <option key={option} value={option}>
                        {titleCase(option)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <Label htmlFor="ticket-priority">Priority</Label>
                  <NativeSelect id="ticket-priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
                    <option value="">Keep “{titleCase(data.priority)}”</option>
                    {PRIORITIES.filter((option) => option !== data.priority).map((option) => (
                      <option key={option} value={option}>
                        {titleCase(option)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <Label htmlFor="ticket-assignee">Assignee</Label>
                  <NativeSelect id="ticket-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                    <option value="">Keep “{data.assignee?.name ?? "Unassigned"}”</option>
                    {(team.data?.data.members ?? []).map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.user.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <Label htmlFor="ticket-csat">Customer satisfaction</Label>
                  <NativeSelect id="ticket-csat" value={csat} onChange={(event) => setCsat(event.target.value)}>
                    <option value="">{data.csatScore ? `Keep ${data.csatScore}/5` : "Not rated"}</option>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <option key={score} value={score}>
                        {score}/5
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={update.isPending || (!status && !priority && !csat && !assigneeId)}
                  onClick={() =>
                    update.mutate({
                      status: status || undefined,
                      priority: priority || undefined,
                      csatScore: csat ? Number(csat) : undefined,
                      assigneeId: assigneeId || undefined,
                    })
                  }
                >
                  {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Save changes
                </Button>
                {data.status !== "RESOLVED" ? (
                  <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ status: "RESOLVED" })}>
                    Mark resolved
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ status: "OPEN" })}>
                    Reopen
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="size-4" /> Service levels
                </CardTitle>
                <CardDescription>Response and resolution against the target.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Target first response</span>
                <span className="font-medium">{Math.round(data.slaTargetMinutes)} min</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Actual first response</span>
                <span className={breachedTarget || data.slaBreached ? "font-medium text-rose-600 dark:text-rose-400" : "font-medium"}>
                  {data.firstResponseMinutes ? `${data.firstResponseMinutes} min` : "—"}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Resolution time</span>
                <span className="font-medium">{data.resolutionMinutes ? `${Math.round(data.resolutionMinutes)} min` : "Open"}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">First response at</span>
                <span className="font-medium">{data.firstResponseAt ? formatDateTime(data.firstResponseAt) : "—"}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Resolved at</span>
                <span className="font-medium">{data.resolvedAt ? formatDateTime(data.resolvedAt) : "—"}</span>
              </div>
              {data.csatScore ? (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">CSAT</span>
                  <span className="font-medium">{data.csatScore}/5</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {data.customer ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="size-4" /> Account
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <Link href={`/customers/${data.customer.id}`} className="block font-medium hover:underline">
                  {data.customer.name}
                </Link>
                <p className="text-muted-foreground">Health {data.customer.healthScore}/100</p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/customers/${data.customer.id}`}>Open 360° view</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-4" /> Assignee
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs">
              <p className="font-medium">{data.assignee?.name ?? "Unassigned"}</p>
              <p className="text-2xs text-muted-foreground">Support queue</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
