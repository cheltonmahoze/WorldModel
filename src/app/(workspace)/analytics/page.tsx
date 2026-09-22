"use client";

import Link from "next/link";
import * as React from "react";
import { Activity, BarChart3, Clock, Filter, Gauge, Percent, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { BarsByCategory, DonutBreakdown, ScoreBars } from "@/components/charts";
import { InlineError, InfoRow, ModuleToolbar, StatCard, WindowPicker, exportFromServer, useCsvExport } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonCards } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiQuery, qk } from "@/hooks/use-api";
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber, formatPercent, titleCase } from "@/lib/utils";

type DimensionRow = { key: string; deals: number; pipeline: number; weighted: number; won: number; wonValue: number };

type AnalyticsResponse = {
  window: { key: string; from: string; to: string; previousFrom: string; previousTo: string };
  headline: {
    wonValue: number;
    previousWonValue: number;
    wonCount: number;
    lostCount: number;
    winRate: number;
    averageDealSize: number;
    averageCycleDays: number;
    openPipeline: number;
    weightedPipeline: number;
    activities: number;
    meetings: number;
    slaAdherence: number;
    onTimePaymentRate: number;
    automationRuns: number;
    automationFailureRate: number;
  };
  dimensions: {
    byOwner: DimensionRow[];
    byProduct: DimensionRow[];
    byRegion: DimensionRow[];
    bySegment: DimensionRow[];
    activityMix: { key: string; count: number; minutes: number }[];
    responseByUser: { key: string; count: number; positive: number }[];
  };
  funnel: { stage: string; count: number; value: number }[];
  cohorts: { cohort: string; accounts: number; arr: number; churned: number; expansion: number }[];
  health: { buckets: { key: string; label: string; count: number }[]; churnRisk: number; totalArr: number };
  automationOptions: { id: string; name: string; status: string; runCount: number; failureCount: number; hoursSaved: number }[];
};

type DimensionKey = "byOwner" | "byProduct" | "byRegion" | "bySegment";

const DIMENSION_LABEL: Record<DimensionKey, string> = {
  byOwner: "Owner",
  byProduct: "Product line",
  byRegion: "Region",
  bySegment: "Deal type",
};

