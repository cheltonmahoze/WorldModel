"use client";

import * as React from "react";
import { Filter, History, ScrollText, ShieldCheck, UserCog } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { InlineError, ModuleToolbar, StatCard, StatusPill, useCsvExport } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { pageData, useApiQuery, qk } from "@/hooks/use-api";
import { useDebouncedValue } from "@/hooks/use-hotkey";
import { formatDateTime, formatNumber, relativeTime, titleCase } from "@/lib/utils";

type AuditEntry = {
  id: string;
  actorName: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  diff: Record<string, { from: unknown; to: unknown }> | null;
  severity: string;
  source: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

type AuditResponse = {
  items: AuditEntry[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
    facets: { actions: { action: string; count: number }[]; actors: { name: string; count: number }[] };
    retention: string;
  };
};

const SEVERITIES = ["", "INFO", "WARNING", "CRITICAL"];
const SOURCES = ["", "WEB", "API", "AUTOMATION", "SYSTEM"];

export default function AuditPage() {
  const [query, setQuery] = React.useState("");
  const [severity, setSeverity] = React.useState("");
  const [source, setSource] = React.useState("");
  const [action, setAction] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AuditEntry | null>(null);
  const search = useDebouncedValue(query, 250);
  const { exporting, run: runExport } = useCsvExport();

  const params = new URLSearchParams({ page: String(page), pageSize: "30" });
  if (search) params.set("q", search);
  if (severity) params.set("severity", severity);
  if (source) params.set("source", source);
  if (action) params.set("action", action);

  const audit = useApiQuery<AuditResponse>(qk.audit({ search, severity, source, action, page }), `/api/audit?${params.toString()}`);
  const { items, meta } = pageData<AuditEntry, AuditResponse["meta"]>(audit.data);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit trail"
        title="Audit log"
        description="Who changed what, when, from where — with the before and after values. Authentication, CRUD, engine runs and automation runs are all recorded."
        actions={
          <Button asChild variant="outline" size="sm">
            <a href="/api/reports/export?type=audit&format=csv">Export</a>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Events recorded" value={formatNumber(meta?.total ?? 0)} hint="Matching the current filters" icon={ScrollText} />
        <StatCard label="Distinct actions" value={formatNumber(meta?.facets.actions.length ?? 0)} hint="Across this workspace" icon={ShieldCheck} />
        <StatCard label="Actors" value={formatNumber(meta?.facets.actors.length ?? 0)} hint="People, automations and system processes" icon={UserCog} />
        <StatCard label="Retention" value={(meta?.retention ?? "—").split(" ")[0]} hint={meta?.retention ?? "Plan dependent"} icon={History} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Event stream</CardTitle>
            <CardDescription>{meta ? `${formatNumber(meta.total)} entries, newest first` : "Loading…"}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModuleToolbar
            search={query}
            onSearch={(value) => {
              setQuery(value);
              setPage(1);
            }}
            searchPlaceholder="Search by entity, actor or action…"
            filters={[
              { key: "severity", label: "Severity", value: severity, options: SEVERITIES.map((value) => ({ value, label: value ? titleCase(value) : "Any severity" })) },
              { key: "source", label: "Source", value: source, options: SOURCES.map((value) => ({ value, label: value ? titleCase(value) : "Any source" })) },
              {
                key: "action",
                label: "Action",
                value: action,
                options: [{ value: "", label: "All actions" }, ...(meta?.facets.actions ?? []).slice(0, 40).map((row) => ({ value: row.action, label: `${row.action} (${row.count})` }))],
              },
            ]}
            onFilter={(key, value) => {
              if (key === "severity") setSeverity(value);
              if (key === "source") setSource(value);
              if (key === "action") setAction(value);
              setPage(1);
            }}
            onExport={() =>
              runExport(
                "nexus-audit-log",
                items.map((entry) => ({
                  timestamp: entry.createdAt,
                  actor: entry.actorName,
                  role: entry.actorRole ?? "",
                  action: entry.action,
                  entityType: entry.entityType,
                  entityLabel: entry.entityLabel ?? entry.entityId ?? "",
                  severity: entry.severity,
                  source: entry.source,
                  ip: entry.ip ?? "",
                  changes: entry.diff ? Object.keys(entry.diff).join(" | ") : "",
                })),
                ["timestamp", "actor", "role", "action", "entityType", "entityLabel", "severity", "source", "ip", "changes"],
              )
            }
            exporting={exporting}
          />

          {audit.isError ? <InlineError message={audit.error?.message ?? "Could not load the audit trail."} onRetry={() => audit.refetch()} /> : null}

          {audit.isLoading ? (
            <SkeletonTable rows={10} columns={5} />
          ) : items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left font-medium">When</th>
                    <th className="py-2 text-left font-medium">Actor</th>
                    <th className="py-2 text-left font-medium">Action</th>
                    <th className="py-2 text-left font-medium">Entity</th>
                    <th className="py-2 text-left font-medium">Change</th>
                    <th className="py-2 text-left font-medium">Source</th>
                    <th className="py-2 text-left font-medium">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((entry) => (
                    <tr key={entry.id} className="cursor-pointer transition-colors hover:bg-muted/30" onClick={() => setSelected(entry)}>
                      <td className="py-2.5 text-xs whitespace-nowrap">
                        <span className="block font-medium">{relativeTime(entry.createdAt)}</span>
                        <span className="block text-2xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                      </td>
                      <td className="py-2.5 text-xs">
                        <span className="block">{entry.actorName}</span>
                        <span className="block text-2xs text-muted-foreground">{entry.actorRole ? titleCase(entry.actorRole) : entry.actorEmail ?? "—"}</span>
                      </td>
                      <td className="py-2.5">
                        <span className="font-mono text-2xs">{entry.action}</span>
                        {entry.severity !== "INFO" ? (
                          <Badge variant={entry.severity === "CRITICAL" ? "danger" : "warning"} className="ml-2 h-4 px-1.5 text-[10px]">
                            {entry.severity}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="py-2.5 text-xs">
                        <span className="block">{entry.entityLabel ?? entry.entityId ?? "—"}</span>
                        <span className="block text-2xs text-muted-foreground">{titleCase(entry.entityType)}</span>
                      </td>
                      <td className="py-2.5 text-xs">
                        {entry.diff ? (
                          <span className="text-muted-foreground">
                            {Object.entries(entry.diff)
                              .slice(0, 2)
                              .map(([field, change]) => (
                                <span key={field} className="block">
                                  {field}: <span className="text-foreground/70">{format(change.from)}</span> → <span className="text-foreground">{format(change.to)}</span>
                                </span>
                              ))}
                            {Object.keys(entry.diff).length > 2 ? <span className="block text-2xs">+{Object.keys(entry.diff).length - 2} more</span> : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <StatusPill value={entry.source} />
                      </td>
                      <td className="py-2.5 font-mono text-2xs text-muted-foreground">{entry.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Filter}
              title="No audit entries match these filters"
              description="Try widening the filters — the trail records everything the workspace does."
              action={{ label: "Clear filters", onClick: () => { setQuery(""); setSeverity(""); setSource(""); setAction(""); } }}
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
                <CardTitle>Most frequent actions</CardTitle>
                <CardDescription>What the workspace does most often.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border/60">
                {meta.facets.actions.slice(0, 10).map((row) => (
                  <li key={row.action} className="flex items-center justify-between gap-4 py-2 text-xs">
                    <button className="font-mono hover:underline" onClick={() => { setAction(row.action); setPage(1); }}>
                      {row.action}
                    </button>
                    <span className="tabular text-muted-foreground">{formatNumber(row.count)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Most active people</CardTitle>
                <CardDescription>Volume of recorded activity per actor.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border/60">
                {meta.facets.actors.slice(0, 10).map((row) => (
                  <li key={row.name} className="flex items-center justify-between gap-4 py-2 text-xs">
                    <span>{row.name}</span>
                    <span className="tabular text-muted-foreground">{formatNumber(row.count)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{selected?.action}</DialogTitle>
            <DialogDescription>
              {selected?.actorName} · {selected ? formatDateTime(selected.createdAt) : ""} · {titleCase(selected?.source ?? "")}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Entity" value={selected.entityLabel ?? selected.entityId ?? "—"} />
                <Detail label="Entity type" value={titleCase(selected.entityType)} />
                <Detail label="Role" value={selected.actorRole ? titleCase(selected.actorRole) : "—"} />
                <Detail label="Email" value={selected.actorEmail ?? "—"} />
                <Detail label="IP address" value={selected.ip ?? "—"} />
                <Detail label="User agent" value={selected.userAgent ?? "—"} />
              </div>

              {selected.diff ? (
                <div className="space-y-2">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Field changes</p>
                  <div className="overflow-hidden rounded-lg border border-border/70">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-sunken">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Field</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Before</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {Object.entries(selected.diff).map(([field, change]) => (
                          <tr key={field}>
                            <td className="px-3 py-2 font-mono text-2xs">{field}</td>
                            <td className="px-3 py-2 text-muted-foreground">{format(change.from)}</td>
                            <td className="px-3 py-2 font-medium">{format(change.to)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No field-level diff was recorded for this event.</p>
              )}

              {selected.after ? (
                <div className="space-y-2">
                  <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recorded context</p>
                  <pre className="max-h-56 overflow-auto rounded-lg border border-border/70 bg-surface-sunken p-3 font-mono text-2xs leading-relaxed">
                    {JSON.stringify(selected.after, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface-sunken p-2.5">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium">{value}</p>
    </div>
  );
}

function format(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
