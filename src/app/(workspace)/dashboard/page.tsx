"use client";

import Link from "next/link";
import { ArrowRight, Bot, Briefcase, CalendarClock, CheckCircle2, CircleAlert, Sparkles, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { AreaTrend, BarsByCategory, DonutBreakdown, ScoreBars } from "@/components/charts";
import { HealthBadge, KpiCard, PriorityBadge, RunIntelligenceButton, StageBadge, StatusPill, InlineError, type Kpi } from "@/components/domain";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardToolbar } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { SkeletonCards, Skeleton } from "@/components/ui/skeleton";
import { useApiQuery, qk } from "@/hooks/use-api";
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber, formatPercent, relativeTime, titleCase } from "@/lib/utils";

type DashboardResponse = {
  window: { from: string; to: string; key: string };
  snapshot: Record<string, number>;
  kpis: {
    key: string;
    label: string;
    value: number;
    unit: "EUR" | "%";
    delta: number;
    deltaUnit: "percent" | "points";
    comparison: string;
    context: string;
    formula: string;
    href: string;
    series: { period: string; value: number }[];
  }[];
  series: { period: string; value: number; forecast: boolean }[];
  forecast: { projected: number; slope: number; confidence: number; r2: number };
  forecastSeries: { period: string; value: number; forecast: boolean }[];
  pipelineByStage: { stage: string; count: number; value: number; weighted: number }[];
  healthMix: { healthy: number; watch: number; at_risk: number };
  insights: {
    id: string;
    title: string;
    summary: string;
    category: string;
    priority: string;
    priorityScore: number;
    confidence: number;
    estimatedImpact: number;
    status: string;
    detectedAt: string;
  }[];
  risks: { id: string; title: string; category: string; severity: string; status: string; probability: number; impact: number; riskScore: number; customerId: string | null }[];
  tasks: { id: string; subject: string; dueAt: string | null; isOverdue: boolean; customer: { id: string; name: string } | null; opportunity: { id: string; name: string } | null }[];
  activities: { id: string; type: string; subject: string; outcome: string | null; occurredAt: string; user: { name: string } | null; customer: { id: string; name: string } | null }[];
  automations: { total: number; active: number; runs: number; successRate: number; hoursSaved: number };
};

type BriefResponse = {
  brief: {
    id: string;
    headline: string;
    periodStart: string;
    periodEnd: string;
    whatChanged: { label: string; value: string; delta: number; direction: string; note: string; positiveIsGood: boolean }[];
    whyItMatters: { title: string; body: string; href?: string }[];
    attention: { title: string; detail: string; severity: string; category: string; impact: number; href: string }[];
    recommendations: { action: string; rationale: string; impact: string; impactValue: number; confidence: number; priority: string; insightId: string; ctaLabel: string; ctaHref: string }[];
    metrics: Record<string, number>;
    engine: string;
    confidence: number;
    generatedAt: string;
  } | null;
  insights: unknown[];
  risks: unknown[];
  totals: { openInsights: number; openRisks: number; addressableValue: number; exposedValue: number };
  lastRun: { at: string; durationMs: number | null; scanned: Record<string, number> } | null;
};