export default function AnalyticsPage() {
  const [window, setWindow] = React.useState("12m");
  const [dimension, setDimension] = React.useState<DimensionKey>("byOwner");
  const [dimensionFilter, setDimensionFilter] = React.useState("");
  const { exporting, run: runExport } = useCsvExport();

  const analytics = useApiQuery<AnalyticsResponse>(qk.analytics({ window }), `/api/analytics?window=${window}`);

  if (analytics.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" description="Crunching the workspace data…" />
        <SkeletonCards />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (analytics.isError || !analytics.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" description="We could not run the analysis." />
        <InlineError message={analytics.error?.message ?? "The analytics request failed."} onRetry={() => analytics.refetch()} />
      </div>
    );
  }

  const data = analytics.data.data;
  const headline = data.headline;
  const rows = data.dimensions[dimension];
  const filteredRows = dimensionFilter ? rows.filter((row) => row.key === dimensionFilter) : rows;
  const comparison = headline.previousWonValue ? ((headline.wonValue - headline.previousWonValue) / Math.abs(headline.previousWonValue)) * 100 : 0;

  const dimensionOptions = [{ value: "", label: "Every slice" }, ...rows.map((row) => ({ value: row.key, label: titleCase(row.key.replace(/_/g, " ")) }))];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Analytics · ${formatDate(data.window.from)} → ${formatDate(data.window.to)}`}
        title="Analytics"
        description="Slice the business by period, owner, product, region, deal type and acquisition source. Every table drills into the records behind it."
        actions={
          <>
            <WindowPicker value={window} onChange={setWindow} />
            <Button variant="outline" size="sm" disabled={exporting !== null} onClick={async () => { await exportFromServer("pipeline", "csv"); }}>
              Export pipeline
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Closed-won value"
          value={formatCompactCurrency(headline.wonValue)}
          hint={
            <span className={comparison >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
              {comparison >= 0 ? "+" : ""}
              {comparison.toFixed(1)}% vs {formatCompactCurrency(headline.previousWonValue)} previous
            </span>
          }
          icon={BarChart3}
        />
        <StatCard label="Win rate" value={formatPercent(headline.winRate)} hint={`${headline.wonCount} won · ${headline.lostCount} lost`} icon={Percent} />
        <StatCard label="Average deal" value={formatCurrency(headline.averageDealSize, { compact: true })} hint={`${headline.averageCycleDays.toFixed(0)} day average cycle`} icon={Gauge} />
        <StatCard label="Open pipeline" value={formatCompactCurrency(headline.openPipeline)} hint={`${formatCompactCurrency(headline.weightedPipeline)} weighted`} icon={Filter} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Activities logged" value={formatNumber(headline.activities)} hint={`${formatNumber(headline.meetings)} meetings and demos`} icon={Activity} />
        <StatCard label="SLA adherence" value={formatPercent(headline.slaAdherence)} tone={headline.slaAdherence >= 85 ? "positive" : "warning"} hint="Support tickets inside their SLA" icon={Clock} />
        <StatCard label="On-time payment" value={formatPercent(headline.onTimePaymentRate)} hint="Paid invoices settled by the due date" icon={Gauge} />
        <StatCard label="Automation reliability" value={formatPercent(100 - headline.automationFailureRate)} tone={headline.automationFailureRate > 15 ? "warning" : "positive"} hint={`${formatNumber(headline.automationRuns)} runs in period`} icon={Activity} />
      </div>

      <Tabs defaultValue="dimensions">
        <TabsList>
          <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
          <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
          <TabsTrigger value="health">Customer health</TabsTrigger>
          <TabsTrigger value="team">Team & activity</TabsTrigger>
        </TabsList>

        <TabsContent value="dimensions" className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Performance by dimension</CardTitle>
                <CardDescription>Pick the slice, then a specific value to drill down.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ModuleToolbar
                filters={[
                  { key: "dimension", label: "Dimension", value: dimension, options: (Object.keys(DIMENSION_LABEL) as DimensionKey[]).map((key) => ({ value: key, label: DIMENSION_LABEL[key] })) },
                  { key: "value", label: DIMENSION_LABEL[dimension], value: dimensionFilter, options: dimensionOptions },
                ]}
                onFilter={(key, value) => {
                  if (key === "dimension") {
                    setDimension(value as DimensionKey);
                    setDimensionFilter("");
                  } else setDimensionFilter(value);
                }}
                onExport={() =>
                  runExport(
                    `nexus-analytics-${dimension}`,
                    filteredRows.map((row) => ({
                      [DIMENSION_LABEL[dimension]]: row.key,
                      deals: row.deals,
                      openPipeline: row.pipeline,
                      weighted: row.weighted,
                      won: row.won,
                      wonValue: row.wonValue,
                      winRate: row.deals ? (row.won / row.deals) * 100 : 0,
                    })),
                  )
                }
                exporting={exporting}
              />

              {rows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 text-left font-medium">{DIMENSION_LABEL[dimension]}</th>
                        <th className="py-2 text-right font-medium">Deals</th>
                        <th className="py-2 text-right font-medium">Open pipeline</th>
                        <th className="py-2 text-right font-medium">Weighted</th>
                        <th className="py-2 text-right font-medium">Won</th>
                        <th className="py-2 text-right font-medium">Won value</th>
                        <th className="py-2 text-right font-medium">Win rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredRows.map((row) => (
                        <tr key={row.key} className="transition-colors hover:bg-muted/30">
                          <td className="py-2.5 font-medium">
                            {dimension === "byOwner" ? (
                              <Link href={`/team`} className="hover:underline">
                                {shortName(row.key)}
                              </Link>
                            ) : (
                              titleCase(row.key.replace(/_/g, " "))
                            )}
                          </td>
                          <td className="tabular py-2.5 text-right">{formatNumber(row.deals)}</td>
                          <td className="tabular py-2.5 text-right">{formatCurrency(row.pipeline, { compact: true })}</td>
                          <td className="tabular py-2.5 text-right text-muted-foreground">{formatCurrency(row.weighted, { compact: true })}</td>
                          <td className="tabular py-2.5 text-right">{formatNumber(row.won)}</td>
                          <td className="tabular py-2.5 text-right font-medium">{formatCurrency(row.wonValue, { compact: true })}</td>
                          <td className="tabular py-2.5 text-right">{row.deals ? formatPercent((row.won / row.deals) * 100) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={Filter} title="No data for this dimension" description="Change the period or pick another dimension." />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Won value by {DIMENSION_LABEL[dimension].toLowerCase()}</CardTitle>
                  <CardDescription>Where closed revenue concentrates.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {rows.length ? (
                  <BarsByCategory data={rows.map((row) => ({ label: titleCase(row.key.replace(/_/g, " ")), value: row.wonValue }))} height={260} horizontal />
                ) : (
                  <EmptyState icon={BarChart3} title="Nothing to plot" description="Close deals to populate this chart." compact />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Open pipeline by {DIMENSION_LABEL[dimension].toLowerCase()}</CardTitle>
                  <CardDescription>Pipeline still in play, probability-weighted.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {rows.length ? (
                  <BarsByCategory data={rows.map((row) => ({ label: titleCase(row.key.replace(/_/g, " ")), value: row.pipeline, secondary: row.weighted }))} height={260} horizontal color="#22d3ee" />
                ) : (
                  <EmptyState icon={BarChart3} title="No pipeline" description="Create opportunities to build the funnel." compact />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="funnel">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Stage funnel</CardTitle>
                <CardDescription>How the pipeline converts stage by stage in the selected period.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.funnel.length ? (
                <>
                  <BarsByCategory data={data.funnel.map((row) => ({ label: titleCase(row.stage), value: row.value }))} height={280} />
                  <ul className="divide-y divide-border/60">
                    {data.funnel.map((row, index) => {
                      const previous = data.funnel[index - 1];
                      const conversion = previous && previous.count ? (row.count / previous.count) * 100 : null;
                      return (
                        <li key={row.stage} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                          <span className="font-medium">{titleCase(row.stage)}</span>
                          <span className="flex items-center gap-5 text-xs text-muted-foreground">
                            <span>{formatNumber(row.count)} deals</span>
                            <span>{formatCurrency(row.value, { compact: true })}</span>
                            {conversion !== null ? <span className="tabular">{formatPercent(conversion)} step conversion</span> : <span className="tabular">entry stage</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <EmptyState icon={Filter} title="No funnel data" description="Move deals through stages to build the funnel." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cohorts">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Revenue cohorts</CardTitle>
                <CardDescription>Accounts grouped by the month they were onboarded, with churn and expansion attached.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.cohorts.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 text-left font-medium">Cohort</th>
                        <th className="py-2 text-right font-medium">Accounts</th>
                        <th className="py-2 text-right font-medium">ARR</th>
                        <th className="py-2 text-right font-medium">Churned</th>
                        <th className="py-2 text-right font-medium">Expansion</th>
                        <th className="py-2 text-right font-medium">Net retention</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {data.cohorts.map((cohort) => {
                        const net = cohort.arr ? ((cohort.arr + cohort.expansion) / cohort.arr) * 100 : 0;
                        return (
                          <tr key={cohort.cohort}>
                            <td className="py-2.5 font-medium">{cohort.cohort}</td>
                            <td className="tabular py-2.5 text-right">{formatNumber(cohort.accounts)}</td>
                            <td className="tabular py-2.5 text-right">{formatCurrency(cohort.arr, { compact: true })}</td>
                            <td className={`tabular py-2.5 text-right ${cohort.churned ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>{formatNumber(cohort.churned)}</td>
                            <td className="tabular py-2.5 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(cohort.expansion, { compact: true })}</td>
                            <td className="tabular py-2.5 text-right">{net ? formatPercent(net) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={Users} title="No cohorts yet" description="Cohorts build from the onboarding date on each account." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Health distribution</CardTitle>
                  <CardDescription>Customer Health Score split across the portfolio.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.health.buckets.length ? (
                  <DonutBreakdown data={data.health.buckets.map((bucket) => ({ label: bucket.label, value: bucket.count }))} />
                ) : (
                  <EmptyState icon={Gauge} title="No health data" description="Health scores are computed by the engines." compact />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>At-risk revenue</CardTitle>
                  <CardDescription>Accounts below the churn threshold set for this organization.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Accounts at risk" value={`${formatNumber(data.health.churnRisk)} of ${data.health.buckets.reduce((acc, bucket) => acc + bucket.count, 0)}`} tone="danger" />
                <InfoRow label="Total ARR tracked" value={formatCurrency(data.health.totalArr)} />
                <div className="pt-2">
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href="/customers?health=at_risk">Open at-risk accounts</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Activity mix</CardTitle>
                  <CardDescription>What the team is spending its time on.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.dimensions.activityMix.length ? (
                  <BarsByCategory data={data.dimensions.activityMix.map((row) => ({ label: titleCase(row.key.replace(/_/g, " ")), value: row.count }))} height={260} horizontal color="#34d399" />
                ) : (
                  <EmptyState icon={Activity} title="No activity logged" description="Log calls, emails and meetings to see the mix." compact />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Outcome quality by rep</CardTitle>
                  <CardDescription>Logged activities with a positive outcome, per team member.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.dimensions.responseByUser.length ? (
                  <BarsByCategory data={data.dimensions.responseByUser.map((row) => ({ label: shortName(row.key), value: row.positive }))} height={260} horizontal color="#fbbf24" />
                ) : (
                  <EmptyState icon={Users} title="No rep data" description="Activity outcomes populate this view." compact />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Automations feeding the numbers</CardTitle>
                <CardDescription>Runs and reliability for every playbook in the workspace.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.automationOptions.length ? (
                <ul className="divide-y divide-border/60">
                  {data.automationOptions.map((automation) => (
                    <li key={automation.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                      <Link href={`/automations/${automation.id}`} className="truncate hover:underline">
                        {automation.name}
                      </Link>
                      <span className="flex shrink-0 items-center gap-5 text-xs text-muted-foreground">
                        <span>{formatNumber(automation.runCount)} runs</span>
                        <span className={automation.failureCount ? "text-amber-600 dark:text-amber-400" : ""}>{formatNumber(automation.failureCount)} failed</span>
                        <span>{formatNumber(automation.hoursSaved)}h saved</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Activity} title="No automations" description="Create a playbook to automate the follow-up." action={{ label: "Open automations", href: "/automations" }} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Efficiency scorecard</CardTitle>
                <CardDescription>The operational inputs behind the efficiency KPI.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ScoreBars
                factors={[
                  { label: "SLA adherence", score: headline.slaAdherence, weight: 0.3, detail: `${formatPercent(headline.slaAdherence)} of tickets inside SLA` },
                  { label: "On-time invoicing", score: headline.onTimePaymentRate, weight: 0.15, detail: `${formatPercent(headline.onTimePaymentRate)} of invoices paid on time` },
                  { label: "Automation reliability", score: 100 - headline.automationFailureRate, weight: 0.15, detail: `${formatPercent(100 - headline.automationFailureRate)} of runs succeeded` },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function shortName(key: string) {
  if (!key || key.startsWith("usr")) return "Team member";
  return key;
}
