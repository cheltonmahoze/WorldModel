"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { ArrowLeft, Building2, History, Loader2, ShieldAlert, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { InlineError, PriorityBadge, StageBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Label } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiMutation, useApiQuery, qk } from "@/hooks/use-api";
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber, relativeTime, titleCase } from "@/lib/utils";

const OPEN_STAGES = ["DISCOVERY", "QUALIFICATION", "PROPOSAL", "NEGOTIATION"];
const ALL_STAGES = [...OPEN_STAGES, "WON", "LOST"];

type Deal = {
  id: string;
  code: string;
  name: string;
  stage: string;
  type: string;
  source: string;
  amount: number;
  weightedAmount: number;
  probability: number;
  aiScore: number;
  expectedCloseDate: string | null;
  stageEnteredAt: string;
  daysInStage: number;
  lastActivityAt: string | null;
  activityCount: number;
  nextStep: string | null;
  nextStepDueAt: string | null;
  competitor: string | null;
  lossReason: string | null;
  productLine: string | null;
  dealRegion: string | null;
  forecastCategory: string;
  customer: { id: string; name: string; segment: string; healthScore: number; arr: number } | null;
  owner: { id: string; name: string; jobTitle: string | null } | null;
};

type DetailResponse = {
  opportunity: Deal;
  activities: { id: string; type: string; subject: string; outcome: string | null; occurredAt: string; user: { name: string } | null; contact: { firstName: string; lastName: string } | null }[];
  risks: { id: string; title: string; severity: string; status: string; impact: number; riskScore: number }[];
  siblings: { id: string; name: string; code: string; stage: string; amount: number }[];
};

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const query = useApiQuery<DetailResponse>(qk.opportunity(params.id), `/api/opportunities/${params.id}`);
  const [stage, setStage] = React.useState("");
  const [nextStep, setNextStep] = React.useState("");
  const [nextStepDueAt, setNextStepDueAt] = React.useState("");
  const [note, setNote] = React.useState("");

  const changeStage = useApiMutation<{ id: string; stage: string; amount: number }, { stage: string; note?: string; lossReason?: string }>({
    path: `/api/opportunities/${params.id}/stage`,
    invalidate: [["opportunities"], qk.opportunity(params.id), qk.dashboard, ["revenue"], ["analytics"], ["risks"], qk.notificationCount],
    successMessage: (data) => `Deal moved to ${titleCase(data.stage)} — forecast and metrics recomputed.`,
    onSuccess: () => {
      setStage("");
      setNote("");
    },
  });

  const update = useApiMutation<Deal, { nextStep?: string; nextStepDueAt?: string }>({
    path: `/api/opportunities/${params.id}`,
    method: "PATCH",
    invalidate: [["opportunities"], qk.opportunity(params.id), qk.dashboard],
    successMessage: "Opportunity updated.",
    onSuccess: () => {
      setNextStep("");
      setNextStepDueAt("");
    },
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-80" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Opportunity not found" description="It may have been deleted or belongs to another organization." />
        <InlineError message={query.error?.message ?? "We could not load this opportunity."} onRetry={() => query.refetch()} />
        <Button asChild variant="outline" size="sm">
          <Link href="/opportunities">
            <ArrowLeft className="size-3.5" /> Back to pipeline
          </Link>
        </Button>
      </div>
    );
  }

  const { opportunity: deal, activities, risks, siblings } = query.data.data;
  const open = OPEN_STAGES.includes(deal.stage);
  const stalled = open && (!deal.lastActivityAt || new Date(deal.lastActivityAt).getTime() < Date.now() - 14 * 86_400_000);

  return (
    <div className="space-y-6">
      <Link href="/opportunities" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Pipeline
      </Link>

      <PageHeader
        eyebrow={`${deal.code} · ${titleCase(deal.type)} · ${deal.source.replace(/_/g, " ").toLowerCase()}`}
        title={deal.name}
        description={
          <>
            {formatCurrency(deal.amount)} at {deal.probability}% probability · weighted {formatCompactCurrency(deal.weightedAmount)}
            {stalled ? <span className="ml-3 text-amber-600 dark:text-amber-400">No activity {deal.lastActivityAt ? `for ${relativeTime(deal.lastActivityAt)}` : "yet"}</span> : null}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <StageBadge value={deal.stage} className="h-7 px-2.5 text-xs" />
            <PriorityBadge value={deal.aiScore >= 75 ? "HIGH" : deal.aiScore >= 50 ? "MEDIUM" : "LOW"} className="h-7 px-2.5 text-xs" />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Deal facts</CardTitle>
                <CardDescription>Read straight from the record.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Fact label="Amount" value={formatCurrency(deal.amount)} />
              <Fact label="Weighted" value={formatCurrency(deal.weightedAmount)} />
              <Fact label="Expected close" value={deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "Not set"} />
              <Fact label="Days in stage" value={formatNumber(deal.daysInStage)} />
              <Fact label="Activities logged" value={formatNumber(deal.activityCount)} />
              <Fact label="AI score" value={String(deal.aiScore)} />
              <Fact label="Product line" value={deal.productLine ?? "—"} />
              <Fact label="Region" value={deal.dealRegion ?? "—"} />
              <Fact label="Forecast category" value={titleCase(deal.forecastCategory)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Activity history</CardTitle>
                <CardDescription>{activities.length ? `${activities.length} touchpoints on this deal` : "No touchpoints logged yet"}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {activities.length ? (
                <ol className="relative space-y-4 border-l border-border/70 pl-4">
                  {activities.map((activity) => (
                    <li key={activity.id} className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{activity.type.replace(/_/g, " ")}</span>
                        <span className="text-2xs text-muted-foreground">{relativeTime(activity.occurredAt)}</span>
                      </div>
                      <p className="text-[13px] font-medium">{activity.subject}</p>
                      <p className="text-2xs text-muted-foreground">
                        {activity.user?.name ?? "Unassigned"}
                        {activity.contact ? ` · ${activity.contact.firstName} ${activity.contact.lastName}` : ""}
                        {activity.outcome ? ` · ${activity.outcome}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState icon={History} title="No activity yet" description="Log a call, email or meeting to build the deal timeline." compact />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {deal.customer ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="size-4" /> Account
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <Link href={`/customers/${deal.customer.id}`} className="block font-medium hover:underline">
                  {deal.customer.name}
                </Link>
                <p className="text-muted-foreground">
                  {titleCase(deal.customer.segment)} · {formatCurrency(deal.customer.arr)} ARR · health {deal.customer.healthScore}/100
                </p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/customers/${deal.customer.id}`}>Open 360° view</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Move this deal</CardTitle>
                <CardDescription>Stage changes recompute forecast, win rate and metrics immediately.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field>
                <Label htmlFor="deal-stage">New stage</Label>
                <NativeSelect id="deal-stage" value={stage} onChange={(event) => setStage(event.target.value)}>
                  <option value="">Keep “{titleCase(deal.stage)}”</option>
                  {ALL_STAGES.filter((option) => option !== deal.stage).map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <Label htmlFor="deal-note">{stage === "LOST" ? "Loss reason" : "Note (optional)"}</Label>
                {stage === "LOST" ? (
                  <Input id="deal-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Price, competitor, timing…" />
                ) : (
                  <Textarea id="deal-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Context logged against the deal timeline" />
                )}
              </Field>
              <Button
                size="sm"
                className="w-full"
                disabled={!stage || changeStage.isPending}
                onClick={() => changeStage.mutate({ stage, note: note || undefined, lossReason: stage === "LOST" ? note || "Not specified" : undefined })}
              >
                {changeStage.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Apply stage change
              </Button>

              <div className="h-px w-full bg-border/70" />

              <Field>
                <Label htmlFor="deal-next">Next step</Label>
                <Input id="deal-next" value={nextStep} onChange={(event) => setNextStep(event.target.value)} placeholder={deal.nextStep ?? "Agree the next action with the buyer"} />
              </Field>
              <Field>
                <Label htmlFor="deal-next-date">Next step due</Label>
                <Input id="deal-next-date" type="date" value={nextStepDueAt} onChange={(event) => setNextStepDueAt(event.target.value)} />
              </Field>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={(!nextStep && !nextStepDueAt) || update.isPending}
                onClick={() => update.mutate({ nextStep: nextStep || undefined, nextStepDueAt: nextStepDueAt || undefined })}
              >
                {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Save next step
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="size-4" /> Risks on this deal
                </CardTitle>
                <CardDescription>{risks.length ? `${risks.length} open` : "None detected"}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {risks.length ? (
                risks.map((risk) => (
                  <Link key={risk.id} href={`/risks/${risk.id}`} className="block rounded-lg border border-border/70 p-2.5 transition-colors hover:bg-muted/40">
                    <div className="flex items-center gap-2">
                      <PriorityBadge value={risk.severity} />
                      <span className="text-2xs text-muted-foreground">{formatCompactCurrency(risk.impact)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs font-medium">{risk.title}</p>
                  </Link>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">The risk engine has not flagged anything on this opportunity.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-4" /> Owner
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs">
              <p className="font-medium">{deal.owner?.name ?? "Unassigned"}</p>
              <p className="text-2xs text-muted-foreground">{deal.owner?.jobTitle ?? "Sales"}</p>
              {siblings.length ? (
                <>
                  <div className="my-3 h-px w-full bg-border/70" />
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Other deals on this account</p>
                  <ul className="mt-2 space-y-1.5">
                    {siblings.slice(0, 4).map((sibling) => (
                      <li key={sibling.id}>
                        <Link href={`/opportunities/${sibling.id}`} className="flex items-center justify-between gap-2 text-2xs hover:underline">
                          <span className="truncate">
                            {sibling.code} · {titleCase(sibling.stage)}
                          </span>
                          <span className="tabular shrink-0">{formatCompactCurrency(sibling.amount)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </CardContent>
          </Card>

          {deal.lossReason ? (
            <Card>
              <CardContent className="p-4 text-xs">
                <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Loss reason</p>
                <p className="mt-1">{deal.lossReason}</p>
                {deal.competitor ? <p className="mt-1 text-muted-foreground">Competitor: {deal.competitor}</p> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface-sunken p-3">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
