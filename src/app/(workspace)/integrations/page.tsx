"use client";

import Link from "next/link";
import * as React from "react";
import { Cable, CheckCircle2, CircleAlert, Clock, Loader2, Plug, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ConfirmDialog, InlineError, StatCard, StatusPill } from "@/components/domain";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldHint, Label } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { Skeleton, SkeletonCards } from "@/components/ui/skeleton";
import { useApiMutation, useApiQuery, qk, toast } from "@/hooks/use-api";
import { INTEGRATION_CATEGORY_LABELS } from "@/lib/integrations";
import { formatDateTime, formatNumber, relativeTime, titleCase } from "@/lib/utils";

type CatalogueEntry = {
  provider: string;
  name: string;
  category: string;
  description: string;
  scopes: string[];
  syncDirection: string;
  requiresCredential: boolean;
  docsUrl: string;
  connected: boolean;
  integrationId: string | null;
  status: string | null;
};

type Integration = {
  id: string;
  provider: string;
  name: string;
  category: string;
  status: string;
  enabled: boolean;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
  errorCount: number;
  recordsSynced: number;
  syncFrequency: string;
  syncDirection: string;
  scopes: string[];
  secretPreview: string | null;
  config: Record<string, unknown>;
};

type IntegrationsResponse = {
  /** Every connector with a record in this workspace, whatever its status. */
  connectors: Integration[];
  catalogue: CatalogueEntry[];
  allowance: number;
  summary: { connected: number; errors: number; pending: number; lastSyncAt: string | null; recordsSynced: number };
  configurationNote: string;
};

