"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowUpRight, Bot, Filter, Layers, Lightbulb, Target, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { BarsByCategory, DonutBreakdown } from "@/components/charts";
import { InlineError, ModuleToolbar, PriorityBadge, RunIntelligenceButton, StatusPill, useCsvExport } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonCards } from "@/components/ui/skeleton";
import { pageData, useApiQuery, qk } from "@/hooks/use-api";
import { useDebouncedValue } from "@/hooks/use-hotkey";
import { formatCompactCurrency, formatNumber, relativeTime, titleCase } from "@/lib/utils";
import { cn } from "@/lib/utils";

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
  status: string;
  detectedAt: string;
  dueAt: string | null;
  source: string;
  recommendation: string | null;
  actions: { label: string; href?: string; action?: string }[] | null;
  owner: { id: string; name: string } | null;
};

type InsightsResponse = {
  items: Insight[];
  meta: { total: number; page: number; pageSize: number; pageCount: number; summary: { category: string; count: number; impact: number }[] };
};

type BriefResponse = {
  brief: {
    headline: string;
    whatChanged: { label: string; value: string; delta: number; direction: string; note: string }[];
    whyItMatters: { title: string; body: string; href?: string }[];
    recommendations: { action: string; rationale: string; impact: string; confidence: number; priority: string; insightId: string; ctaLabel: string; ctaHref: string }[];
    engine: string;
    confidence: number;
    generatedAt: string;
  } | null;
  totals: { openInsights: number; openRisks: number; addressableValue: number; exposedValue: number };
  lastRun: { at: string; durationMs: number | null; scanned: Record<string, number> } | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  REVENUE_OPPORTUNITY: "Revenue opportunity",
  COST_REDUCTION: "Cost reduction",
  CUSTOMER_RETENTION: "Customer retention",
  SALES_ACCELERATION: "Sales acceleration",
  OPERATIONAL_EFFICIENCY: "Operational efficiency",
  RISK_PREVENTION: "Risk prevention",
};


/**
 * Attribution the reader can trust: the facts are always the deterministic
 * engine's, and the label says whether an LLM rephrased them or the provider was
 * unavailable and the deterministic narrative was kept.
 */
function describeEngine(engine: string) {
  const degraded = engine.includes("fell back");
  if (engine.startsWith("nexus-deterministic")) {
    return degraded ? "Nexus deterministic engine · LLM unavailable" : "Nexus deterministic engine";
  }
  return engine.startsWith("openai-") ? `LLM-drafted · ${engine.slice(7)}` : engine;
}

