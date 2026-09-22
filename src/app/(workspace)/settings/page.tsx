"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { AlertTriangle, Bell, Building2, CreditCard, KeyRound, Loader2, MonitorSmartphone, Plus, Save, ShieldCheck, Trash2, UserCog, Webhook } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { ConfirmDialog, InlineError, InfoRow, StatCard, StatusPill } from "@/components/domain";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldHint, Label } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { Skeleton, SkeletonCards } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiMutation, useApiQuery, qk, toast } from "@/hooks/use-api";
import { ROLE_LABELS, type RoleName } from "@/lib/rbac";
import { formatCurrency, formatDate, formatNumber, formatPercent, relativeTime, titleCase } from "@/lib/utils";

type SettingsResponse = {
  organization: {
    id: string;
    name: string;
    slug: string;
    legalName: string | null;
    domain: string | null;
    industry: string | null;
    hqCountry: string | null;
    companySize: string | null;
    plan: string;
    dataRegion: string | null;
    timezone: string;
    currency: string;
    locale: string;
    fiscalYearStart: number;
    aiEngineEnabled: boolean;
    churnRiskThreshold: number;
    primaryColor: string | null;
    onboardedAt: string | null;
    createdAt: string;
  };
  plan: { id: string; name: string; monthlyPrice: number; currency: string; seatsIncluded: number; seatPrice: number; highlights: string[]; features: Record<string, boolean>; limits: Record<string, number> };
  role: string;
};

type MeResponse = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  timezone: string;
  locale: string;
  themePreference: string;
  emailVerifiedAt: string | null;
  organization: { id: string; name: string; plan: string; role: string };
  memberships: { organizationId: string; organizationName: string; role: string; plan: string }[];
};

type BillingResponse = {
  plan: SettingsResponse["plan"];
  catalogue: { id: string; name: string; tagline: string; monthlyPrice: number; annualPrice: number; seatsIncluded: number; seatPrice: number; features: Record<string, boolean>; limits: Record<string, number> }[];
  subscription: { id: string; plan: string; status: string; seats: number; seatPrice: number; mrr: number; billingInterval: string; billingEmail: string | null; discountPercent: number; currentPeriodStart: string; currentPeriodEnd: string; trialEndsAt: string | null; cancelAtPeriodEnd: boolean; stripeCustomerId: string | null } | null;
  invoices: { id: string; number: string; status: string; subtotal: number; taxAmount: number; total: number; currency: string; seats: number; issuedAt: string; dueAt: string; paidAt: string | null; hostedUrl: string | null; lineItems: { quantity: number; unitAmount: number; description: string }[] }[];
  usage: { key: string; label: string; used: number; limit: number; unit: string }[];
};

type WebhookRow = { id: string; url: string; description: string | null; events: string[]; active: boolean; failureCount: number; lastTriggeredAt: string | null; secret: string; createdAt: string };
type ApiKeyRow = { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string };

const WEBHOOK_EVENTS = ["deal.won", "deal.lost", "deal.stage_changed", "customer.health_dropped", "risk.detected", "insight.detected", "automation.failed", "report.generated"];
const TABS = ["profile", "organization", "billing", "security", "api", "danger"];