export default function IntegrationsPage() {
  const query = useApiQuery<IntegrationsResponse>(qk.integrations, "/api/integrations");
  const [connectTarget, setConnectTarget] = React.useState<CatalogueEntry | null>(null);
  const [credential, setCredential] = React.useState("");
  const [frequency, setFrequency] = React.useState("hourly");
  const [direction, setDirection] = React.useState("inbound");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState<Integration | null>(null);

  const connect = useApiMutation<Integration, { provider: string; credential?: string; syncFrequency: string; syncDirection: string }>({
    path: "/api/integrations",
    invalidate: [qk.integrations, ["operations"]],
    successMessage: (data) => `${data.name} connected.`,
    onSuccess: () => {
      setConnectTarget(null);
      setCredential("");
    },
    onSettled: () => setBusy(null),
  });

  const update = useApiMutation<Integration, { id: string; enabled?: boolean; syncFrequency?: string; syncDirection?: string }>({
    path: (variables: { id: string }) => `/api/integrations/${variables.id}`,
    method: "PATCH",
    invalidate: [qk.integrations],
    successMessage: "Integration updated.",
    onSettled: () => setBusy(null),
  });

  const sync = useApiMutation<{ synced: number; status: string; recordsSynced: number }, { id: string }>({
    path: (variables: { id: string }) => `/api/integrations/${variables.id}/sync`,
    invalidate: [qk.integrations, ["operations"]],
    successMessage: (data) => `Sync complete — ${formatNumber(data.synced)} records processed.`,
    onSettled: () => setBusy(null),
  });

  const disconnect = useApiMutation<{ id: string }, { id: string }>({
    path: (variables: { id: string }) => `/api/integrations/${variables.id}`,
    method: "DELETE",
    invalidate: [qk.integrations],
    successMessage: "Integration disconnected.",
    onSettled: () => {
      setBusy(null);
      setConfirmDisconnect(null);
    },
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Integrations" description="Loading connectors…" />
        <SkeletonCards />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Integrations" description="We could not load the integration catalogue." />
        <InlineError message={query.error?.message ?? "The integrations request failed."} onRetry={() => query.refetch()} />
      </div>
    );
  }

  const data = query.data.data;
  const categories = [...new Set(data.catalogue.map((entry) => entry.category))];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Integrations"
        description="CRMs, communication tools, finance, productivity and data pipelines. Each connector declares exactly what it syncs, in which direction, and whether a credential is required."
        actions={
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className="size-3.5" /> Refresh status
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Connected" value={formatNumber(data.summary.connected)} hint={`${data.catalogue.length} providers available`} icon={Plug} />
        <StatCard label="Records synced" value={formatNumber(data.summary.recordsSynced)} hint={data.summary.lastSyncAt ? `Last sync ${relativeTime(data.summary.lastSyncAt)}` : "No sync yet"} icon={Cable} />
        <StatCard label="Needs attention" value={formatNumber(data.summary.errors)} hint={`${data.summary.pending} awaiting a credential`} tone={data.summary.errors ? "danger" : undefined} icon={CircleAlert} />
        <StatCard label="Plan allowance" value={formatNumber(data.allowance)} hint="Connections included in your plan" icon={ShieldCheck} />
      </div>

      <Alert tone="info" title="How connections behave in this environment">
        {data.configurationNote}
      </Alert>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Connected integrations</CardTitle>
            <CardDescription>{data.connectors.length} connectors with a record in this workspace.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {data.connectors.length ? (
            <ul className="divide-y divide-border/70">
              {data.connectors.map((integration) => (
                <li key={integration.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium">{integration.name}</span>
                      <StatusPill value={integration.status} />
                      <Badge variant="outline" className="font-normal">
                        {INTEGRATION_CATEGORY_LABELS[integration.category as keyof typeof INTEGRATION_CATEGORY_LABELS] ?? titleCase(integration.category)}
                      </Badge>
                      {integration.secretPreview ? <span className="font-mono text-2xs text-muted-foreground">{integration.secretPreview}</span> : null}
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      {titleCase(integration.syncFrequency)} · {titleCase(integration.syncDirection)} ·{" "}
                      {integration.lastSyncAt ? `last sync ${relativeTime(integration.lastSyncAt)}` : "never synced"}
                      {integration.nextSyncAt ? ` · next ${formatDateTime(integration.nextSyncAt)}` : ""}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                      {formatNumber(integration.recordsSynced)} records synced
                      {integration.errorCount ? ` · ${integration.errorCount} errors` : ""}
                      {integration.scopes.length ? ` · scopes: ${integration.scopes.join(", ")}` : ""}
                    </p>
                    {integration.lastError ? <p className="text-2xs text-rose-600 dark:text-rose-400">{integration.lastError}</p> : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={busy === `sync-${integration.id}`}
                      onClick={() => {
                        setBusy(`sync-${integration.id}`);
                        sync.mutate({ id: integration.id });
                      }}
                    >
                      {busy === `sync-${integration.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                      Sync now
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={busy === `toggle-${integration.id}`}
                      onClick={() => {
                        setBusy(`toggle-${integration.id}`);
                        update.mutate({ id: integration.id, enabled: !integration.enabled });
                      }}
                    >
                      {integration.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setConfirmDisconnect(integration)}>
                      <Unplug className="size-3.5" /> Disconnect
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Plug} title="No integrations connected yet" description="Pick a provider below to create the connection record with its scopes and sync policy." />
          )}
        </CardContent>
      </Card>

      {categories.map((category) => (
        <Card key={category}>
          <CardHeader>
            <div>
              <CardTitle>{INTEGRATION_CATEGORY_LABELS[category as keyof typeof INTEGRATION_CATEGORY_LABELS] ?? titleCase(category)}</CardTitle>
              <CardDescription>{data.catalogue.filter((entry) => entry.category === category).length} providers</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.catalogue
                .filter((entry) => entry.category === category)
                .map((entry) => (
                  <div key={entry.provider} className="flex flex-col justify-between gap-3 rounded-lg border border-border/70 p-3.5">
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium">{entry.name}</p>
                        {entry.connected ? (
                          <Badge variant={entry.status === "CONNECTED" ? "success" : "neutral"} className="font-normal">
                            {entry.status === "CONNECTED" ? "Connected" : titleCase(entry.status ?? "configured")}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-2xs leading-relaxed text-muted-foreground">{entry.description}</p>
                      <p className="text-2xs text-muted-foreground">
                        {titleCase(entry.syncDirection)} · {entry.requiresCredential ? "credential required" : "no credential needed"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.integrationId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1"
                          disabled={busy === `sync-${entry.integrationId}`}
                          onClick={() => {
                            setBusy(`sync-${entry.integrationId}`);
                            sync.mutate({ id: entry.integrationId! });
                          }}
                        >
                          {busy === `sync-${entry.integrationId}` ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                          Sync
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 flex-1"
                          onClick={() => {
                            setConnectTarget(entry);
                            setFrequency("hourly");
                            setDirection(entry.syncDirection);
                            setCredential("");
                          }}
                        >
                          Connect
                        </Button>
                      )}
                      <Button asChild variant="ghost" size="sm" className="h-8">
                        <a href={entry.docsUrl} target="_blank" rel="noreferrer">
                          Docs
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={Boolean(connectTarget)} onOpenChange={(open) => !open && setConnectTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect {connectTarget?.name}</DialogTitle>
            <DialogDescription>{connectTarget?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {connectTarget?.requiresCredential ? (
              <Field>
                <Label htmlFor="integration-credential">API credential</Label>
                <Input id="integration-credential" type="password" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder="Paste the provider API key or OAuth token" autoComplete="off" />
                <FieldHint>Stored as a reference with a masked preview — the raw value never leaves the server.</FieldHint>
              </Field>
            ) : (
              <Alert tone="info" title="No credential required">
                This connector works with exported files and public endpoints, so it is configured without a secret.
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="integration-frequency">Sync frequency</Label>
                <NativeSelect id="integration-frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)}>
                  {["realtime", "15min", "hourly", "6h", "daily", "manual"].map((value) => (
                    <option key={value} value={value}>
                      {titleCase(value)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <Label htmlFor="integration-direction">Direction</Label>
                <NativeSelect id="integration-direction" value={direction} onChange={(event) => setDirection(event.target.value)}>
                  {["inbound", "outbound", "bidirectional"].map((value) => (
                    <option key={value} value={value}>
                      {titleCase(value)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            {connectTarget?.scopes.length ? (
              <div className="rounded-lg border border-border/70 bg-surface-sunken p-3">
                <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Scopes requested</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {connectTarget.scopes.map((scope) => (
                    <Badge key={scope} variant="outline" className="font-normal">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              disabled={connect.isPending || (connectTarget?.requiresCredential === true && !credential.trim())}
              onClick={() => {
                if (!connectTarget) return;
                if (connectTarget.requiresCredential && credential.trim().length < 8) {
                  toast.error("Paste a credential with at least 8 characters.");
                  return;
                }
                setBusy("connect");
                connect.mutate({ provider: connectTarget.provider, credential: credential.trim() || undefined, syncFrequency: frequency, syncDirection: direction });
              }}
            >
              {connect.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Create connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmDisconnect)}
        onOpenChange={(open) => !open && setConfirmDisconnect(null)}
        title={`Disconnect ${confirmDisconnect?.name ?? "integration"}?`}
        description="The connection stops syncing. Historical records stay in the workspace, and you can connect the provider again at any time."
        confirmLabel="Disconnect"
        pending={busy === `disconnect-${confirmDisconnect?.id}`}
        onConfirm={() => {
          if (!confirmDisconnect) return;
          setBusy(`disconnect-${confirmDisconnect.id}`);
          disconnect.mutate({ id: confirmDisconnect.id });
        }}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent sync activity</CardTitle>
            <CardDescription>Every connection reports its own state so a silent failure is visible.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings?tab=api">
              <Clock className="size-3.5" /> Webhooks & API keys
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {data.connectors.slice(0, 8).map((integration) => (
              <li key={integration.id} className="flex items-center justify-between gap-4 py-2.5 text-xs">
                <span className="truncate font-medium">{integration.name}</span>
                <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                  <span>{integration.recordsSynced ? `${formatNumber(integration.recordsSynced)} records` : "no data yet"}</span>
                  <span>{integration.lastSyncAt ? relativeTime(integration.lastSyncAt) : "never"}</span>
                  <StatusPill value={integration.status} />
                </span>
              </li>
            ))}
            {!data.connectors.length ? <li className="py-2 text-xs text-muted-foreground">No connectors configured yet.</li> : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
