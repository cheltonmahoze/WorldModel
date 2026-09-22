"use client";

import Link from "next/link";
import * as React from "react";
import { Building2, Filter, Plus, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { BarsByCategory, DonutBreakdown } from "@/components/charts";
import { HealthBadge, InlineError, ModuleToolbar, StatCard, StatusPill, useCsvExport } from "@/components/domain";
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

type Customer = {
  id: string;
  name: string;
  code: string;
  domain: string | null;
  industry: string | null;
  segment: string;
  region: string | null;
  country: string | null;
  status: string;
  tier: string | null;
  arr: number;
  mrr: number;
  expansionMrr: number;
  healthScore: number;
  healthTrend: string;
  churnProbability: number;
  openDealCount: number;
  openTicketCount: number;
  activityCount: number;
  renewalDate: string | null;
  lastActivityAt: string | null;
  tags: string[];
  owner: { id: string; name: string } | null;
  csm: { id: string; name: string } | null;
  _count: { contacts: number; opportunities: number; tickets: number };
};

type CustomersResponse = {
  items: Customer[];
  meta: { total: number; page: number; pageSize: number; pageCount: number; byStatus: { status: string; count: number; arr: number }[] };
};

const SEGMENTS = ["ENTERPRISE", "MID_MARKET", "SMB"];
const STATUSES = ["ACTIVE", "ONBOARDING", "AT_RISK", "CHURNED", "SPEND"];

export default function CustomersPage() {
  const [query, setQuery] = React.useState("");
  const [health, setHealth] = React.useState("");
  const [segment, setSegment] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [createOpen, setCreateOpen] = React.useState(false);
  const search = useDebouncedValue(query, 250);
  const { exporting, run: runExport } = useCsvExport();

  const params = new URLSearchParams({ page: String(page), pageSize: "25", sort: "arr", dir: "desc" });
  if (search) params.set("q", search);
  if (health) params.set("health", health);
  if (segment) params.set("segment", segment);
  if (status) params.set("status", status);

  const customers = useApiQuery<CustomersResponse>(qk.customers({ search, health, segment, status, page }), `/api/customers?${params.toString()}`);
  const { items, meta } = pageData<Customer, CustomersResponse["meta"]>(customers.data);

  const totalArr = (meta?.byStatus ?? []).filter((row) => row.status !== "CHURNED").reduce((acc, row) => acc + row.arr, 0);
  const atRisk = items.filter((customer) => customer.healthScore < 60);
  const renewing = items.filter((customer) => customer.renewalDate && new Date(customer.renewalDate).getTime() < Date.now() + 90 * 86_400_000);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Customer intelligence"
        title="Accounts"
        description="Every account with its health score, recurring revenue, open pipeline and renewal date in one register — click through for the full 360° view."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-3.5" /> New account
              </Button>
            </DialogTrigger>
            <CreateCustomerDialog onCreated={() => setCreateOpen(false)} />
          </Dialog>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Accounts" value={formatNumber(meta?.total ?? 0)} hint="Matching the current filters" />
        <StatCard label="Recurring revenue" value={formatCompactCurrency(totalArr)} hint="ARR across active accounts" />
        <StatCard label="Health below 60" value={formatNumber(atRisk.length)} hint="On this page, needing attention" tone={atRisk.length ? "danger" : undefined} />
        <StatCard label="Renewing in 90 days" value={formatNumber(renewing.length)} hint="On this page, with a renewal date" />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Customer register</CardTitle>
            <CardDescription>{meta ? `${formatNumber(meta.total)} accounts` : "Loading…"}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModuleToolbar
            search={query}
            onSearch={(value) => {
              setQuery(value);
              setPage(1);
            }}
            searchPlaceholder="Search accounts, domains or industries…"
            filters={[
              { key: "health", label: "Health", value: health, options: [{ value: "", label: "Any health" }, { value: "healthy", label: "Healthy (80+)" }, { value: "watch", label: "Watch (60–79)" }, { value: "at_risk", label: "At risk (<60)" }] },
              { key: "segment", label: "Segment", value: segment, options: [{ value: "", label: "All segments" }, ...SEGMENTS.map((value) => ({ value, label: titleCase(value) }))] },
              { key: "status", label: "Status", value: status, options: [{ value: "", label: "Any status" }, ...STATUSES.map((value) => ({ value, label: titleCase(value) }))] },
            ]}
            onFilter={(key, value) => {
              if (key === "health") setHealth(value);
              if (key === "segment") setSegment(value);
              if (key === "status") setStatus(value);
              setPage(1);
            }}
            onExport={() =>
              runExport(
                "nexus-customers",
                items.map((customer) => ({
                  code: customer.code,
                  name: customer.name,
                  segment: customer.segment,
                  status: customer.status,
                  arr: customer.arr,
                  mrr: customer.mrr,
                  healthScore: customer.healthScore,
                  churnProbability: customer.churnProbability,
                  renewalDate: customer.renewalDate ?? "",
                  owner: customer.owner?.name ?? "",
                  csm: customer.csm?.name ?? "",
                })),
                ["code", "name", "segment", "status", "arr", "mrr", "healthScore", "churnProbability", "renewalDate", "owner", "csm"],
              )
            }
            exporting={exporting}
          />

          {customers.isError ? <InlineError message={customers.error?.message ?? "Could not load accounts."} onRetry={() => customers.refetch()} /> : null}

          {customers.isLoading ? (
            <SkeletonTable rows={8} columns={6} />
          ) : items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] text-sm">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 text-left font-medium">Account</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">ARR</th>
                    <th className="px-3 py-2 text-left font-medium">Health</th>
                    <th className="px-3 py-2 text-right font-medium">Churn</th>
                    <th className="px-3 py-2 text-left font-medium">Renewal</th>
                    <th className="px-3 py-2 text-right font-medium">Open deals</th>
                    <th className="px-3 py-2 text-right font-medium">Tickets</th>
                    <th className="px-3 py-2 text-left font-medium">Owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((customer) => (
                    <tr key={customer.id} className="transition-colors hover:bg-muted/30">
                      <td className="py-2.5 pr-3">
                        <Link href={`/customers/${customer.id}`} className="block min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium">{customer.name}</span>
                            <span className="tabular text-2xs text-muted-foreground">{customer.code}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                            {titleCase(customer.segment)} · {customer.industry ?? "—"} · {customer.country ?? "—"}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill value={customer.status} />
                      </td>
                      <td className="tabular px-3 py-2.5 text-right font-medium">{formatCurrency(customer.arr, { compact: true })}</td>
                      <td className="px-3 py-2.5">
                        <HealthBadge score={customer.healthScore} />
                      </td>
                      <td className={`tabular px-3 py-2.5 text-right ${customer.churnProbability >= 60 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
                        {customer.churnProbability}%
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{customer.renewalDate ? formatDate(customer.renewalDate) : "—"}</td>
                      <td className="tabular px-3 py-2.5 text-right">{formatNumber(customer.openDealCount)}</td>
                      <td className="tabular px-3 py-2.5 text-right">
                        {customer.openTicketCount > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">{customer.openTicketCount}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        <span className="block">{customer.owner?.name ?? "Unassigned"}</span>
                        <span className="block text-2xs">CSM {customer.csm?.name ?? "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Filter}
              title="No accounts match these filters"
              description="Clear the filters, or add the first account to start tracking health and renewals."
              action={{ label: "New account", onClick: () => setCreateOpen(true) }}
              secondaryAction={{ label: "Clear filters", onClick: () => { setQuery(""); setHealth(""); setSegment(""); setStatus(""); } }}
            />
          )}

          {meta && meta.pageCount > 1 ? (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>
                Page {meta.page} of {meta.pageCount} · {formatNumber(meta.total)} accounts
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

      {meta ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recurring revenue by status</CardTitle>
                <CardDescription>Where the ARR sits today.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {meta.byStatus.length ? (
                <BarsByCategory data={meta.byStatus.map((row) => ({ label: titleCase(row.status), value: row.arr }))} height={250} horizontal />
              ) : (
                <EmptyState icon={Building2} title="No recurring revenue yet" description="Set an ARR value on an account to see the mix." compact />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Account mix</CardTitle>
                <CardDescription>Number of accounts per lifecycle status.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {meta.byStatus.length ? (
                <DonutBreakdown data={meta.byStatus.map((row) => ({ label: titleCase(row.status), value: row.count }))} />
              ) : (
                <EmptyState icon={TrendingDown} title="Nothing to plot" description="Add accounts to see the portfolio mix." compact />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}


function CreateCustomerDialog({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = React.useState({
    name: "",
    domain: "",
    industry: "",
    segment: "MID_MARKET",
    region: "EMEA",
    country: "",
    status: "ONBOARDING",
    arr: "",
    renewalDate: "",
    notes: "",
  });

  const create = useApiMutation<{ id: string }, Record<string, unknown>>({
    path: "/api/customers",
    invalidate: [["customers"], qk.dashboard, ["analytics"], ["operations"]],
    successMessage: "Account created — health scoring starts on the next engine run.",
    onSuccess: onCreated,
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New account</DialogTitle>
        <DialogDescription>ARR drives health, churn and revenue reporting for this account.</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.name) {
            toast.error("A company name is required.");
            return;
          }
          create.mutate({ ...form, arr: form.arr ? Number(form.arr) : 0, renewalDate: form.renewalDate || undefined, notes: form.notes || undefined });
        }}
      >
        <Field>
          <Label htmlFor="customer-name">Company</Label>
          <Input id="customer-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Meridian Logistics" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="customer-domain">Domain</Label>
            <Input id="customer-domain" value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })} placeholder="meridian.com" />
          </Field>
          <Field>
            <Label htmlFor="customer-industry">Industry</Label>
            <Input id="customer-industry" value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })} placeholder="Logistics" />
          </Field>
          <Field>
            <Label htmlFor="customer-segment">Segment</Label>
            <NativeSelect id="customer-segment" value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })}>
              {SEGMENTS.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <Label htmlFor="customer-status">Status</Label>
            <NativeSelect id="customer-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <Label htmlFor="customer-arr">ARR (EUR)</Label>
            <Input id="customer-arr" type="number" min="0" step="1000" value={form.arr} onChange={(event) => setForm({ ...form, arr: event.target.value })} />
          </Field>
          <Field>
            <Label htmlFor="customer-renewal">Renewal date</Label>
            <Input id="customer-renewal" type="date" value={form.renewalDate} onChange={(event) => setForm({ ...form, renewalDate: event.target.value })} />
          </Field>
        </div>
        <Field>
          <Label htmlFor="customer-notes">Context</Label>
          <Textarea id="customer-notes" rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Why this account exists, what the commercial motion looks like…" />
        </Field>
        <DialogFooter>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
