"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { Activity, ArrowLeft, Briefcase, LifeBuoy, Loader2, Mail, Phone, Receipt, ShieldAlert, Sparkles, TrendingUp, UserRound } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { AreaTrend, ScoreBars, ScoreRing } from "@/components/charts";
import { HealthBadge, InlineError, PriorityBadge, StageBadge, StatusPill } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiMutation, useApiQuery, qk } from "@/hooks/use-api";
import { formatCompactCurrency, formatCurrency, formatDate, formatDateTime, formatNumber, relativeTime, titleCase } from "@/lib/utils";

type Customer = {
  id: string;
  name: string;
  code: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  segment: string;
  region: string | null;
  country: string | null;
  city: string | null;
  companySize: string | null;
  employeeCount: number | null;
  status: string;
  plan: string | null;
  tier: string | null;
  supportTier: string | null;
  arr: number;
  mrr: number;
  lifetimeValue: number;
  expansionMrr: number;
  churnedMrr: number;
  healthScore: number;
  healthTrend: string;
  churnProbability: number;
  engagementScore: number;
  supportScore: number;
  usageScore: number;
  revenueScore: number;
  npsScore: number | null;
  openTicketCount: number;
  openDealCount: number;
  activityCount: number;
  acquisitionChannel: string | null;
  contractStart: string | null;
  renewalDate: string | null;
  onboardedAt: string | null;
  lastActivityAt: string | null;
  notes: string | null;
  tags: string[];
  owner: { id: string; name: string } | null;
  csm: { id: string; name: string } | null;
};