export default function IntelligencePage() {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [status, setStatus] = React.useState("");
  const search = useDebouncedValue(query, 250);
  const { exporting, run: runExport } = useCsvExport();

  const params = new URLSearchParams({ pageSize: "50" });
  if (search) params.set("q", search);
  if (category) params.set("category", category);
  if (priority) params.set("priority", priority);
  if (status) params.set("status", status);

  const insights = useApiQuery<InsightsResponse>(qk.insights({ search, category, priority, status }), `/api/insights?${params.toString()}`);
  const intelligence = useApiQuery<BriefResponse>(["intelligence"], "/api/intelligence");

  const list = pageData<Insight, InsightsResponse["meta"]>(insights.data);
  const items = list.items;
  const summary = list.meta?.summary ?? [];
  const brief = intelligence.data?.data.brief ?? null;
  const totals = intelligence.data?.data.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Nexus Intelligence"
        title="What to do next"
        description="The engines scan pipeline, accounts, support load and automation health, then rank what deserves your attention — with the money attached to each finding."
        actions={
          <>
            <RunIntelligenceButton label="Re-run analysis" />
            <Button asChild size="sm">
              <Link href="/opportunities">
                Open opportunities <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </>
        }
      />

      {intelligence.isLoading ? (
        <Skeleton className="h-40" />
      ) : brief ? (
        <Card className="overflow-hidden">
          <div className="border-b border-border/70 bg-[radial-gradient(120%_140%_at_0%_0%,hsl(var(--primary)/0.10),transparent_55%)] px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral" className="gap-1.5">
                <Bot className="size-3" /> AI brief
              </Badge>
              <span className="text-2xs text-muted-foreground">
                {describeEngine(brief.engine)} · {brief.confidence}% confidence · generated {relativeTime(brief.generatedAt)}
              </span>
            </div>
            <p className="mt-3 max-w-4xl text-[15px] font-medium leading-snug">{brief.headline}</p>
          </div>
          <CardContent className="grid gap-5 p-5 lg:grid-cols-3">
            <section className="space-y-3">
              <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">What changed?</h3>
              <ul className="space-y-2.5">
                {brief.whatChanged.map((change) => (
                  <li key={change.label} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium">{change.label}</p>
                      <p className="text-2xs text-muted-foreground">{change.note}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular font-medium">{change.value}</p>
                      <p className={cn("tabular text-2xs", change.direction === "up" ? "text-emerald-600 dark:text-emerald-400" : change.direction === "down" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                        {change.delta > 0 ? "+" : ""}
                        {change.delta.toFixed(1)}%
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Why it matters</h3>
              <ul className="space-y-3">
                {brief.whyItMatters.map((section) => (
                  <li key={section.title} className="space-y-1">
                    <p className="text-xs font-medium leading-snug">
                      {section.href ? (
                        <Link href={section.href} className="underline-offset-4 hover:underline">
                          {section.title}
                        </Link>
                      ) : (
                        section.title
                      )}
                    </p>
                    <p className="text-2xs leading-relaxed text-muted-foreground">{section.body}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recommended actions</h3>
              <ul className="space-y-3">
                {brief.recommendations.slice(0, 4).map((recommendation) => (
                  <li key={recommendation.insightId} className="space-y-1.5 rounded-lg border border-border/70 p-2.5">
                    <div className="flex items-center gap-2">
                      <PriorityBadge value={recommendation.priority} />
                      <span className="text-2xs font-medium text-emerald-600 dark:text-emerald-400">{recommendation.impact}</span>
                      <span className="text-2xs text-muted-foreground">{recommendation.confidence}%</span>
                    </div>
                    <p className="text-xs font-medium leading-snug">{recommendation.action}</p>
                    <Button asChild variant="outline" size="sm" className="h-7 w-full">
                      <Link href={recommendation.ctaHref}>{recommendation.ctaLabel}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-5">
            <EmptyState
              icon={Bot}
              title="No brief yet"
              description="Run the intelligence engines to analyse the workspace and publish the first brief."
              action={{ label: "Run engines", onClick: () => intelligence.refetch() }}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open opportunities" value={formatNumber(totals?.openInsights ?? list.meta?.total ?? 0)} hint="Detected, reviewed or in progress" icon={Lightbulb} />
        <StatCard label="Addressable value" value={formatCompactCurrency(totals?.addressableValue ?? 0)} hint="Sum of estimated impact on open findings" icon={Target} />
        <StatCard label="Open risks" value={formatNumber(totals?.openRisks ?? 0)} hint="Open, mitigating or monitored" icon={TrendingDown} />
        <StatCard label="Exposed value" value={formatCompactCurrency(totals?.exposedValue ?? 0)} hint="Revenue at risk if nothing changes" icon={Layers} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Detected opportunities</CardTitle>
              <CardDescription>
                {list.meta?.total ?? 0} findings match the current filters
                {intelligence.data?.data.lastRun ? ` · last scan scanned ${formatNumber(Object.values(intelligence.data.data.lastRun.scanned).reduce((acc, value) => acc + value, 0))} records` : ""}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ModuleToolbar
              search={query}
              onSearch={setQuery}
              searchPlaceholder="Search findings…"
              filters={[
                { key: "category", label: "Category", value: category, options: [{ value: "", label: "All categories" }, ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))] },
                { key: "priority", label: "Priority", value: priority, options: [{ value: "", label: "All priorities" }, { value: "CRITICAL", label: "Critical" }, { value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }] },
                { key: "status", label: "Status", value: status, options: [{ value: "", label: "Any status" }, { value: "DETECTED", label: "Detected" }, { value: "REVIEWING", label: "Reviewing" }, { value: "IN_PROGRESS", label: "In progress" }, { value: "COMPLETED", label: "Completed" }, { value: "DISMISSED", label: "Dismissed" }] },
              ]}
              onFilter={(key, value) => (key === "category" ? setCategory(value) : key === "priority" ? setPriority(value) : setStatus(value))}
              onExport={() =>
                runExport(
                  "nexus-opportunities",
                  items.map((item) => ({
                    title: item.title,
                    category: CATEGORY_LABEL[item.category] ?? item.category,
                    priority: item.priority,
                    confidence: item.confidence,
                    impact: item.estimatedImpact,
                    status: item.status,
                    detected: item.detectedAt,
                    owner: item.owner?.name ?? "Unassigned",
                  })),
                  ["title", "category", "priority", "confidence", "impact", "status", "detected", "owner"],
                )
              }
              exporting={exporting}
            />

            {insights.isError ? <InlineError message={insights.error?.message ?? "Could not load findings."} onRetry={() => insights.refetch()} /> : null}

            {insights.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-20" />
                ))}
              </div>
            ) : items.length ? (
              <ul className="divide-y divide-border/70">
                {items.map((insight) => (
                  <li key={insight.id}>
                    <Link href={`/intelligence/${insight.id}`} className="flex flex-col gap-3 py-3.5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <PriorityBadge value={insight.priority} />
                          <StatusPill value={insight.status} />
                          <span className="text-2xs text-muted-foreground">{CATEGORY_LABEL[insight.category] ?? titleCase(insight.category)}</span>
                        </div>
                        <p className="text-[13px] font-medium leading-snug">{insight.title}</p>
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{insight.summary}</p>
                      </div>
                      <div className="flex shrink-0 flex-row items-center gap-5 sm:flex-col sm:items-end sm:gap-1">
                        <span className="tabular text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatCompactCurrency(insight.estimatedImpact)}</span>
                        <span className="text-2xs text-muted-foreground">{insight.confidence}% confidence</span>
                        <span className="text-2xs text-muted-foreground">{relativeTime(insight.detectedAt)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Filter}
                title="No findings match these filters"
                description="Try clearing the filters, or re-run the engines to scan the latest data."
                action={{ label: "Clear filters", onClick: () => { setQuery(""); setCategory(""); setPriority(""); setStatus(""); } }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {summary.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Impact by category</CardTitle>
                <CardDescription>Estimated annualised value across open findings.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <BarsByCategory data={summary.map((row) => ({ label: CATEGORY_LABEL[row.category] ?? titleCase(row.category), value: row.impact }))} height={250} horizontal />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Findings by category</CardTitle>
                <CardDescription>Where the engines are finding the most surface area.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DonutBreakdown data={summary.map((row) => ({ label: CATEGORY_LABEL[row.category] ?? titleCase(row.category), value: row.count }))} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: React.ElementType }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
        <p className="tabular mt-2 text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-2 text-2xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