function SettingsPageContent() {
  const params = useSearchParams();
  const initialTab = TABS.includes(params.get("tab") ?? "") ? (params.get("tab") as string) : "profile";

  const me = useApiQuery<MeResponse>(["me", "profile"], "/api/me");
  const organization = useApiQuery<SettingsResponse>(["settings"], "/api/settings");
  const billing = useApiQuery<BillingResponse>(qk.billing, "/api/billing");
  const webhooks = useApiQuery<{ webhooks: WebhookRow[]; events: string[]; signing: string }>(qk.webhooks, "/api/webhooks");
  const apiKeys = useApiQuery<{ items: ApiKeyRow[]; allowance: number; apiEnabled: boolean; canManage: boolean }>(qk.apiKeys, "/api/api-keys");

  const [profile, setProfile] = React.useState({ name: "", jobTitle: "", timezone: "", locale: "", themePreference: "" });
  const [org, setOrg] = React.useState({ name: "", industry: "", currency: "", timezone: "", churnRiskThreshold: "", aiEngineEnabled: true });
  const [webhookOpen, setWebhookOpen] = React.useState(false);
  const [keyOpen, setKeyOpen] = React.useState(false);
  const [webhookForm, setWebhookForm] = React.useState({ url: "", description: "", events: ["deal.won"] as string[] });
  const [keyForm, setKeyForm] = React.useState({ name: "", scopes: ["read"] as string[] });
  const [newSecret, setNewSecret] = React.useState<{ label: string; value: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (me.data?.data) {
      const user = me.data.data;
      setProfile({ name: user.name, jobTitle: user.jobTitle ?? "", timezone: user.timezone, locale: user.locale, themePreference: user.themePreference });
    }
  }, [me.data]);

  React.useEffect(() => {
    if (organization.data?.data.organization) {
      const row = organization.data.data.organization;
      setOrg({
        name: row.name,
        industry: row.industry ?? "",
        currency: row.currency,
        timezone: row.timezone,
        churnRiskThreshold: String(row.churnRiskThreshold),
        aiEngineEnabled: row.aiEngineEnabled,
      });
    }
  }, [organization.data]);

  const saveProfile = useApiMutation<MeResponse, Record<string, unknown>>({
    path: "/api/me",
    method: "PATCH",
    invalidate: [["me", "profile"]],
    successMessage: "Profile updated.",
    onSettled: () => setBusy(null),
  });

  const saveOrg = useApiMutation<SettingsResponse["organization"], Record<string, unknown>>({
    path: "/api/settings",
    method: "PATCH",
    invalidate: [["settings"], qk.dashboard, ["intelligence"]],
    successMessage: "Organization settings saved — engines and reports now use the new configuration.",
    onSettled: () => setBusy(null),
  });

  const changePlan = useApiMutation<BillingResponse, { plan: string; seats?: number }>({
    path: "/api/billing",
    method: "PATCH",
    invalidate: [qk.billing, ["settings"], ["me", "profile"]],
    successMessage: (data) => `Subscription updated to ${data.plan.name}.`,
    onSettled: () => setBusy(null),
  });

  const createWebhook = useApiMutation<WebhookRow, typeof webhookForm>({
    path: "/api/webhooks",
    invalidate: [qk.webhooks],
    onSuccess: (data) => {
      setWebhookOpen(false);
      setNewSecret({ label: `${data.data.url} signing secret`, value: data.data.secret });
      setWebhookForm({ url: "", description: "", events: ["deal.won"] });
    },
    onSettled: () => setBusy(null),
  });

  const toggleWebhook = useApiMutation<WebhookRow, { id: string; active: boolean }>({
    path: (variables: { id: string }) => `/api/webhooks/${variables.id}`,
    method: "PATCH",
    invalidate: [qk.webhooks],
    successMessage: (data) => `Webhook ${data.active ? "enabled" : "paused"}.`,
    onSettled: () => setBusy(null),
  });

  const removeWebhook = useApiMutation<{ id: string }, { id: string }>({
    path: (variables: { id: string }) => `/api/webhooks/${variables.id}`,
    method: "DELETE",
    invalidate: [qk.webhooks],
    successMessage: "Webhook removed.",
    onSettled: () => setBusy(null),
  });

  const createKey = useApiMutation<{ id: string; name: string; prefix: string; secret: string }, typeof keyForm>({
    path: "/api/api-keys",
    invalidate: [qk.apiKeys],
    onSuccess: (data) => {
      setKeyOpen(false);
      setNewSecret({ label: `API key “${data.data.name}”`, value: data.data.secret });
      setKeyForm({ name: "", scopes: ["read"] });
    },
    onSettled: () => setBusy(null),
  });

  const revokeKey = useApiMutation<{ id: string; revokedAt: string }, { id: string }>({
    path: (variables: { id: string }) => `/api/api-keys/${variables.id}`,
    method: "DELETE",
    invalidate: [qk.apiKeys],
    successMessage: "API key revoked.",
    onSettled: () => setBusy(null),
  });

  const sessions = useApiQuery<{ items: { id: string; device: string | null; ip: string | null; lastSeenAt: string; expiresAt: string; revokedAt: string | null; currentSessionId: string }[]; currentSessionId: string }>(qk.sessions, "/api/sessions");

  const revokeAll = useApiMutation<{ count: number }, void>({
    path: "/api/sessions?all=true",
    method: "DELETE",
    invalidate: [qk.sessions],
    successMessage: (data) => `${data.count} other session${data.count === 1 ? "" : "s"} revoked.`,
    onSettled: () => setBusy(null),
  });

  const signOutEverywhere = useApiMutation<{ ok: boolean }, void>({
    path: "/api/auth/logout",
    method: "POST",
    successMessage: "Signed out of this device.",
    onSuccess: () => {
      window.location.href = "/login";
    },
  });

  const orgData = organization.data?.data;
  const meData = me.data?.data;
  const billingData = billing.data?.data;
  const canManageOrg = ["OWNER", "ADMIN"].includes(orgData?.role ?? "");

  if (organization.isLoading || me.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="Loading configuration…" />
        <SkeletonCards />
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Your profile, the organization configuration the engines read, billing, security, webhooks and API access."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/audit">
              <ShieldCheck className="size-3.5" /> View audit trail
            </Link>
          </Button>
        }
      />

      {organization.isError ? <InlineError message={organization.error?.message ?? "Could not load settings."} onRetry={() => organization.refetch()} /> : null}

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="api">Webhooks & API</TabsTrigger>
          <TabsTrigger value="danger">Danger zone</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserCog className="size-4" /> Your profile
                  </CardTitle>
                  <CardDescription>How you appear across the workspace and in audit entries.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label htmlFor="profile-name">Full name</Label>
                    <Input id="profile-name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
                  </Field>
                  <Field>
                    <Label htmlFor="profile-email">Email</Label>
                    <Input id="profile-email" value={meData?.email ?? ""} disabled />
                    <FieldHint>{meData?.emailVerifiedAt ? `Verified ${formatDate(meData.emailVerifiedAt)}` : "Not verified yet"}</FieldHint>
                  </Field>
                  <Field>
                    <Label htmlFor="profile-title">Job title</Label>
                    <Input id="profile-title" value={profile.jobTitle} onChange={(event) => setProfile({ ...profile, jobTitle: event.target.value })} />
                  </Field>
                  <Field>
                    <Label htmlFor="profile-timezone">Timezone</Label>
                    <NativeSelect id="profile-timezone" value={profile.timezone} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}>
                      {["Europe/Lisbon", "Europe/London", "Europe/Berlin", "Europe/Madrid", "America/New_York", "America/Los_Angeles", "UTC"].map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <Label htmlFor="profile-locale">Locale</Label>
                    <NativeSelect id="profile-locale" value={profile.locale} onChange={(event) => setProfile({ ...profile, locale: event.target.value })}>
                      {["en-GB", "en-US", "pt-PT", "es-ES", "fr-FR", "de-DE"].map((locale) => (
                        <option key={locale} value={locale}>
                          {locale}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <Label htmlFor="profile-theme">Theme</Label>
                    <NativeSelect id="profile-theme" value={profile.themePreference} onChange={(event) => setProfile({ ...profile, themePreference: event.target.value })}>
                      {["system", "light", "dark"].map((theme) => (
                        <option key={theme} value={theme}>
                          {titleCase(theme)}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
                <Button
                  size="sm"
                  disabled={saveProfile.isPending}
                  onClick={() => {
                    setBusy("profile");
                    saveProfile.mutate(profile);
                  }}
                >
                  {saveProfile.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  Save profile
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Your access</CardTitle>
                    <CardDescription>Which organizations you can reach and with what role.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(meData?.memberships ?? []).map((membership) => (
                    <div key={membership.organizationId} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{membership.organizationName}</p>
                        <p className="text-2xs text-muted-foreground">{membership.plan} plan</p>
                      </div>
                      <Badge variant={membership.role === "OWNER" ? "solid" : "neutral"} className="font-normal">
                        {ROLE_LABELS[membership.role as RoleName] ?? membership.role}
                      </Badge>
                    </div>
                  ))}
                  <InfoRow label="Active workspace" value={orgData?.organization.name ?? "—"} />
                  <InfoRow label="Your role here" value={ROLE_LABELS[(orgData?.role ?? "MEMBER") as RoleName] ?? orgData?.role ?? "—"} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="size-4" /> Notification preferences
                    </CardTitle>
                    <CardDescription>How the platform reaches you.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs">
                  <InfoRow label="In-app notifications" value="Enabled" tone="positive" />
                  <InfoRow label="Opportunity & risk alerts" value="Enabled" tone="positive" />
                  <InfoRow label="Email digests" value="Queued — needs SMTP" />
                  <Button asChild variant="outline" size="sm" className="mt-2 w-full">
                    <Link href="/notifications">Open notification centre</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="organization">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="size-4" /> Organization
                  </CardTitle>
                  <CardDescription>The engines, reports and scoring use these values.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label htmlFor="org-name">Display name</Label>
                    <Input id="org-name" value={org.name} onChange={(event) => setOrg({ ...org, name: event.target.value })} disabled={!canManageOrg} />
                  </Field>
                  <Field>
                    <Label htmlFor="org-industry">Industry</Label>
                    <Input id="org-industry" value={org.industry} onChange={(event) => setOrg({ ...org, industry: event.target.value })} disabled={!canManageOrg} />
                  </Field>
                  <Field>
                    <Label htmlFor="org-currency">Reporting currency</Label>
                    <NativeSelect id="org-currency" value={org.currency} onChange={(event) => setOrg({ ...org, currency: event.target.value })} disabled={!canManageOrg}>
                      {["EUR", "USD", "GBP", "CHF"].map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <Label htmlFor="org-timezone">Timezone</Label>
                    <NativeSelect id="org-timezone" value={org.timezone} onChange={(event) => setOrg({ ...org, timezone: event.target.value })} disabled={!canManageOrg}>
                      {["Europe/Lisbon", "Europe/London", "Europe/Berlin", "UTC"].map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <Label htmlFor="org-threshold">Churn risk threshold</Label>
                    <Input
                      id="org-threshold"
                      type="number"
                      min="1"
                      max="99"
                      value={org.churnRiskThreshold}
                      onChange={(event) => setOrg({ ...org, churnRiskThreshold: event.target.value })}
                      disabled={!canManageOrg}
                    />
                    <FieldHint>Accounts at or above this churn probability are flagged as at risk.</FieldHint>
                  </Field>
                  <Field>
                    <Label htmlFor="org-ai">Intelligence engine</Label>
                    <NativeSelect id="org-ai" value={org.aiEngineEnabled ? "on" : "off"} onChange={(event) => setOrg({ ...org, aiEngineEnabled: event.target.value === "on" })} disabled={!canManageOrg}>
                      <option value="on">Enabled</option>
                      <option value="off">Disabled</option>
                    </NativeSelect>
                    <FieldHint>Disabling stops scheduled engine runs; manual runs stay available.</FieldHint>
                  </Field>
                </div>
                <Button
                  size="sm"
                  disabled={!canManageOrg || saveOrg.isPending}
                  onClick={() => {
                    setBusy("org");
                    saveOrg.mutate({ ...org, churnRiskThreshold: Number(org.churnRiskThreshold) });
                  }}
                >
                  {saveOrg.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  Save organization
                </Button>
                {!canManageOrg ? <Alert tone="warning" title="Read-only">Only owners and admins can change organization settings. Your role is {orgData?.role.toLowerCase()}.</Alert> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Tenant facts</CardTitle>
                  <CardDescription>Isolation and residency details.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <InfoRow label="Workspace slug" value={orgData?.organization.slug ?? "—"} mono />
                <InfoRow label="Legal entity" value={orgData?.organization.legalName ?? "—"} />
                <InfoRow label="Data region" value={orgData?.organization.dataRegion ?? "eu-west-1"} />
                <InfoRow label="Fiscal year starts" value={`Month ${orgData?.organization.fiscalYearStart ?? 1}`} />
                <InfoRow label="Onboarded" value={orgData?.organization.onboardedAt ? formatDate(orgData.organization.onboardedAt) : "—"} />
                <InfoRow label="Tenant created" value={orgData?.organization.createdAt ? formatDate(orgData.organization.createdAt) : "—"} />
                <div className="h-px w-full bg-border/70" />
                <p className="text-2xs leading-relaxed text-muted-foreground">
                  Every query in the platform is scoped by organization id, and cross-tenant reads are rejected at the server layer — not just hidden in the interface.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          {billingData ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Current plan" value={billingData.plan.name} hint={`${formatCurrency(billingData.plan.monthlyPrice)} / month`} icon={CreditCard} />
                <StatCard label="MRR" value={formatCurrency(billingData.subscription?.mrr ?? 0)} hint={`${formatNumber(billingData.subscription?.seats ?? 0)} seats at ${formatCurrency(billingData.subscription?.seatPrice ?? 0)}`} />
                <StatCard label="Billing status" value={titleCase(billingData.subscription?.status ?? "—")} hint={billingData.subscription ? `Renews ${formatDate(billingData.subscription.currentPeriodEnd)}` : "No subscription"} tone={billingData.subscription?.status === "ACTIVE" ? "positive" : "warning"} />
                <StatCard label="Invoices" value={formatNumber(billingData.invoices.length)} hint={`${billingData.invoices.filter((invoice) => invoice.status !== "PAID").length} outstanding`} />
              </div>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Plans</CardTitle>
                    <CardDescription>Starter €99 · Growth €399 · Scale €999 per month, Enterprise on request. Switching is immediate and prorated on the next invoice.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-4">
                  {billingData.catalogue.map((plan) => (
                    <div key={plan.id} className={`flex flex-col justify-between gap-3 rounded-xl border p-4 ${plan.id === billingData.plan.id ? "border-primary/40 bg-primary/[0.04]" : "border-border/70"}`}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{plan.name}</p>
                          {plan.id === billingData.plan.id ? <Badge variant="info" className="font-normal">Current</Badge> : null}
                        </div>
                        <p className="text-2xs leading-relaxed text-muted-foreground">{plan.tagline}</p>
                        <p className="tabular text-lg font-semibold">
                          {plan.monthlyPrice ? `${formatCurrency(plan.monthlyPrice)}` : "Custom"}
                          <span className="ml-1 text-2xs font-normal text-muted-foreground">/ month</span>
                        </p>
                        <ul className="space-y-1 text-2xs text-muted-foreground">
                          <li>{formatNumber(plan.seatsIncluded)} seats included</li>
                          <li>{formatNumber(plan.limits.customers ?? 0)} customers</li>
                          <li>{formatNumber(plan.limits.opportunities ?? 0)} opportunities</li>
                          <li>{plan.limits.apiCallsPerDay ? `${formatNumber(plan.limits.apiCallsPerDay)} API calls / day` : "No API access"}</li>
                          {plan.features.sso ? <li>SSO available</li> : null}
                        </ul>
                      </div>
                      {canManageOrg && plan.id !== billingData.plan.id && plan.id !== "ENTERPRISE" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={changePlan.isPending}
                          onClick={() => {
                            setBusy("plan");
                            changePlan.mutate({ plan: plan.id });
                          }}
                        >
                          Switch to {plan.name}
                        </Button>
                      ) : plan.id === "ENTERPRISE" ? (
                        <Button asChild variant="ghost" size="sm" className="h-8">
                          <a href="mailto:sales@nexus-os.example?subject=Enterprise%20plan">Talk to sales</a>
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Usage against plan limits</CardTitle>
                      <CardDescription>Limits are enforced server-side on write.</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {billingData.usage.map((row) => {
                      const pct = row.limit > 0 ? Math.min(100, (row.used / row.limit) * 100) : 0;
                      return (
                        <div key={row.key} className="space-y-1.5">
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-muted-foreground">{row.label}</span>
                            <span className="tabular font-medium">
                              {formatNumber(row.used)} / {formatNumber(row.limit)} {row.unit}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className={`h-full rounded-full ${pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(2, pct)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Subscription</CardTitle>
                      <CardDescription>Billing details as stored on the subscription record.</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    <InfoRow label="Plan" value={billingData.plan.name} />
                    <InfoRow label="Seats billed" value={formatNumber(billingData.subscription?.seats ?? 0)} />
                    <InfoRow label="Interval" value={titleCase(billingData.subscription?.billingInterval ?? "—")} />
                    <InfoRow label="Billing email" value={billingData.subscription?.billingEmail ?? "—"} />
                    <InfoRow label="Discount" value={billingData.subscription?.discountPercent ? formatPercent(billingData.subscription.discountPercent) : "None"} />
                    <InfoRow label="Current period" value={billingData.subscription ? `${formatDate(billingData.subscription.currentPeriodStart)} → ${formatDate(billingData.subscription.currentPeriodEnd)}` : "—"} />
                    <InfoRow label="Cancel at period end" value={billingData.subscription?.cancelAtPeriodEnd ? "Yes" : "No"} />
                    <Alert tone="info" title="Payment provider">
                      Invoices are generated with hosted payment links; connecting a live provider key in Integrations switches collection on for real.
                    </Alert>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Invoices</CardTitle>
                    <CardDescription>{billingData.invoices.length} platform invoices on this workspace.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {billingData.invoices.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-sm">
                        <thead>
                          <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 text-left font-medium">Invoice</th>
                            <th className="py-2 text-left font-medium">Status</th>
                            <th className="py-2 text-right font-medium">Seats</th>
                            <th className="py-2 text-right font-medium">Subtotal</th>
                            <th className="py-2 text-right font-medium">Tax</th>
                            <th className="py-2 text-right font-medium">Total</th>
                            <th className="py-2 text-left font-medium">Issued</th>
                            <th className="py-2 text-left font-medium">Due</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {billingData.invoices.map((invoice) => (
                            <tr key={invoice.id}>
                              <td className="py-2.5 font-medium">
                                {invoice.hostedUrl ? (
                                  <a href={invoice.hostedUrl} target="_blank" rel="noreferrer" className="hover:underline">
                                    {invoice.number}
                                  </a>
                                ) : (
                                  invoice.number
                                )}
                              </td>
                              <td className="py-2.5">
                                <StatusPill value={invoice.status} />
                              </td>
                              <td className="tabular py-2.5 text-right">{formatNumber(invoice.seats)}</td>
                              <td className="tabular py-2.5 text-right">{formatCurrency(invoice.subtotal)}</td>
                              <td className="tabular py-2.5 text-right text-muted-foreground">{formatCurrency(invoice.taxAmount)}</td>
                              <td className="tabular py-2.5 text-right font-medium">{formatCurrency(invoice.total)}</td>
                              <td className="py-2.5 text-xs text-muted-foreground">{formatDate(invoice.issuedAt)}</td>
                              <td className="py-2.5 text-xs text-muted-foreground">{formatDate(invoice.dueAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState icon={CreditCard} title="No invoices yet" description="Invoices appear at the end of the first billing period." />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Product metrics this workspace feeds</CardTitle>
                    <CardDescription>The platform's own growth model, computed from the same records.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <InfoRow label="MRR" value={formatCurrency(billingData.subscription?.mrr ?? 0)} />
                  <InfoRow label="ARR" value={formatCurrency((billingData.subscription?.mrr ?? 0) * 12)} />
                  <InfoRow label="ARPA" value={formatCurrency(billingData.subscription?.seats ? (billingData.subscription.mrr ?? 0) / billingData.subscription.seats : 0)} />
                  <InfoRow label="Trial days remaining" value={billingData.subscription?.trialEndsAt ? String(Math.max(0, Math.ceil((new Date(billingData.subscription.trialEndsAt).getTime() - Date.now()) / 86_400_000))) : "Not in trial"} />
                </CardContent>
              </Card>
            </>
          ) : (
            <Skeleton className="h-72" />
          )}
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MonitorSmartphone className="size-4" /> Active sessions
                  </CardTitle>
                  <CardDescription>Devices currently signed into your account.</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revokeAll.isPending || (sessions.data?.data.items.filter((session) => !session.revokedAt && session.id !== sessions.data?.data.currentSessionId).length ?? 0) === 0}
                  onClick={() => {
                    setBusy("revoke-all");
                    revokeAll.mutate();
                  }}
                >
                  Revoke all others
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {sessions.data?.data.items.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {session.device ?? "Unknown device"}
                        {session.id === sessions.data?.data.currentSessionId ? <span className="ml-1.5 text-2xs text-muted-foreground">(this device)</span> : null}
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        {session.ip ?? "no IP"} · last seen {relativeTime(session.lastSeenAt)} · expires {formatDate(session.expiresAt)}
                      </p>
                    </div>
                    {session.revokedAt ? <Badge variant="neutral" className="font-normal">Revoked</Badge> : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="size-4" /> Account security
                  </CardTitle>
                  <CardDescription>How access is protected on this platform.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5 text-xs">
                <InfoRow label="Password hashing" value="bcrypt, cost 12" />
                <InfoRow label="Session tokens" value="256-bit, SHA-256 hashed at rest" />
                <InfoRow label="Cookie flags" value="httpOnly · SameSite=Lax · Secure in production" />
                <InfoRow label="Rate limiting" value="Per-route budgets, IP scoped" />
                <InfoRow label="Sign-in lockout" value="8 failed attempts / 15 minutes" />
                <InfoRow label="Audit coverage" value="Auth, CRUD, engine runs, automation runs" />
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/forgot-password">Change password</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/audit">Open audit trail</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Least-privilege model</CardTitle>
                <CardDescription>What each role can do, enforced on every API route.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left font-medium">Role</th>
                    <th className="py-2 text-center font-medium">Read</th>
                    <th className="py-2 text-center font-medium">Write records</th>
                    <th className="py-2 text-center font-medium">Run engines</th>
                    <th className="py-2 text-center font-medium">Manage members</th>
                    <th className="py-2 text-center font-medium">Billing</th>
                    <th className="py-2 text-center font-medium">Delete workspace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {[
                    { role: "OWNER", read: true, write: true, engines: true, members: true, billing: true, delete: true },
                    { role: "ADMIN", read: true, write: true, engines: true, members: true, billing: true, delete: false },
                    { role: "MANAGER", read: true, write: true, engines: true, members: false, billing: false, delete: false },
                    { role: "ANALYST", read: true, write: false, engines: true, members: false, billing: false, delete: false },
                    { role: "MEMBER", read: true, write: true, engines: false, members: false, billing: false, delete: false },
                  ].map((row) => (
                    <tr key={row.role}>
                      <td className="py-2 font-medium">{ROLE_LABELS[row.role as RoleName] ?? row.role}</td>
                      {[row.read, row.write, row.engines, row.members, row.billing, row.delete].map((allowed, index) => (
                        <td key={index} className="py-2 text-center">
                          <span className={allowed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{allowed ? "Yes" : "—"}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Webhook className="size-4" /> Webhooks
                  </CardTitle>
                  <CardDescription>Signed payloads, retried with backoff until nine consecutive failures pause the endpoint.</CardDescription>
                </div>
                {canManageOrg ? (
                  <Button variant="outline" size="sm" onClick={() => setWebhookOpen(true)}>
                    <Plus className="size-3.5" /> Add endpoint
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {webhooks.isLoading ? (
                  <Skeleton className="h-24" />
                ) : webhooks.data?.data.webhooks.length ? (
                  webhooks.data.data.webhooks.map((webhook) => (
                    <div key={webhook.id} className="flex flex-col gap-2 rounded-lg border border-border/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="truncate font-mono text-2xs">{webhook.url}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant={webhook.active ? "success" : "neutral"} className="font-normal">
                            {webhook.active ? "Active" : "Paused"}
                          </Badge>
                          {webhook.failureCount ? <Badge variant="warning" className="font-normal">{webhook.failureCount} failures</Badge> : null}
                        </div>
                      </div>
                      <p className="text-2xs text-muted-foreground">
                        {webhook.events.join(" · ")} · secret {webhook.secret} · {webhook.lastTriggeredAt ? `last delivery ${relativeTime(webhook.lastTriggeredAt)}` : "never triggered"}
                      </p>
                      {canManageOrg ? (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            disabled={busy === webhook.id}
                            onClick={() => {
                              setBusy(webhook.id);
                              toggleWebhook.mutate({ id: webhook.id, active: !webhook.active });
                            }}
                          >
                            {webhook.active ? "Pause" : "Enable"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            disabled={busy === `del-${webhook.id}`}
                            onClick={() => {
                              setBusy(`del-${webhook.id}`);
                              removeWebhook.mutate({ id: webhook.id });
                            }}
                          >
                            <Trash2 className="size-3.5" /> Delete
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <EmptyState icon={Webhook} title="No webhooks" description="Push events into your own systems as they happen." action={canManageOrg ? { label: "Add endpoint", onClick: () => setWebhookOpen(true) } : undefined} compact />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="size-4" /> API keys
                  </CardTitle>
                  <CardDescription>{apiKeys.data?.data.apiEnabled ? "Scoped keys for the public API." : "API access is not included in your current plan."}</CardDescription>
                </div>
                {apiKeys.data?.data.canManage ? (
                  <Button variant="outline" size="sm" disabled={!apiKeys.data?.data.apiEnabled} onClick={() => setKeyOpen(true)}>
                    <Plus className="size-3.5" /> Create key
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {apiKeys.data?.data.items.length ? (
                  apiKeys.data.data.items.map((key) => (
                    <div key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 p-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">
                          {key.name} <span className="font-mono text-2xs text-muted-foreground">{key.prefix}…</span>
                        </p>
                        <p className="text-2xs text-muted-foreground">
                          {key.scopes.join(", ")} · {key.lastUsedAt ? `last used ${relativeTime(key.lastUsedAt)}` : "never used"} ·{" "}
                          {key.expiresAt ? `expires ${formatDate(key.expiresAt)}` : "no expiry"}
                        </p>
                      </div>
                      {key.revokedAt ? (
                        <Badge variant="neutral" className="font-normal">
                          Revoked
                        </Badge>
                      ) : apiKeys.data?.data.canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          disabled={busy === key.id}
                          onClick={() => {
                            setBusy(key.id);
                            revokeKey.mutate({ id: key.id });
                          }}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <EmptyState icon={KeyRound} title="No API keys" description="Create a scoped key to integrate your own systems." compact />
                )}
                <Alert tone="info" title="Key handling">
                  The secret is shown once at creation and stored only as a hash. Requests authenticate with the <span className="font-mono text-2xs">Authorization: Bearer</span> header and
                  are limited by your plan ({formatNumber(apiKeys.data?.data.allowance ?? 0)} calls per day).
                </Alert>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="danger">
          <Card className="border-destructive/30">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-4" /> Danger zone
                </CardTitle>
                <CardDescription>These actions affect the whole workspace. They are recorded in the audit trail.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 p-3.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">Sign out of this device</p>
                  <p className="text-2xs text-muted-foreground">Ends the current session. Other devices stay signed in.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={signOutEverywhere.isPending}
                  onClick={() => {
                    setBusy("logout");
                    signOutEverywhere.mutate();
                  }}
                >
                  Sign out
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/[0.03] p-3.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-destructive">Archive this workspace</p>
                  <p className="text-2xs text-muted-foreground">
                    Soft-deletes the organization: data is retained for recovery, access is revoked for every member and the workspace stops appearing in switchers.
                  </p>
                </div>
                <Button variant="destructive" size="sm" disabled={!canManageOrg} onClick={() => setDeleteOpen(true)}>
                  Archive workspace
                </Button>
              </div>
              {!canManageOrg ? <p className="text-2xs text-muted-foreground">Only the workspace owner can archive it.</p> : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={webhookOpen} onOpenChange={setWebhookOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a webhook endpoint</DialogTitle>
            <DialogDescription>We POST signed JSON to this URL for the events you select.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field>
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input id="webhook-url" value={webhookForm.url} onChange={(event) => setWebhookForm({ ...webhookForm, url: event.target.value })} placeholder="https://hooks.example.com/nexus" />
            </Field>
            <Field>
              <Label htmlFor="webhook-description">Description</Label>
              <Input id="webhook-description" value={webhookForm.description} onChange={(event) => setWebhookForm({ ...webhookForm, description: event.target.value })} placeholder="Sync won deals into the data warehouse" />
            </Field>
            <Field>
              <Label>Events</Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {(webhooks.data?.data.events ?? WEBHOOK_EVENTS).map((event) => (
                  <label key={event} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5 rounded border-input"
                      checked={webhookForm.events.includes(event)}
                      onChange={(checked) =>
                        setWebhookForm({
                          ...webhookForm,
                          events: checked.target.checked ? [...webhookForm.events, event] : webhookForm.events.filter((value) => value !== event),
                        })
                      }
                    />
                    <span className="font-mono text-2xs">{event}</span>
                  </label>
                ))}
              </div>
              <FieldHint>Signatures use X-Nexus-Signature: t=&lt;unix&gt;,v1=&lt;hmac-sha256&gt;.</FieldHint>
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={createWebhook.isPending || webhookForm.events.length === 0 || webhookForm.url.length < 10}
              onClick={() => {
                setBusy("webhook");
                createWebhook.mutate(webhookForm);
              }}
            >
              {createWebhook.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Webhook className="size-3.5" />}
              Create endpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create an API key</DialogTitle>
            <DialogDescription>Scope it to the minimum the integration needs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field>
              <Label htmlFor="key-name">Key name</Label>
              <Input id="key-name" value={keyForm.name} onChange={(event) => setKeyForm({ ...keyForm, name: event.target.value })} placeholder="Warehouse sync" />
            </Field>
            <Field>
              <Label>Scopes</Label>
              <div className="flex flex-wrap gap-3">
                {["read", "write", "admin"].map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5 rounded border-input"
                      checked={keyForm.scopes.includes(scope)}
                      onChange={(event) =>
                        setKeyForm({ ...keyForm, scopes: event.target.checked ? [...keyForm.scopes, scope] : keyForm.scopes.filter((value) => value !== scope) })
                      }
                    />
                    <span>{titleCase(scope)}</span>
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={createKey.isPending || keyForm.name.length < 2 || keyForm.scopes.length === 0}
              onClick={() => {
                setBusy("key");
                createKey.mutate(keyForm);
              }}
            >
              {createKey.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
              Create key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(newSecret)} onOpenChange={(open) => !open && setNewSecret(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy your secret now</DialogTitle>
            <DialogDescription>{newSecret?.label} — this value is stored hashed and cannot be shown again.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border/70 bg-surface-sunken p-3">
            <code className="block break-all font-mono text-xs">{newSecret?.value}</code>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (newSecret) {
                  navigator.clipboard?.writeText(newSecret.value);
                  toast.success("Copied to clipboard.");
                }
              }}
            >
              Copy
            </Button>
            <Button onClick={() => setNewSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Archive this workspace?"
        description="Every member loses access immediately and the tenant is marked as deleted. The data is retained for recovery by a platform administrator."
        confirmLabel="Archive workspace"
        onConfirm={() => {
          toast.error("Workspace archiving is disabled in the demo tenant so the shared environment stays usable.");
          setDeleteOpen(false);
        }}
      />
    </div>
  );
}

/**
 * The settings tabs read the active tab from the query string; wrapping the
 * consumer keeps the surrounding shell prerenderable.
 */
export default function SettingsPage() {
  return (
    <React.Suspense fallback={<PageSkeleton />}>
      <SettingsPageContent />
    </React.Suspense>
  );
}
