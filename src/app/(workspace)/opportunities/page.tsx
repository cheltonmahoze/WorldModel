"use client";

import Link from "next/link";
import * as React from "react";
import { Filter, Plus, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { BarsByCategory } from "@/components/charts";
import { HealthBadge, InlineError, ModuleToolbar, StageBadge, StatCard, StatusPill, useCsvExport } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Label } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { SkeletonTable } from "@/components/ui/skeleton";
import { pageData, useApiMutation, useApiQuery, qk, toast } from "@/hooks/use-api";
import { useDebouncedValue } from "@/hooks/use-hotkey";
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber, relativeTime, titleCase } from "@/lib/utils";

type Opportunity = {
  id: string;
  code: string;
  name: string;
  stage: string;
  type: string;
  source: string;
  amount: number;
  weightedAmount: number;
  probability: number;
  expectedCloseDate: string | null;
  lastActivityAt: string | null;
  nextStep: string | null;
  nextStepDueAt: string | null;
  daysInStage: number;
  aiScore: number;
  productLine: string | null;
  dealRegion: string | null;
  stalled: boolean;
  customer: { id: string; name: string; segment: string; healthScore: number } | null;
  owner: { id: string; name: string; avatarUrl: string | null } | null;
};

type OpportunitiesResponse = {
  items: Opportunity[];
  meta: { total: number; page: number; pageSize: number; pageCount: number; byStage: { stage: string; count: number; value: number; weighted: number }[] };
};

