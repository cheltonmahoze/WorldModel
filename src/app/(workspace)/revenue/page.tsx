"use client";

import Link from "next/link";
import * as React from "react";
import { Banknote, Coins, Gauge, Receipt, Repeat, Target, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { AreaTrend, BarsByCategory, ComboTrend, DonutBreakdown } from "@/components/charts";
import { InlineError, InfoRow, StatCard, WindowPicker, exportFromServer } from "@/components/domain";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonCards } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiQuery, qk } from "@/hooks/use-api";
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber, formatPercent, titleCase } from "@/lib/utils";

type Metric = { key: string; label: string; value: number; previous: number; unit: string; description: string };

type RevenueResponse = {
  window: { key: string; from: string; to: string; previousFrom: string; previousTo: string };
  snapshot: {
    revenue: number;
    revenuePrev: number;
    wonDeals: number;
    lostDeals: number;
    pipelineOpen: number;
    pipelineWeighted: number;
    pipelineCount: number;
    pipelineStalled: number;
    pipelineStalledCount: number;
    winRate: number;
    averageDealSize: number;
    salesCycleDays: number;
    mrr: number;
    arr: number;
    expansionRevenue: number;
    churnRate: number;
    cac: number;
    ltv: number;
    nrr: number;
    coverage: number;
    forecast: number;
    activeCustomers: number;
    atRiskCustomers: number;
  };
  metrics: Metric[];
  series: { period: string; value: number }[];
  forecast: { projected: number; slope: number; confidence: number; r2: number };
  forecastSeries: { period: string; value: number; forecast: boolean }[];
  pipelineSeries: { period: string; value: number }[];
  efficiencySeries: { period: string; value: number }[];
  mix: {
    bySegment: { key: string; count: number; value: number }[];
    byRegion: { key: string; count: number; value: number }[];
    bySource: { key: string; count: number; value: number }[];
    byType: { key: string; count: number; value: number }[];
  };
  pipelineByStage: { stage: string; count: number; value: number; weighted: number }[];
  pipelineByProduct: { productLine: string; count: number; value: number }[];
  renewalBuckets: { bucket: string; accounts: number; arr: number }[];
  topAccounts: { name: string; value: number; count: number }[];
  assumptionsNote: string;
};