export default function DashboardPage() {
  const dashboard = useApiQuery<DashboardResponse>(qk.dashboard, "/api/dashboard?window=12m");
  const intelligence = useApiQuery<BriefResponse>(["intelligence"], "/api/intelligence");

  if (dashboard.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Your business, decoded." description="Transforme dados operacionais em decisões que movem receita." />
        <SkeletonCards />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Your business, decoded." description="We could not load your dashboard." />
        <InlineError message={dashboard.error?.message ?? "The dashboard request failed."} onRetry={() => dashboard.refetch()} />
      </div>
    );
  }

  const data = dashboard.data.data;
  const brief = intelligence.data?.data.brief ?? null;
  // The API already computes the delta, its unit and the comparison basis —
  // the page renders them verbatim instead of re-deriving percentages.
  const kpis: Kpi[] = data.kpis.map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    value: kpi.value,
    unit: kpi.unit,
    delta: kpi.delta,
    deltaUnit: kpi.deltaUnit,
    comparison: kpi.comparison,
    context: kpi.context,
    href: kpi.href,
    formula: kpi.formula,
    series: kpi.series,
  }));

  const efficiencyBreakdown = (data.snapshot.efficiencyBreakdown as unknown as { label: string; value: number; weight: number; detail: string }[] | undefined) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Executive overview · ${data.window.key} · updated ${relativeTime(new Date())}`}
        title="Your business, decoded."
        description="Transforme dados operacionais em decisões que movem receita."
        actions={
          <>
            <RunIntelligenceButton />
            <Button asChild size="sm">
              <Link href="/intelligence">
                Open intelligence <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                Revenue trend
                <Badge variant="outline" className="font-normal">
                  12 months
                </Badge>
              </CardTitle>
              <CardDescription>
                Weekly closed-won revenue with a 30-day linear projection ({formatPercent(data.forecast.confidence, { decimals: 0 })} fit confidence, R² {data.forecast.r2.toFixed(2)}).
              </CardDescription>
            </div>
            <CardToolbar>
              <span className="text-2xs text-muted-foreground">
                forecast {formatCompactCurrency(data.forecast.projected)} / 30d
              </span>
            </CardToolbar>
          </CardHeader>
          <CardContent>
            {data.forecastSeries.length ? <AreaTrend data={data.forecastSeries} height={260} /> : <EmptyState icon={TrendingUp} title="No revenue history yet" description="Closed-won revenue will appear here as soon as deals are marked won." compact />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> Nexus Intelligence
              </CardTitle>
              <CardDescription>{brief ? `Engine ${brief.engine} · confidence ${brief.confidence}% · ${relativeTime(brief.generatedAt)}` : "No brief generated yet"}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {intelligence.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : brief ? (
              <>
                <p className="text-sm font-medium leading-snug">{brief.headline}</p>
                <div className="space-y-2">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">What changed</p>
                  <ul className="space-y-2">
                    {brief.whatChanged.slice(0, 3).map((change) => (
                      <li key={change.label} className="flex items-start justify-between gap-3 text-xs">
                        <span className="text-muted-foreground">{change.label}</span>
                        <span className="text-right">
                          <span className="tabular font-medium">{change.value}</span>
                          <span className={`ml-2 ${change.direction === "up" ? "text-emerald-600 dark:text-emerald-400" : change.direction === "down" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
                            {change.delta > 0 ? "+" : ""}
                            {change.delta.toFixed(1)}%
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">What needs attention</p>
                  <ul className="space-y-2.5">
                    {brief.attention.slice(0, 3).map((item) => (
                      <li key={item.title} className="space-y-1">
                        <Link href={item.href} className="flex items-start gap-2 text-xs font-medium hover:text-primary">
                          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                          <span className="line-clamp-2">{item.title}</span>
                        </Link>
                        <p className="pl-5 text-2xs text-muted-foreground">
                          {formatCompactCurrency(item.impact)} exposed · {titleCase(item.category)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/intelligence">Open full brief</Link>
                </Button>
              </>
            ) : (
              <EmptyState
                icon={Bot}
                title="Generate the first brief"
                description="Run the intelligence engines to analyse pipeline, accounts, support load and automation health."
                action={{ label: "Run engines", onClick: () => intelligence.refetch() }}
                compact
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Recommended actions</CardTitle>
              <CardDescription>Every recommendation links to the record it came from.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {brief?.recommendations.length ? (
              brief.recommendations.slice(0, 4).map((recommendation) => (
                <div key={recommendation.insightId} className="flex flex-col gap-2 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge value={recommendation.priority} />
                      <span className="text-2xs text-muted-foreground">{recommendation.confidence}% confidence</span>
                      <span className="text-2xs font-medium text-emerald-600 dark:text-emerald-400">{recommendation.impact} impact</span>
                    </div>
                    <p className="text-[13px] font-medium leading-snug">{recommendation.action}</p>
                    <p className="line-clamp-2 text-2xs text-muted-foreground">{recommendation.rationale}</p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={recommendation.ctaHref}>{recommendation.ctaLabel}</Link>
                  </Button>
                </div>
              ))
            ) : (
              <EmptyState icon={CheckCircle2} title="Nothing urgent" description="The engines have not flagged anything that needs an action right now." compact />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pipeline by stage</CardTitle>
              <CardDescription>{formatCompactCurrency(data.snapshot.pipelineOpen ?? 0)} open across {formatNumber(data.snapshot.pipelineCount ?? 0)} deals</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {data.pipelineByStage.length ? (
              <BarsByCategory data={data.pipelineByStage.map((row) => ({ label: titleCase(row.stage), value: row.value, secondary: row.weighted }))} height={230} horizontal />
            ) : (
              <EmptyState icon={Briefcase} title="No open pipeline" description="Create an opportunity to see the funnel build up." compact />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Customer health</CardTitle>
              <CardDescription>Weighted score across engagement, revenue, usage, support and activity.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <DonutBreakdown
              data={[
                { label: "Healthy (80+)", value: data.healthMix.healthy },
                { label: "Watch (60–79)", value: data.healthMix.watch },
                { label: "At risk (<60)", value: data.healthMix.at_risk },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top opportunities</CardTitle>
              <CardDescription>Highest impact detections, ranked by priority score.</CardDescription>
            </div>
            <CardToolbar>
              <Button asChild variant="ghost" size="sm">
                <Link href="/intelligence">All</Link>
              </Button>
            </CardToolbar>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.insights.length ? (
              data.insights.map((insight) => (
                <Link key={insight.id} href={`/intelligence/${insight.id}`} className="block space-y-1 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-muted/40">
                  <div className="flex items-center gap-2">
                    <PriorityBadge value={insight.priority} />
                    <span className="text-2xs text-muted-foreground">{formatCompactCurrency(insight.estimatedImpact)}</span>
                  </div>
                  <p className="line-clamp-2 text-xs font-medium">{insight.title}</p>
                  <p className="text-2xs text-muted-foreground">{relativeTime(insight.detectedAt)}</p>
                </Link>
              ))
            ) : (
              <EmptyState icon={Sparkles} title="No opportunities yet" description="Run the engines to scan pipeline, accounts and operations." compact />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Risks to watch</CardTitle>
              <CardDescription>Ranked by exposure and probability.</CardDescription>
            </div>
            <CardToolbar>
              <Button asChild variant="ghost" size="sm">
                <Link href="/risks">All</Link>
              </Button>
            </CardToolbar>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.risks.length ? (
              data.risks.map((risk) => (
                <Link key={risk.id} href={`/risks/${risk.id}`} className="block space-y-1 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-muted/40">
                  <div className="flex items-center gap-2">
                    <PriorityBadge value={risk.severity} />
                    <span className="text-2xs text-muted-foreground">{formatCompactCurrency(risk.impact)}</span>
                  </div>
                  <p className="line-clamp-2 text-xs font-medium">{risk.title}</p>
                  <p className="text-2xs text-muted-foreground">
                    {titleCase(risk.category)} · {risk.probability}% likely
                  </p>
                </Link>
              ))
            ) : (
              <EmptyState icon={CircleAlert} title="No open risks" description="Risks detected by the engines appear here." compact />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4" /> Tasks due
              </CardTitle>
              <CardDescription>Open tasks across your team, soonest first.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.tasks.length ? (
              data.tasks.map((task) => (
                <div key={task.id} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{task.subject}</p>
                    <p className="truncate text-2xs text-muted-foreground">{task.customer?.name ?? task.opportunity?.name ?? "Internal"}</p>
                  </div>
                  <span className={task.isOverdue ? "shrink-0 text-2xs font-medium text-rose-600 dark:text-rose-400" : "shrink-0 text-2xs text-muted-foreground"}>
                    {task.dueAt ? formatDate(task.dueAt) : "No date"}
                  </span>
                </div>
              ))
            ) : (
              <EmptyState icon={CheckCircle2} title="Inbox zero" description="No open tasks — every follow-up is done." compact />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Operational efficiency</CardTitle>
              <CardDescription>Scored live from operations data, not a stored constant.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {efficiencyBreakdown.length ? <ScoreBars factors={efficiencyBreakdown.map((entry) => ({ label: entry.label, score: entry.value, weight: entry.weight, detail: entry.detail }))} /> : <EmptyState icon={Users} title="Not enough data" description="Log tickets, invoices and activities to score operations." compact />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Automation engine</CardTitle>
              <CardDescription>
                {data.automations.active} of {data.automations.total} automations active · {formatNumber(data.automations.runs)} runs
              </CardDescription>
            </div>
            <CardToolbar>
              <Button asChild variant="ghost" size="sm">
                <Link href="/automations">Open</Link>
              </Button>
            </CardToolbar>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Success rate" value={formatPercent(data.automations.successRate)} />
              <Metric label="Hours saved" value={`${formatNumber(data.automations.hoursSaved)}h`} />
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recent activity</p>
              <ul className="space-y-2">
                {data.activities.slice(0, 4).map((activity) => (
                  <li key={activity.id} className="flex items-start justify-between gap-3 text-xs">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{activity.subject}</span>
                      <span className="block truncate text-2xs text-muted-foreground">
                        {activity.user?.name ?? "Unassigned"} · {activity.customer?.name ?? "Internal"}
                      </span>
                    </span>
                    <span className="shrink-0 text-2xs text-muted-foreground">{relativeTime(activity.occurredAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {intelligence.isError ? (
        <Alert tone="warning" title="Intelligence brief unavailable">
          The rest of the dashboard is live; only the AI brief could not be loaded.
        </Alert>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface-sunken p-3">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
