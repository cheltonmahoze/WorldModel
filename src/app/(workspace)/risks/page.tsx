"use client";

import Link from "next/link";
import * as React from "react";
import { Filter, Plus, ShieldAlert, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { BarsByCategory, DonutBreakdown } from "@/components/charts";
import { InlineError, ModuleToolbar, PriorityBadge, SeverityMeter, StatCard, StatusPill, useCsvExport } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldHint, Label } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { SkeletonTable } from "@/components/ui/skeleton";
import { pageData, useApiMutation, useApiQuery, qk, toast } from "@/hooks/use-api";
import { useDebouncedValue } from "@/hooks/use-hotkey";
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber, relativeTime, titleCase } from "@/lib/utils";

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
  detectedBy: string;
  detectedAt: string;
  dueAt: string | null;
  owner: { id: string; name: string } | null;
  customer: { id: string; name: string; arr: number } | null;
  opportunity: { id: string; name: string; code: string; amount: number } | null;
};

type RisksResponse = {
  items: Risk[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
    bySeverity: { severity: string; count: number; impact: number }[];
    byCategory: { category: string; count: number; impact: number }[];
    totalImpact: number;
  };
};

const CATEGORIES = [
  { value: "REVENUE", label: "Revenue" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "OPERATIONAL", label: "Operational" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "FINANCIAL", label: "Financial" },
  { value: "REPUTATIONAL", label: "Reputational" },
  { value: "SECURITY", label: "Security" },
];

const SEVERITIES = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "MITIGATING", label: "Mitigating" },
  { value: "MONITORING", label: "Monitoring" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "ACCEPTED", label: "Accepted" },
];