const STAGE_OPTIONS = [
  { value: "", label: "All stages" },
  { value: "OPEN", label: "Open (any stage)" },
  { value: "DISCOVERY", label: "Discovery" },
  { value: "QUALIFICATION", label: "Qualification" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

export default function OpportunitiesPage() {
  const [query, setQuery] = React.useState("");
  const [stage, setStage] = React.useState("OPEN");
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState("amount");
  const [createOpen, setCreateOpen] = React.useState(false);
  const search = useDebouncedValue(query, 250);
  const { exporting, run: runExport } = useCsvExport();

  const params = new URLSearchParams({ page: String(page), pageSize: "25", sort, dir: sort === "name" ? "asc" : "desc" });
  if (search) params.set("q", search);
  if (stage) params.set("stage", stage);

  const opportunities = useApiQuery<OpportunitiesResponse>(qk.opportunities({ search, stage, page, sort }), `/api/opportunities?${params.toString()}`);
  const { items, meta } = pageData<Opportunity, OpportunitiesResponse["meta"]>(opportunities.data);

  const openValue = (meta?.byStage ?? []).filter((row) => !["WON", "LOST"].includes(row.stage)).reduce((acc, row) => acc + row.value, 0);
  const openCount = (meta?.byStage ?? []).filter((row) => !["WON", "LOST"].includes(row.stage)).reduce((acc, row) => acc + row.count, 0);
  const stalled = items.filter((deal) => deal.stalled);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Opportunity engine"
        title="Pipeline"
        description={`${formatNumber(openCount)} open opportunities worth ${formatCompactCurrency(openValue)}. Every row carries the signal that matters: value, probability, days in stage and the last time someone touched it.`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/intelligence">
                <TrendingUp className="size-3.5" /> Detected opportunities
              </Link>
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="size-3.5" /> New opportunity
                </Button>
              </DialogTrigger>
              <CreateOpportunityDialog onCreated={() => setCreateOpen(false)} />
            </Dialog>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open pipeline" value={formatCompactCurrency(openValue)} hint={`${formatNumber(openCount)} deals`} />
        <StatCard label="Weighted forecast" value={formatCompactCurrency((meta?.byStage ?? []).filter((row) => !["WON", "LOST"].includes(row.stage)).reduce((acc, row) => acc + row.weighted, 0))} hint="Probability-weighted" />
        <StatCard label="Stalled on this page" value={formatNumber(stalled.length)} hint="No activity in 14+ days" />
        <StatCard label="Average AI score" value={items.length ? formatNumber(items.reduce((acc, deal) => acc + deal.aiScore, 0) / items.length) : "—"} hint="Model confidence in the deal" />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Open opportunities</CardTitle>
            <CardDescription>{meta ? `${formatNumber(meta.total)} records` : "Loading…"}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModuleToolbar
            search={query}
            onSearch={(value) => {
              setQuery(value);
              setPage(1);
            }}
            searchPlaceholder="Search by name, code or account…"
            filters={[
              { key: "stage", label: "Stage", value: stage, options: STAGE_OPTIONS },
              { key: "sort", label: "Sort", value: sort, options: [{ value: "amount", label: "Value" }, { value: "expectedCloseDate", label: "Close date" }, { value: "daysInStage", label: "Days in stage" }, { value: "name", label: "Name" }] },
            ]}
            onFilter={(key, value) => {
              if (key === "stage") setStage(value);
              if (key === "sort") setSort(value);
              setPage(1);
            }}
            onExport={() =>
              runExport(
                "nexus-pipeline",
                items.map((deal) => ({
                  code: deal.code,
                  name: deal.name,
                  account: deal.customer?.name ?? "",
                  stage: deal.stage,
                  amount: deal.amount,
                  weighted: deal.weightedAmount,
                  probability: deal.probability,
                  closeDate: deal.expectedCloseDate ?? "",
                  daysInStage: deal.daysInStage,
                  owner: deal.owner?.name ?? "",
                })),
                ["code", "name", "account", "stage", "amount", "weighted", "probability", "closeDate", "daysInStage", "owner"],
              )
            }
            exporting={exporting}
          />

          {opportunities.isError ? <InlineError message={opportunities.error?.message ?? "Could not load pipeline."} onRetry={() => opportunities.refetch()} /> : null}

          {opportunities.isLoading ? (
            <SkeletonTable rows={8} columns={6} />
          ) : items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 text-left font-medium">Opportunity</th>
                    <th className="px-3 py-2 text-left font-medium">Account</th>
                    <th className="px-3 py-2 text-left font-medium">Stage</th>
                    <th className="px-3 py-2 text-right font-medium">Value</th>
                    <th className="px-3 py-2 text-right font-medium">Weighted</th>
                    <th className="px-3 py-2 text-left font-medium">Close</th>
                    <th className="px-3 py-2 text-left font-medium">Last touch</th>
                    <th className="px-3 py-2 text-left font-medium">Owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((deal) => (
                    <tr key={deal.id} className="transition-colors hover:bg-muted/30">
                      <td className="py-2.5 pr-3">
                        <Link href={`/opportunities/${deal.id}`} className="block min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="tabular text-2xs text-muted-foreground">{deal.code}</span>
                            {deal.stalled ? <Badge variant="warning" className="h-4 px-1.5 text-[10px]">Stalled</Badge> : null}
                          </span>
                          <span className="mt-0.5 block truncate font-medium">{deal.name}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        {deal.customer ? (
                          <Link href={`/customers/${deal.customer.id}`} className="flex items-center gap-2 text-xs hover:underline">
                            <span className="truncate">{deal.customer.name}</span>
                            <HealthBadge score={deal.customer.healthScore} showScore={false} />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <StageBadge value={deal.stage} />
                      </td>
                      <td className="tabular px-3 py-2.5 text-right font-medium">{formatCurrency(deal.amount, { compact: true })}</td>
                      <td className="tabular px-3 py-2.5 text-right text-muted-foreground">{formatCurrency(deal.weightedAmount, { compact: true })}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "—"}</td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className={deal.stalled ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>{deal.lastActivityAt ? relativeTime(deal.lastActivityAt) : "Never"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{deal.owner?.name ?? "Unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Filter}
              title="No opportunities match these filters"
              description="Adjust the stage filter or create a new opportunity to get started."
              action={{ label: "Create opportunity", onClick: () => setCreateOpen(true) }}
              secondaryAction={{ label: "Clear filters", onClick: () => { setQuery(""); setStage("OPEN"); } }}
            />
          )}

          {meta && meta.pageCount > 1 ? (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>
                Page {meta.page} of {meta.pageCount} · {formatNumber(meta.total)} opportunities
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

      {meta?.byStage.length ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pipeline by stage</CardTitle>
              <CardDescription>Value versus probability-weighted value for every stage.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <BarsByCategory
              data={meta.byStage.map((row) => ({ label: titleCase(row.stage), value: row.value, secondary: row.weighted }))}
              height={260}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="tabular mt-2 text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-2 text-2xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function CreateOpportunityDialog({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = React.useState({ name: "", customerId: "", amount: "", stage: "DISCOVERY", expectedCloseDate: "", nextStep: "", productLine: "" });
  const customers = useApiQuery<{ items: { id: string; name: string }[] }>(qk.customers({ picker: true }), "/api/customers?pageSize=200&sort=name&dir=asc");

  const create = useApiMutation<{ id: string }, typeof form>({
    path: "/api/opportunities",
    invalidate: [["opportunities"], qk.dashboard, ["analytics"]],
    successMessage: "Opportunity created and added to the pipeline.",
    onSuccess: onCreated,
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New opportunity</DialogTitle>
        <DialogDescription>The stage sets the default probability; you can override it afterwards.</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.name || !form.customerId || !form.amount) {
            toast.error("Name, account and amount are required.");
            return;
          }
          create.mutate({
            ...form,
            amount: form.amount,
            expectedCloseDate: form.expectedCloseDate || "",
            nextStep: form.nextStep,
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <Label htmlFor="opp-name">Name</Label>
            <Input id="opp-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Northwind — analytics expansion" required />
          </Field>
          <Field className="sm:col-span-2">
            <Label htmlFor="opp-customer">Account</Label>
            <NativeSelect id="opp-customer" value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} required>
              <option value="">Select an account…</option>
              {(pageData<{ id: string; name: string }>(customers.data).items).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <Label htmlFor="opp-amount">Amount (EUR)</Label>
            <Input id="opp-amount" type="number" min="0" step="500" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
          </Field>
          <Field>
            <Label htmlFor="opp-stage">Stage</Label>
            <NativeSelect id="opp-stage" value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>
              {STAGE_OPTIONS.filter((option) => option.value && !["OPEN", "WON", "LOST"].includes(option.value)).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <Label htmlFor="opp-close">Expected close</Label>
            <Input id="opp-close" type="date" value={form.expectedCloseDate} onChange={(event) => setForm({ ...form, expectedCloseDate: event.target.value })} />
          </Field>
          <Field>
            <Label htmlFor="opp-product">Product line</Label>
            <Input id="opp-product" value={form.productLine} onChange={(event) => setForm({ ...form, productLine: event.target.value })} placeholder="Analytics add-on" />
          </Field>
          <Field className="sm:col-span-2">
            <Label htmlFor="opp-next">Next step</Label>
            <Textarea id="opp-next" rows={2} value={form.nextStep} onChange={(event) => setForm({ ...form, nextStep: event.target.value })} placeholder="Send the revised proposal to the CFO by Friday" />
          </Field>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create opportunity"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