export default function RevenuePage() {
  const [window, setWindow] = React.useState("12m");
  const [exporting, setExporting] = React.useState<"csv" | "json" | null>(null);
  const revenue = useApiQuery<RevenueResponse>(qk.revenue(window), `/api/revenue?window=${window}`);

  if (revenue.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Revenue intelligence" description="Loading the revenue engine…" />
        <SkeletonCards />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (revenue.isError || !revenue.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Revenue intelligence" description="We could not load the revenue engine." />
        <InlineError message={revenue.error?.message ?? "The revenue request failed."} onRetry={() => revenue.refetch()} />
      </div>
    );
  }

  const data = revenue.data.data;
  const snapshot = data.snapshot;
  const headline = data.metrics.filter((metric) => ["revenue", "mrr", "arr", "win_rate"].includes(metric.key));
  const unit = (metric: Metric) => (metric.unit === "EUR" ? formatCurrency(metric.value) : metric.unit === "%" ? formatPercent(metric.value) : formatNumber(metric.value));
  const growth = (metric: Metric) => (metric.previous ? ((metric.value - metric.previous) / Math.abs(metric.previous)) * 100 : 0);

  const monthlyWon = React.useMemo(() => {
    const buckets = new Map<string, number>();
    for (const point of data.series) {
      const key = point.period.slice(0, 7);
      buckets.set(key, (buckets.get(key) ?? 0) + point.value);
    }
    return [...buckets.entries()].map(([key, value]) => ({ period: `${key}-01`, value, rate: snapshot.winRate }));
  }, [data.series, snapshot.winRate]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Revenue intelligence · ${formatDate(data.window.from)} → ${formatDate(data.window.to)}`}
        title="Revenue intelligence"
        description={`${formatCompactCurrency(snapshot.revenue)} closed-won in the period against ${formatCompactCurrency(snapshot.revenuePrev)} in the comparison window. Recurring revenue, unit economics and renewal exposure are all derived from the same ledger.`}
        actions={
          <>
            <WindowPicker value={window} onChange={setWindow} />
            <Button variant="outline" size="sm" disabled={exporting !== null} onClick={async () => { setExporting("csv"); await exportFromServer("revenue", "csv"); setExporting(null); }}>
              {exporting === "csv" ? "Exporting…" : "Export revenue"}
            </Button>
            <Button asChild size="sm">
              <Link href="/analytics">
                <TrendingUp className="size-3.5" /> Open analytics
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {headline.map((metric) => (
          <StatCard
            key={metric.key}
            label={metric.label}
            value={unit(metric)}
            hint={
              <span className={growth(metric) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                {growth(metric) >= 0 ? "+" : ""}
                {growth(metric).toFixed(1)}% vs previous period
              </span>
            }
          />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Weighted pipeline" value={formatCompactCurrency(snapshot.pipelineWeighted)} hint={`${formatNumber(snapshot.pipelineCount)} open deals · ${snapshot.coverage.toFixed(1)}× coverage`} icon={Target} />
        <StatCard label="Average deal size" value={formatCurrency(snapshot.averageDealSize, { compact: true })} hint={`${snapshot.salesCycleDays.toFixed(0)} day average cycle`} icon={Coins} />
        <StatCard label="Net revenue retention" value={formatPercent(snapshot.nrr)} hint={`${formatCurrency(snapshot.expansionRevenue)} expansion in period`} tone={snapshot.nrr >= 100 ? "positive" : "warning"} icon={Repeat} />
        <StatCard label="Gross churn (annualised)" value={formatPercent(snapshot.churnRate)} hint={`${snapshot.atRiskCustomers} accounts below the churn threshold`} tone={snapshot.churnRate > 8 ? "danger" : undefined} icon={Gauge} />
      </div>

      <Tabs defaultValue="trend">
        <TabsList>
          <TabsTrigger value="trend">Trend & forecast</TabsTrigger>
          <TabsTrigger value="metrics">Full metric set</TabsTrigger>
          <TabsTrigger value="mix">Mix</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="renewals">Renewals</TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Closed-won revenue</CardTitle>
                <CardDescription>
                  Monthly totals from the deal ledger with a 30-day linear projection — {data.forecast.confidence}% fit confidence, R² {data.forecast.r2.toFixed(2)}.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.forecastSeries.length ? (
                <AreaTrend data={data.forecastSeries.map((point) => ({ period: point.period, value: point.value, forecast: point.forecast }))} height={280} />
              ) : (
                <EmptyState icon={TrendingUp} title="No closed revenue in this window" description="Widen the period or move a deal to Won." />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Won value versus win rate</CardTitle>
                  <CardDescription>Monthly won value against the win rate for the same month.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {monthlyWon.length ? <ComboTrend data={monthlyWon} /> : <EmptyState icon={TrendingUp} title="Not enough history" description="Close a deal to start the series." compact />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Pipeline versus efficiency</CardTitle>
                  <CardDescription>Open pipeline value next to the operational efficiency score.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <AreaTrend data={data.pipelineSeries.map((point) => ({ period: point.period, value: point.value }))} height={180} color="#22d3ee" />
                <AreaTrend data={data.efficiencySeries.map((point) => ({ period: point.period, value: point.value }))} height={140} color="#34d399" valueFormatter={(value) => `${value.toFixed(0)}%`} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Every revenue metric the platform tracks</CardTitle>
                <CardDescription>{data.assumptionsNote}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.metrics.map((metric) => (
                  <div key={metric.key} className="rounded-lg border border-border/70 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p>
                      <span className={growth(metric) >= 0 ? "text-2xs text-emerald-600 dark:text-emerald-400" : "text-2xs text-rose-600 dark:text-rose-400"}>
                        {metric.previous ? `${growth(metric) >= 0 ? "+" : ""}${growth(metric).toFixed(1)}%` : "—"}
                      </span>
                    </div>
                    <p className="tabular mt-2 text-xl font-semibold leading-none">{unit(metric)}</p>
                    <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">{metric.description}</p>
                    {metric.previous ? (
                      <p className="mt-1.5 text-2xs text-muted-foreground">
                        Previous: {metric.unit === "EUR" ? formatCurrency(metric.previous, { compact: true }) : metric.unit === "%" ? formatPercent(metric.previous) : formatNumber(metric.previous)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <div>
                <CardTitle>Unit economics</CardTitle>
                <CardDescription>How acquisition cost and lifetime value relate at the current win rate and churn.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Customer acquisition cost" value={formatCurrency(snapshot.cac)} icon={Users} />
              <StatCard label="Lifetime value" value={formatCurrency(snapshot.ltv)} icon={Banknote} />
              <StatCard label="LTV : CAC" value={snapshot.cac ? `${(snapshot.ltv / snapshot.cac).toFixed(1)}×` : "—"} tone={snapshot.cac && snapshot.ltv / snapshot.cac >= 3 ? "positive" : "warning"} icon={Gauge} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mix" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Closed-won by segment</CardTitle>
                  <CardDescription>Which customer segment the revenue is coming from.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.mix.bySegment.length ? (
                  <BarsByCategory data={data.mix.bySegment.map((row) => ({ label: titleCase(row.key), value: row.value }))} height={250} />
                ) : (
                  <EmptyState icon={Coins} title="No closed deals" description="Segment mix appears once deals close." compact />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Deal mix by type</CardTitle>
                  <CardDescription>New business versus expansion and renewal.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.mix.byType.length ? <DonutBreakdown data={data.mix.byType.map((row) => ({ label: titleCase(row.key), value: row.value }))} /> : <EmptyState icon={Coins} title="Nothing to plot" description="Deal types appear with closed deals." compact />}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>By region</CardTitle>
                  <CardDescription>Closed-won value per territory.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.mix.byRegion.length ? <BarsByCategory data={data.mix.byRegion.map((row) => ({ label: row.key, value: row.value }))} height={230} horizontal color="#22d3ee" /> : <EmptyState icon={Coins} title="No regional data" description="Regions are set on each deal." compact />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>By acquisition source</CardTitle>
                  <CardDescription>Where the closed revenue originated.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.mix.bySource.length ? <BarsByCategory data={data.mix.bySource.map((row) => ({ label: titleCase(row.key), value: row.value }))} height={230} horizontal color="#34d399" /> : <EmptyState icon={Coins} title="No source data" description="Sources are set on each deal." compact />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Pipeline by stage</CardTitle>
                  <CardDescription>Open value against probability-weighted value.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <BarsByCategory data={data.pipelineByStage.map((row) => ({ label: titleCase(row.stage), value: row.value, secondary: row.weighted }))} height={260} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Pipeline by product line</CardTitle>
                  <CardDescription>Which products the pipeline is attached to.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.pipelineByProduct.length ? <BarsByCategory data={data.pipelineByProduct.map((row) => ({ label: row.productLine, value: row.value }))} height={260} horizontal color="#a78bfa" /> : <EmptyState icon={Target} title="No product data" description="Product lines are set on each deal." compact />}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Top accounts by closed-won value</CardTitle>
                <CardDescription>Where the revenue is concentrated — useful for concentration risk.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.topAccounts.length ? (
                <ul className="divide-y divide-border/60">
                  {data.topAccounts.map((account) => (
                    <li key={account.name} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                      <span className="truncate">{account.name}</span>
                      <span className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                        <span>{account.count} deals</span>
                        <span className="tabular w-24 text-right font-medium text-foreground">{formatCurrency(account.value)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Users} title="No closed revenue" description="Top accounts appear once deals close." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="renewals" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.renewalBuckets.map((bucket) => (
              <StatCard
                key={bucket.bucket}
                label={`Renews in ${bucket.bucket}`}
                value={`${formatNumber(bucket.accounts)} accounts`}
                hint={`${formatCompactCurrency(bucket.arr)} ARR at renewal`}
                tone={bucket.bucket === "0-30d" ? "warning" : undefined}
                icon={Receipt}
              />
            ))}
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Renewal exposure</CardTitle>
                <CardDescription>ARR by renewal window — the revenue that must be defended next.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.renewalBuckets.length ? (
                <BarsByCategory data={data.renewalBuckets.map((row) => ({ label: row.bucket, value: row.arr }))} height={250} color="#fbbf24" />
              ) : (
                <EmptyState icon={Receipt} title="No renewals scheduled" description="Add renewal dates to your accounts to track exposure." compact />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recurring revenue position</CardTitle>
                <CardDescription>Straight from the account records.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="MRR" value={formatCurrency(snapshot.mrr)} hint="Across live accounts" />
              <StatCard label="ARR" value={formatCurrency(snapshot.arr)} hint="Annualised recurring revenue" />
              <StatCard label="Expansion" value={formatCurrency(snapshot.expansionRevenue)} hint="Expansion revenue in period" tone="positive" />
              <StatCard label="Active accounts" value={formatNumber(snapshot.activeCustomers)} hint={`${snapshot.atRiskCustomers} flagged at risk`} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Alert tone="info" title="Where these numbers come from">
        {data.assumptionsNote} Change the assumptions in <span className="font-mono text-2xs">src/lib/assumptions.ts</span> and every CAC, LTV and payback figure in the product updates on
        the next request — nothing is hardcoded in the UI.
      </Alert>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Previous period comparison</CardTitle>
            <CardDescription>
              {formatDate(data.window.previousFrom)} → {formatDate(data.window.previousTo)}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoRow label="Closed-won" value={formatCurrency(snapshot.revenuePrev)} />
          <InfoRow label="Deals won" value={formatNumber(snapshot.wonDeals)} />
          <InfoRow label="Deals lost" value={formatNumber(snapshot.lostDeals)} />
          <InfoRow label="Win rate" value={formatPercent(snapshot.winRate)} />
        </CardContent>
      </Card>
    </div>
  );
}
