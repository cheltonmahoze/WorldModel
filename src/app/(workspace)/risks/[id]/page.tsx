"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, CircleAlert, Loader2, ShieldAlert, User } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { InlineError, PriorityBadge, SeverityMeter, StatusPill } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Label } from "@/components/ui/label";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiMutation, useApiQuery, qk, toast } from "@/hooks/use-api";
import { formatCompactCurrency, formatCurrency, formatDate, formatDateTime, relativeTime, titleCase } from "@/lib/utils";

type Risk = {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  probability: number;
  impact: number;
  riskScore: number;
  mitigation: string | null;
  recommendation: string | null;
  detectedBy: string;
  fingerprint: string;
  detectedAt: string;
  dueAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  relatedCount: number;
  owner: { id: string; name: string; jobTitle: string | null } | null;
  customer: { id: string; name: string; arr: number; healthScore: number } | null;
  opportunity: { id: string; name: string; code: string; amount: number; stage: string } | null;
};

const STATUSES = ["OPEN", "MITIGATING", "MONITORING", "RESOLVED", "ACCEPTED"];

export default function RiskDetailPage() {
  const params = useParams<{ id: string }>();
  const risk = useApiQuery<Risk>(qk.risk(params.id), `/api/risks/${params.id}`);
  const [status, setStatus] = React.useState("");
  const [mitigation, setMitigation] = React.useState("");

  const update = useApiMutation<Risk, { status?: string; mitigation?: string; probability?: number; impact?: number }>({
    path: `/api/risks/${params.id}`,
    method: "PATCH",
    invalidate: [["risks"], qk.risk(params.id), qk.dashboard, ["intelligence"]],
    successMessage: "Risk updated — the register and dashboard now reflect the change.",
    onSuccess: () => {
      setStatus("");
      setMitigation("");
    },
  });

  if (risk.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (risk.isError || !risk.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Risk not found" description="This risk may have been deleted or belongs to another organization." />
        <InlineError message={risk.error?.message ?? "We could not load this risk."} onRetry={() => risk.refetch()} />
        <Button asChild variant="outline" size="sm">
          <Link href="/risks">
            <ArrowLeft className="size-3.5" /> Back to the register
          </Link>
        </Button>
      </div>
    );
  }

  const data = risk.data.data;
  const open = ["OPEN", "MITIGATING", "MONITORING"].includes(data.status);

  return (
    <div className="space-y-6">
      <Link href="/risks" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Risk register
      </Link>

      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <ShieldAlert className="size-3.5" /> {titleCase(data.category)} risk · detected {relativeTime(data.detectedAt)}
          </span>
        }
        title={data.title}
        description={data.description}
        actions={
          <div className="flex items-center gap-2">
            <PriorityBadge value={data.severity} className="h-7 px-2.5 text-xs" />
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
                <CardDescription>What the engine suggests doing, and why.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.recommendation ? (
                <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3.5 text-[13px] leading-relaxed">{data.recommendation}</div>
              ) : (
                <p className="text-xs text-muted-foreground">No recommendation recorded for this risk.</p>
              )}

              {data.mitigation ? (
                <div className="space-y-1.5">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mitigation in place</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{data.mitigation}</p>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <Facts label="Probability" value={`${data.probability}%`} />
                <Facts label="Financial impact" value={formatCompactCurrency(data.impact)} />
                <Facts label="Related records" value={String(data.relatedCount)} />
              </div>

              <SeparatorBlock />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Accountable owner</p>
                  {data.owner ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="grid size-7 place-items-center rounded-full bg-muted text-2xs font-medium">{data.owner.name.slice(0, 1)}</span>
                      <span>
                        <span className="block font-medium">{data.owner.name}</span>
                        <span className="block text-2xs text-muted-foreground">{data.owner.jobTitle ?? "Owner"}</span>
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Unassigned</p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Timeline</p>
                  <ul className="space-y-1 text-2xs text-muted-foreground">
                    <li>Detected {formatDateTime(data.detectedAt)}</li>
                    <li>Logged {formatDateTime(data.createdAt)}</li>
                    {data.dueAt ? (
                      <li className={new Date(data.dueAt) < new Date() && open ? "text-rose-600 dark:text-rose-400" : undefined}>
                        Review due {formatDate(data.dueAt)} {new Date(data.dueAt) < new Date() && open ? "· overdue" : ""}
                      </li>
                    ) : null}
                    {data.resolvedAt ? <li className="text-emerald-600 dark:text-emerald-400">Resolved {formatDateTime(data.resolvedAt)}</li> : null}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Update the register</CardTitle>
                <CardDescription>Changes are written to the audit trail with your name on them.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <Label htmlFor="risk-status">Status</Label>
                  <NativeSelect id="risk-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="">Keep “{titleCase(data.status)}”</option>
                    {STATUSES.filter((option) => option !== data.status).map((option) => (
                      <option key={option} value={option}>
                        {titleCase(option)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <Label htmlFor="risk-owner">Owner</Label>
                  <NativeSelect id="risk-owner" value={data.owner?.id ?? ""} disabled>
                    <option value={data.owner?.id ?? ""}>{data.owner?.name ?? "Unassigned"}</option>
                  </NativeSelect>
                </Field>
              </div>
              <Field>
                <Label htmlFor="risk-mitigation">Mitigation note</Label>
                <Textarea id="risk-mitigation" rows={3} value={mitigation} onChange={(event) => setMitigation(event.target.value)} placeholder="What are we doing about this, and by when?" />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={update.isPending || (!status && !mitigation)}
                  onClick={() => update.mutate({ status: status || undefined, mitigation: mitigation || undefined })}
                >
                  {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Save changes
                </Button>
                {open ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ status: "RESOLVED", mitigation: mitigation || undefined })}
                  >
                    <CheckCircle2 className="size-3.5" /> Mark resolved
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ status: "OPEN" })}>
                    Reopen
                  </Button>
                )}
                {!status && !mitigation ? <span className="text-2xs text-muted-foreground">Nothing to save yet.</span> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Risk score</CardTitle>
                <CardDescription>Impact weighted by probability, scored 0–100.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="tabular text-3xl font-semibold leading-none">{data.riskScore}</span>
                <span className="text-xs text-muted-foreground">/ 100 · {titleCase(data.severity)}</span>
              </div>
              <SeverityMeter score={data.riskScore} label="Severity" />
              <div className="space-y-1 text-2xs text-muted-foreground">
                <p>Detected by <span className="text-foreground">{data.detectedBy.replace(/_/g, " ")}</span></p>
                <p>Detection key <span className="font-mono text-foreground">{data.fingerprint.replace(/[:.]/g, "-").slice(0, 24)}</span></p>
              </div>
            </CardContent>
          </Card>

          {data.customer ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Related account</CardTitle>
                  <CardDescription>The commercial context behind this risk.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <Link href={`/customers/${data.customer.id}`} className="block font-medium hover:underline">
                  {data.customer.name}
                </Link>
                <p className="text-muted-foreground">
                  {formatCurrency(data.customer.arr)} ARR · health {data.customer.healthScore}/100
                </p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/customers/${data.customer.id}`}>Open 360° account view</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {data.opportunity ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Related opportunity</CardTitle>
                  <CardDescription>
                    {data.opportunity.code} · {titleCase(data.opportunity.stage)}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="font-medium">{data.opportunity.name}</p>
                <p className="text-muted-foreground">{formatCurrency(data.opportunity.amount)}</p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/opportunities/${data.opportunity.id}`}>Open opportunity</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="size-4" /> What happens next
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs text-muted-foreground">
              <p className="flex gap-2">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                Risks stay in the register until their status is Resolved or Accepted, so nothing is quietly forgotten.
              </p>
              <p className="flex gap-2">
                <User className="mt-0.5 size-3.5 shrink-0" />
                Owners are notified when a risk moves to Critical; the notification links back to this page.
              </p>
              <p className="flex gap-2">
                <Badge variant="neutral" className="h-4 shrink-0 px-1.5 text-[10px]">
                  {data.status === "RESOLVED" ? "Closed" : "Active"}
                </Badge>
                Re-running the engines will refresh this detection if the underlying signal changes.
              </p>
            </CardContent>
          </Card>

          {!data.customer && !data.opportunity ? (
            <Card>
              <CardContent className="p-4">
                <EmptyState icon={CircleAlert} title="No linked record" description="This risk is portfolio-level: it affects several accounts rather than a single one." compact />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Facts({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface-sunken p-3">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

function SeparatorBlock() {
  return <div className="h-px w-full bg-border/70" />;
}
