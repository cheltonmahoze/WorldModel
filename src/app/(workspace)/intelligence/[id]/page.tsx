"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { ArrowLeft, CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { InlineError, PriorityBadge, StatusPill } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Label } from "@/components/ui/label";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useApiMutation, useApiQuery, qk } from "@/hooks/use-api";
import { formatCompactCurrency, formatDateTime, formatNumber, relativeTime, titleCase } from "@/lib/utils";

type Insight = {
  id: string;
  title: string;
  summary: string;
  category: string;
  priority: string;
  priorityScore: number;
  confidence: number;
  estimatedImpact: number;
  impactScope: string | null;
  source: string;
  signal: Record<string, unknown> | null;
  recommendation: string | null;
  actions: { label: string; href?: string; action?: string }[] | null;
  status: string;
  relatedCount: number;
  fingerprint: string;
  reviewNotes: string | null;
  detectedAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
  owner: { id: string; name: string } | null;
};

const STATUSES = ["DETECTED", "REVIEWING", "IN_PROGRESS", "COMPLETED", "DISMISSED"];

const CATEGORY_LABEL: Record<string, string> = {
  REVENUE_OPPORTUNITY: "Revenue opportunity",
  COST_REDUCTION: "Cost reduction",
  CUSTOMER_RETENTION: "Customer retention",
  SALES_ACCELERATION: "Sales acceleration",
  OPERATIONAL_EFFICIENCY: "Operational efficiency",
  RISK_PREVENTION: "Risk prevention",
};

export default function InsightDetailPage() {
  const params = useParams<{ id: string }>();
  const insight = useApiQuery<Insight>(qk.insight(params.id), `/api/insights/${params.id}`);
  const [status, setStatus] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const update = useApiMutation<Insight, { status?: string; reviewNotes?: string }>({
    path: `/api/insights/${params.id}`,
    method: "PATCH",
    invalidate: [["insights"], qk.insight(params.id), qk.dashboard, ["intelligence"], qk.notificationCount],
    successMessage: "Opportunity updated.",
    onSuccess: () => {
      setStatus("");
      setNotes("");
    },
  });

  if (insight.isLoading) {
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

  if (insight.isError || !insight.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Opportunity not found" description="It may have been dismissed or archived." />
        <InlineError message={insight.error?.message ?? "We could not load this opportunity."} onRetry={() => insight.refetch()} />
        <Button asChild variant="outline" size="sm">
          <Link href="/intelligence">
            <ArrowLeft className="size-3.5" /> Back to intelligence
          </Link>
        </Button>
      </div>
    );
  }

  const data = insight.data.data;
  const signals = Object.entries(data.signal ?? {}).filter(([, value]) => typeof value !== "object");

  return (
    <div className="space-y-6">
      <Link href="/intelligence" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Nexus Intelligence
      </Link>

      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <Sparkles className="size-3.5" /> {CATEGORY_LABEL[data.category] ?? titleCase(data.category)} · detected {relativeTime(data.detectedAt)}
          </span>
        }
        title={data.title}
        description={data.summary}
        actions={
          <div className="flex items-center gap-2">
            <PriorityBadge value={data.priority} className="h-7 px-2.5 text-xs" />
            <StatusPill value={data.status} className="h-7 px-2.5 text-xs" />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recommended action</CardTitle>
                <CardDescription>One clear move, with the expected value attached.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3.5 text-[13px] leading-relaxed">
                {data.recommendation ?? "Review the underlying records and decide the next step."}
              </div>

              {data.actions?.length ? (
                <div className="flex flex-wrap gap-2">
                  {data.actions.map((action) =>
                    action.href ? (
                      <Button key={action.label} asChild size="sm">
                        <Link href={action.href}>{action.label}</Link>
                      </Button>
                    ) : (
                      <Button key={action.label} size="sm" variant="outline" disabled title="Available from the Automations module">
                        {action.label}
                      </Button>
                    ),
                  )}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <Fact label="Estimated impact" value={formatCompactCurrency(data.estimatedImpact)} tone="positive" />
                <Fact label="Confidence" value={`${data.confidence}%`} />
                <Fact label="Affected records" value={formatNumber(data.relatedCount)} />
              </div>

              {signals.length ? (
                <>
                  <div className="h-px w-full bg-border/70" />
                  <div className="space-y-2">
                    <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Signals behind this finding</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {signals.map(([key, value]) => (
                        <li key={key} className="flex items-baseline justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-xs">
                          <span className="text-muted-foreground">{titleCase(key.replace(/([A-Z])/g, " $1"))}</span>
                          <span className="tabular font-medium">{typeof value === "number" ? formatNumber(value) : String(value)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Workflow</CardTitle>
                <CardDescription>Move it through review, record what you decided. It stays auditable either way.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <Label htmlFor="insight-status">Status</Label>
                  <NativeSelect id="insight-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="">Keep “{titleCase(data.status)}”</option>
                    {STATUSES.filter((option) => option !== data.status).map((option) => (
                      <option key={option} value={option}>
                        {titleCase(option)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <Label>Priority score</Label>
                  <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
                    <span className="tabular font-medium">{data.priorityScore}</span>
                    <span className="ml-2 text-2xs text-muted-foreground">/ 100</span>
                  </div>
                </Field>
              </div>
              <Field>
                <Label htmlFor="insight-notes">Review notes</Label>
                <Textarea id="insight-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What did we decide, and who owns it?" />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={update.isPending || (!status && !notes)} onClick={() => update.mutate({ status: status || undefined, reviewNotes: notes || undefined })}>
                  {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Save
                </Button>
                <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ status: "IN_PROGRESS", reviewNotes: notes || undefined })}>
                  <CheckCircle2 className="size-3.5" /> Accept & start
                </Button>
                <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => update.mutate({ status: "DISMISSED", reviewNotes: notes || undefined })}>
                  <XCircle className="size-3.5" /> Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Provenance</CardTitle>
                <CardDescription>Where this finding came from and how it is keyed.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <Row label="Engine" value={data.source.replace(/_/g, " ")} />
              <Row label="Impact scope" value={data.impactScope ? titleCase(data.impactScope) : "Organization"} />
              <Row label="Detection key" value={data.fingerprint} mono />
              <Separator />
              <ul className="space-y-1.5 text-2xs text-muted-foreground">
                <li>Detected {formatDateTime(data.detectedAt)}</li>
                {data.acknowledgedAt ? <li>Acknowledged {formatDateTime(data.acknowledgedAt)}</li> : null}
                {data.completedAt ? <li className="text-emerald-600 dark:text-emerald-400">Completed {formatDateTime(data.completedAt)}</li> : null}
                {data.dismissedAt ? <li>Dismissed {formatDateTime(data.dismissedAt)}</li> : null}
              </ul>
              <p className="text-2xs leading-relaxed text-muted-foreground">
                Re-running the engines keeps the same detection key, so your status and notes survive the next scan.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Owner</CardTitle>
                <CardDescription>Accountable person for this action.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="text-xs">
              {data.owner ? (
                <p className="font-medium">{data.owner.name}</p>
              ) : (
                <p className="text-muted-foreground">Unassigned — assign from the engine run or the risk register.</p>
              )}
              <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                <Link href="/team">Open team</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "positive" }) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface-sunken p-3">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`tabular mt-1 text-base font-semibold ${tone === "positive" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-2xs" : "font-medium"}>{value}</span>
    </div>
  );
}