type DetailResponse = {
  customer: Customer;
  health: {
    score: number;
    band: string;
    trend: string;
    churnProbability: number;
    factors: { key: string; label: string; score: number; weight: number; detail: string }[];
  };
  contacts: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; title: string | null; isPrimary: boolean; role: string | null; lastContactedAt: string | null }[];
  opportunities: { id: string; code: string; name: string; stage: string; amount: number; probability: number; expectedCloseDate: string | null; owner: { name: string } | null }[];
  activities: { id: string; type: string; subject: string; occurredAt: string; outcome: string | null; user: { name: string } | null }[];
  tickets: { id: string; reference: string; subject: string; status: string; priority: string; slaBreached: boolean; openedAt: string; csatScore: number | null }[];
  invoices: { id: string; number: string; status: string; total: number; issuedAt: string; dueAt: string; paidAt: string | null }[];
  risks: { id: string; title: string; severity: string; status: string; impact: number; riskScore: number }[];
  insights: { id: string; title: string; priority: string; category: string; estimatedImpact: number }[];
  finance: { invoicesTotal: number; overdue: number; wonValue: number; openValue: number };
  revenueSeries: { period: string; value: number }[];
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const query = useApiQuery<DetailResponse>(qk.customer(params.id), `/api/customers/${params.id}`);
  const [notes, setNotes] = React.useState("");
  const note = useNoteMutation<Customer>(params.id);

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Account not found" description="It may have been deleted or belongs to another organization." />
        <InlineError message={query.error?.message ?? "We could not load this account."} onRetry={() => query.refetch()} />
        <Button asChild variant="outline" size="sm">
          <Link href="/customers">
            <ArrowLeft className="size-3.5" /> Back to customers
          </Link>
        </Button>
      </div>
    );
  }

  const data = query.data.data;
  const customer = data.customer;
  const openOpportunities = data.opportunities.filter((deal) => !["WON", "LOST"].includes(deal.stage));

  return (
    <div className="space-y-6">
      <Link href="/customers" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Customers
      </Link>

      <PageHeader
        eyebrow={`${customer.code} · ${titleCase(customer.segment)} · ${customer.industry ?? "Industry not set"}`}
        title={customer.name}
        description={
          <>
            {formatCurrency(customer.arr)} ARR · {formatCurrency(customer.mrr)} MRR ·{" "}
            {customer.renewalDate ? `renews ${formatDate(customer.renewalDate)}` : "no renewal date on file"} ·{" "}
            {customer.country ?? "—"} {customer.employeeCount ? `· ${formatNumber(customer.employeeCount)} employees` : ""}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={customer.status} className="h-7 px-2.5 text-xs" />
            <HealthBadge score={customer.healthScore} />
            {customer.website ? (
              <Button asChild variant="outline" size="sm">
                <a href={customer.website.startsWith("http") ? customer.website : `https://${customer.website}`} target="_blank" rel="noreferrer">
                  Website
                </a>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Customer Health Score</CardTitle>
              <CardDescription>
                Weighted across engagement, revenue, product usage, support load and activity — recalculated from live rows, not stored by hand.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex flex-col items-center gap-2">
              <ScoreRing score={data.health.score} label="Health" sublabel={titleCase(data.health.band)} />
              <Badge variant={data.health.trend === "IMPROVING" ? "success" : data.health.trend === "DECLINING" ? "danger" : "neutral"} className="font-normal">
                {titleCase(data.health.trend)}
              </Badge>
            </div>
            <div className="min-w-0 flex-1">
              <ScoreBars
                factors={data.health.factors.map((factor) => ({ label: factor.label, score: factor.score, weight: factor.weight, detail: factor.detail }))}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Commercial snapshot</CardTitle>
                <CardDescription>Renewal exposure at a glance.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <Row label="Churn probability" value={`${data.health.churnProbability}%`} tone={data.health.churnProbability >= 60 ? "danger" : undefined} />
              <Row label="Lifetime value" value={formatCurrency(customer.lifetimeValue)} />
              <Row label="Expansion revenue" value={formatCurrency(customer.expansionMrr)} />
              <Row label="Contract start" value={customer.contractStart ? formatDate(customer.contractStart) : "—"} />
              <Row label="Renewal date" value={customer.renewalDate ? formatDate(customer.renewalDate) : "—"} />
              <Row label="Acquisition" value={customer.acquisitionChannel ? titleCase(customer.acquisitionChannel) : "—"} />
              <div className="h-px w-full bg-border/70" />
              <Row label="Owner" value={customer.owner?.name ?? "Unassigned"} />
              <Row label="Success manager" value={customer.csm?.name ?? "Unassigned"} />
              {customer.tags.length ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {customer.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Account note</CardTitle>
                <CardDescription>Written to the audit trail under your name.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field>
                <Label htmlFor="customer-note" className="sr-only">
                  Note
                </Label>
                <Textarea id="customer-note" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={customer.notes ?? "Capture the latest context for this account…"} />
              </Field>
              <Button
                size="sm"
                className="w-full"
                disabled={!notes.trim() || note.isPending}
                onClick={() => note.mutate({ notes: `[${new Date().toISOString().slice(0, 10)}] ${notes.trim()}` }, { onSuccess: () => setNotes("") })}
              >
                {note.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Save note
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Open pipeline" value={formatCompactCurrency(data.finance.openValue)} hint={`${openOpportunities.length} open opportunities`} />
        <Metric label="Closed won" value={formatCompactCurrency(data.finance.wonValue)} hint="Historical value from this account" />
        <Metric label="Invoiced" value={formatCompactCurrency(data.finance.invoicesTotal)} hint={data.finance.overdue ? `${formatCompactCurrency(data.finance.overdue)} overdue` : "Nothing overdue"} tone={data.finance.overdue ? "danger" : undefined} />
        <Metric label="Open tickets" value={formatNumber(customer.openTicketCount)} hint={`Support score ${customer.supportScore}/100`} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities ({data.opportunities.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity ({data.activities.length})</TabsTrigger>
          <TabsTrigger value="support">Support ({data.tickets.length})</TabsTrigger>
          <TabsTrigger value="billing">Billing ({data.invoices.length})</TabsTrigger>
          <TabsTrigger value="risk">Risk ({data.risks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Revenue trend</CardTitle>
                <CardDescription>Closed-won value per month for this account.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.revenueSeries.length ? (
                <AreaTrend data={data.revenueSeries.map((point) => ({ period: point.period, value: point.value }))} height={240} />
              ) : (
                <EmptyState icon={TrendingUp} title="No closed revenue yet" description="Once a deal closes on this account the trend appears." compact />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserRound className="size-4" /> Contacts ({data.contacts.length})
                  </CardTitle>
                  <CardDescription>Decision makers and day-to-day stakeholders.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.contacts.length ? (
                  data.contacts.map((contact) => (
                    <div key={contact.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[13px] font-medium">
                          {contact.firstName} {contact.lastName}
                          {contact.isPrimary ? <Badge variant="info" className="font-normal">Primary</Badge> : null}
                        </p>
                        <p className="text-2xs text-muted-foreground">{contact.title ?? "Role not set"}</p>
                      </div>
                      <div className="shrink-0 space-y-1 text-right text-2xs text-muted-foreground">
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} className="flex items-center justify-end gap-1.5 hover:text-foreground">
                            <Mail className="size-3" /> {contact.email}
                          </a>
                        ) : null}
                        {contact.phone ? (
                          <a href={`tel:${contact.phone}`} className="flex items-center justify-end gap-1.5 hover:text-foreground">
                            <Phone className="size-3" /> {contact.phone}
                          </a>
                        ) : null}
                        <p>{contact.lastContactedAt ? `Last contacted ${relativeTime(contact.lastContactedAt)}` : "Never contacted"}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState icon={UserRound} title="No contacts" description="Add a contact to track who you talk to at this account." compact />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="size-4" /> Intelligence on this account
                  </CardTitle>
                  <CardDescription>Findings that reference this customer.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {data.insights.length ? (
                  data.insights.map((insight) => (
                    <Link key={insight.id} href={`/intelligence/${insight.id}`} className="block rounded-lg border border-border/70 p-2.5 transition-colors hover:bg-muted/40">
                      <div className="flex items-center gap-2">
                        <PriorityBadge value={insight.priority} />
                        <span className="text-2xs text-muted-foreground">{formatCompactCurrency(insight.estimatedImpact)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs font-medium">{insight.title}</p>
                    </Link>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No findings reference this account right now.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="opportunities">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="size-4" /> Deals on this account
                </CardTitle>
                <CardDescription>{formatCurrency(data.finance.wonValue)} won to date · {formatCurrency(data.finance.openValue)} still open</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.opportunities.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 text-left font-medium">Deal</th>
                        <th className="py-2 text-left font-medium">Stage</th>
                        <th className="py-2 text-right font-medium">Value</th>
                        <th className="py-2 text-left font-medium">Close</th>
                        <th className="py-2 text-left font-medium">Owner</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {data.opportunities.map((deal) => (
                        <tr key={deal.id}>
                          <td className="py-2.5">
                            <Link href={`/opportunities/${deal.id}`} className="hover:underline">
                              <span className="tabular text-2xs text-muted-foreground">{deal.code}</span>
                              <span className="ml-2 font-medium">{deal.name}</span>
                            </Link>
                          </td>
                          <td className="py-2.5">
                            <StageBadge value={deal.stage} />
                          </td>
                          <td className="tabular py-2.5 text-right">{formatCurrency(deal.amount, { compact: true })}</td>
                          <td className="py-2.5 text-xs text-muted-foreground">{deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "—"}</td>
                          <td className="py-2.5 text-xs text-muted-foreground">{deal.owner?.name ?? "Unassigned"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={Briefcase} title="No deals yet" description="Create an opportunity to start the commercial history for this account." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-4" /> Engagement history
                </CardTitle>
                <CardDescription>{customer.activityCount} logged touchpoints · last activity {customer.lastActivityAt ? relativeTime(customer.lastActivityAt) : "never"}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.activities.length ? (
                <ul className="divide-y divide-border/60">
                  {data.activities.map((activity) => (
                    <li key={activity.id} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-2xs uppercase tracking-wide text-muted-foreground">{activity.type.replace(/_/g, " ")}</p>
                        <p className="text-[13px] font-medium">{activity.subject}</p>
                        <p className="text-2xs text-muted-foreground">
                          {activity.user?.name ?? "Unassigned"}
                          {activity.outcome ? ` · ${activity.outcome}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-2xs text-muted-foreground">{formatDateTime(activity.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Activity} title="No activity logged" description="Calls, emails and meetings on this account will appear here." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="support">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <LifeBuoy className="size-4" /> Support tickets
                </CardTitle>
                <CardDescription>{data.tickets.filter((ticket) => ticket.slaBreached).length} SLA breaches recorded</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.tickets.length ? (
                <ul className="divide-y divide-border/60">
                  {data.tickets.map((ticket) => (
                    <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[13px] font-medium">
                          {ticket.reference}
                          <StatusPill value={ticket.status} />
                          {ticket.slaBreached ? <Badge variant="danger" className="font-normal">SLA breached</Badge> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{ticket.subject}</p>
                      </div>
                      <div className="shrink-0 text-right text-2xs text-muted-foreground">
                        <p>{titleCase(ticket.priority)} priority</p>
                        <p>Opened {relativeTime(ticket.openedAt)}</p>
                        {ticket.csatScore ? <p>CSAT {ticket.csatScore}/5</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={LifeBuoy} title="No support tickets" description="This account has not opened any tickets." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="size-4" /> Invoices
                </CardTitle>
                <CardDescription>
                  {formatCurrency(data.finance.invoicesTotal)} invoiced · {data.finance.overdue ? `${formatCurrency(data.finance.overdue)} overdue` : "nothing overdue"}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.invoices.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 text-left font-medium">Invoice</th>
                        <th className="py-2 text-left font-medium">Status</th>
                        <th className="py-2 text-right font-medium">Total</th>
                        <th className="py-2 text-left font-medium">Issued</th>
                        <th className="py-2 text-left font-medium">Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {data.invoices.map((invoice) => {
                        const overdue = invoice.status !== "PAID" && new Date(invoice.dueAt) < new Date();
                        return (
                          <tr key={invoice.id}>
                            <td className="py-2.5 font-medium">{invoice.number}</td>
                            <td className="py-2.5">
                              <StatusPill value={overdue ? "OPEN" : invoice.status} />
                            </td>
                            <td className="tabular py-2.5 text-right">{formatCurrency(invoice.total)}</td>
                            <td className="py-2.5 text-xs text-muted-foreground">{formatDate(invoice.issuedAt)}</td>
                            <td className={`py-2.5 text-xs ${overdue ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>{formatDate(invoice.dueAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={Receipt} title="No invoices" description="Invoices raised against this account will be listed here." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="size-4" /> Risks on this account
                </CardTitle>
                <CardDescription>Detected exposure, with the mitigation in place.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.risks.length ? (
                data.risks.map((risk) => (
                  <Link key={risk.id} href={`/risks/${risk.id}`} className="block rounded-lg border border-border/70 p-3 transition-colors hover:bg-muted/40">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge value={risk.severity} />
                      <StatusPill value={risk.status} />
                      <span className="text-2xs text-muted-foreground">score {risk.riskScore} · {formatCompactCurrency(risk.impact)}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] font-medium">{risk.title}</p>
                  </Link>
                ))
              ) : (
                <EmptyState icon={ShieldAlert} title="No risks detected" description="The risk engine has not flagged this account." />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Small helper: PATCH the account note and refresh the cached account. */
function useNoteMutation<T>(customerId: string) {
  const update = useApiMutation<T, { notes: string }>({
    path: `/api/customers/${customerId}`,
    method: "PATCH",
    invalidate: [["customers"], qk.customer(customerId)],
    successMessage: "Note saved to the account.",
  });
  return update;
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className={`tabular mt-2 text-2xl font-semibold leading-none ${tone === "danger" ? "text-rose-600 dark:text-rose-400" : ""}`}>{value}</p>
        <p className="mt-2 text-2xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${tone === "danger" ? "text-rose-600 dark:text-rose-400" : ""}`}>{value}</span>
    </div>
  );
}