export default function RisksPage() {
  const [query, setQuery] = React.useState("");
  const [severity, setSeverity] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [createOpen, setCreateOpen] = React.useState(false);
  const search = useDebouncedValue(query, 250);
  const { exporting, run: runExport } = useCsvExport();

  const params = new URLSearchParams({ page: String(page), pageSize: "25", sort: "riskScore", dir: "desc" });
  if (search) params.set("q", search);
  if (severity) params.set("severity", severity);
  if (category) params.set("category", category);
  if (status) params.set("status", status);

  const risks = useApiQuery<RisksResponse>(qk.risks({ search, severity, category, status, page }), `/api/risks?${params.toString()}`);
  const { items, meta } = pageData<Risk, RisksResponse["meta"]>(risks.data);

  const critical = meta?.bySeverity.find((row) => row.severity === "CRITICAL");
  const openCount = items.filter((risk) => ["OPEN", "MITIGATING", "MONITORING"].includes(risk.status)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Risk engine"
        title="Risk register"
        description="Revenue, customer and operational exposure detected from live data — each risk carries probability, financial impact, the accountable owner and the mitigation we recommend."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-3.5" /> Log a risk
              </Button>
            </DialogTrigger>
            <CreateRiskDialog onCreated={() => setCreateOpen(false)} />
          </Dialog>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open risks" value={formatNumber(meta?.total ?? 0)} hint="Matching the current filters" />
        <StatCard label="Total exposure" value={formatCompactCurrency(meta?.totalImpact ?? 0)} hint="Sum of financial impact" />
        <StatCard label="Critical" value={formatNumber(critical?.count ?? 0)} hint={critical ? `${formatCompactCurrency(critical.impact)} exposed` : "None detected"} tone={critical?.count ? "danger" : undefined} />
        <StatCard label="On this page" value={formatNumber(openCount)} hint="Open, mitigating or monitored" />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Detected risks</CardTitle>
            <CardDescription>{meta ? `${formatNumber(meta.total)} records, ranked by risk score` : "Loading…"}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModuleToolbar
            search={query}
            onSearch={(value) => {
              setQuery(value);
              setPage(1);
            }}
            searchPlaceholder="Search risks, accounts or owners…"
            filters={[
              { key: "severity", label: "Severity", value: severity, options: [{ value: "", label: "All severities" }, ...SEVERITIES] },
              { key: "category", label: "Category", value: category, options: [{ value: "", label: "All categories" }, ...CATEGORIES] },
              { key: "status", label: "Status", value: status, options: [{ value: "", label: "Any status" }, ...STATUSES] },
            ]}
            onFilter={(key, value) => {
              if (key === "severity") setSeverity(value);
              if (key === "category") setCategory(value);
              if (key === "status") setStatus(value);
              setPage(1);
            }}
            onExport={() =>
              runExport(
                "nexus-risk-register",
                items.map((risk) => ({
                  title: risk.title,
                  category: risk.category,
                  severity: risk.severity,
                  status: risk.status,
                  probability: risk.probability,
                  impact: risk.impact,
                  riskScore: risk.riskScore,
                  owner: risk.owner?.name ?? "Unassigned",
                  account: risk.customer?.name ?? "",
                  detected: risk.detectedAt,
                  due: risk.dueAt ?? "",
                })),
                ["title", "category", "severity", "status", "probability", "impact", "riskScore", "owner", "account", "detected", "due"],
              )
            }
            exporting={exporting}
          />

          {risks.isError ? <InlineError message={risks.error?.message ?? "Could not load risks."} onRetry={() => risks.refetch()} /> : null}

          {risks.isLoading ? (
            <SkeletonTable rows={8} columns={5} />
          ) : items.length ? (
            <ul className="divide-y divide-border/70">
              {items.map((risk) => (
                <li key={risk.id}>
                  <Link href={`/risks/${risk.id}`} className="flex flex-col gap-3 py-4 transition-colors hover:bg-muted/30 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityBadge value={risk.severity} />
                        <StatusPill value={risk.status} />
                        <span className="text-2xs text-muted-foreground">{titleCase(risk.category)} risk</span>
                        {risk.detectedBy.startsWith("risk_engine") ? <span className="text-2xs text-muted-foreground">· auto-detected</span> : null}
                      </div>
                      <p className="text-[13px] font-medium leading-snug">{risk.title}</p>
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{risk.description}</p>
                      <div className="flex flex-wrap items-center gap-4 text-2xs text-muted-foreground">
                        {risk.customer ? (
                          <span>
                            Account: <span className="text-foreground">{risk.customer.name}</span> · {formatCompactCurrency(risk.customer.arr)} ARR
                          </span>
                        ) : null}
                        {risk.opportunity ? (
                          <span>
                            Deal: <span className="text-foreground">{risk.opportunity.code}</span> · {formatCurrency(risk.opportunity.amount, { compact: true })}
                          </span>
                        ) : null}
                        <span>Owner: <span className="text-foreground">{risk.owner?.name ?? "Unassigned"}</span></span>
                        <span>Detected {relativeTime(risk.detectedAt)}</span>
                        {risk.dueAt ? <span>Review by {formatDate(risk.dueAt)}</span> : null}
                      </div>
                    </div>
                    <div className="w-full shrink-0 space-y-2 lg:w-56">
                      <div className="flex items-baseline justify-between">
                        <span className="tabular text-sm font-semibold text-rose-600 dark:text-rose-400">{formatCompactCurrency(risk.impact)}</span>
                        <span className="text-2xs text-muted-foreground">{risk.probability}% probability</span>
                      </div>
                      <SeverityMeter score={risk.riskScore} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Filter}
              title="No risks match these filters"
              description="Adjust the filters, or log a risk manually if the engines have not detected it."
              action={{ label: "Log a risk", onClick: () => setCreateOpen(true) }}
              secondaryAction={{ label: "Clear filters", onClick: () => { setQuery(""); setSeverity(""); setCategory(""); setStatus(""); } }}
            />
          )}

          {meta && meta.pageCount > 1 ? (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>
                Page {meta.page} of {meta.pageCount}
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
                <CardTitle>Exposure by category</CardTitle>
                <CardDescription>Financial impact of every open risk in the register.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {meta.byCategory.length ? (
                <BarsByCategory data={meta.byCategory.map((row) => ({ label: titleCase(row.category), value: row.impact }))} height={250} horizontal />
              ) : (
                <EmptyState icon={ShieldAlert} title="No exposure recorded" description="Risks with a financial impact appear here." compact />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Risk mix</CardTitle>
                <CardDescription>Share of the register by severity.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {meta.bySeverity.length ? (
                <DonutBreakdown data={meta.bySeverity.map((row) => ({ label: titleCase(row.severity), value: row.count }))} />
              ) : (
                <EmptyState icon={TrendingDown} title="Nothing to plot" description="Severity distribution appears once risks are logged." compact />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}


function CreateRiskDialog({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    category: "REVENUE",
    severity: "",
    probability: "60",
    impact: "",
    recommendation: "",
    mitigation: "",
  });
  const customers = useApiQuery<{ items: { id: string; name: string }[] }>(qk.customers({ picker: "risk" }), "/api/customers?pageSize=200&sort=name&dir=asc");
  const [customerId, setCustomerId] = React.useState("");

  const create = useApiMutation<{ id: string }, Record<string, unknown>>({
    path: "/api/risks",
    invalidate: [["risks"], qk.dashboard],
    successMessage: "Risk logged and added to the register.",
    onSuccess: onCreated,
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Log a risk</DialogTitle>
        <DialogDescription>Severity is derived from impact and probability when you leave it blank.</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.title || !form.description || !form.impact) {
            toast.error("Title, description and impact are required.");
            return;
          }
          create.mutate({
            ...form,
            severity: form.severity || undefined,
            probability: Number(form.probability),
            impact: Number(form.impact),
            customerId: customerId || undefined,
            recommendation: form.recommendation || undefined,
            mitigation: form.mitigation || undefined,
          });
        }}
      >
        <Field>
          <Label htmlFor="risk-title">Title</Label>
          <Input id="risk-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Renewal exposure on the Meridian contract" required />
        </Field>
        <Field>
          <Label htmlFor="risk-description">Description</Label>
          <Textarea id="risk-description" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="risk-category">Category</Label>
            <NativeSelect id="risk-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <Label htmlFor="risk-severity">Severity (optional)</Label>
            <NativeSelect id="risk-severity" value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}>
              <option value="">Derive automatically</option>
              {SEVERITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <Label htmlFor="risk-impact">Financial impact (EUR)</Label>
            <Input id="risk-impact" type="number" min="0" step="500" value={form.impact} onChange={(event) => setForm({ ...form, impact: event.target.value })} required />
          </Field>
          <Field>
            <Label htmlFor="risk-probability">Probability (%)</Label>
            <Input id="risk-probability" type="number" min="1" max="100" value={form.probability} onChange={(event) => setForm({ ...form, probability: event.target.value })} />
            <FieldHint>Risk score = impact weight × probability.</FieldHint>
          </Field>
        </div>
        <Field>
          <Label htmlFor="risk-customer">Related account (optional)</Label>
          <NativeSelect id="risk-customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">No specific account</option>
            {(pageData<{ id: string; name: string }>(customers.data).items).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <Label htmlFor="risk-recommendation">Recommended action</Label>
          <Textarea id="risk-recommendation" rows={2} value={form.recommendation} onChange={(event) => setForm({ ...form, recommendation: event.target.value })} />
        </Field>
        <DialogFooter>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Log risk"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
