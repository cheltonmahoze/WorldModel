"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Save, Trash2, Zap } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldHint, Label } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useApiMutation, qk, toast } from "@/hooks/use-api";
import { cn, titleCase } from "@/lib/utils";

/* ── vocabularies — kept in sync with src/server/validation.ts ────────────── */

const TRIGGERS: { value: string; label: string; hint: string; fields: { key: string; label: string; type: "number" | "text" | "select"; options?: string[]; default?: string | number }[] }[] = [
  { value: "deal_inactive", label: "A deal goes quiet", hint: "Fires when an open opportunity has no activity for N days.", fields: [{ key: "inactiveDays", label: "Inactive days", type: "number", default: 7 }] },
  { value: "deal_stage_changed", label: "A deal changes stage", hint: "Fires on every stage transition.", fields: [{ key: "stage", label: "Stage (optional)", type: "select", options: ["", "DISCOVERY", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] }] },
  { value: "deal_created", label: "A deal is created", hint: "Fires as soon as an opportunity is logged.", fields: [] },
  { value: "deal_won", label: "A deal is won", hint: "Fires when a deal closes as won.", fields: [] },
  { value: "deal_lost", label: "A deal is lost", hint: "Fires when a deal closes as lost.", fields: [] },
  { value: "customer_health_dropped", label: "Customer health drops", hint: "Fires when an account falls below the health threshold.", fields: [{ key: "threshold", label: "Health below", type: "number", default: 60 }] },
  { value: "customer_renewal_approaching", label: "A renewal approaches", hint: "Fires N days before the renewal date.", fields: [{ key: "daysBefore", label: "Days before renewal", type: "number", default: 60 }] },
  { value: "ticket_sla_breached", label: "A ticket breaches its SLA", hint: "Fires when first response exceeds the target.", fields: [] },
  { value: "risk_detected", label: "A risk is detected", hint: "Fires when the risk engine flags exposure.", fields: [{ key: "severity", label: "Minimum severity", type: "select", options: ["", "LOW", "MEDIUM", "HIGH", "CRITICAL"] }] },
  { value: "opportunity_detected", label: "An opportunity is detected", hint: "Fires when the opportunity engine finds upside.", fields: [] },
  { value: "activity_overdue", label: "An activity is overdue", hint: "Fires when a task passes its due date.", fields: [] },
  { value: "schedule_daily", label: "On a daily schedule", hint: "Runs once per day at the time you choose.", fields: [{ key: "hour", label: "Hour (0–23)", type: "number", default: 8 }] },
  { value: "schedule_weekly", label: "On a weekly schedule", hint: "Runs once per week.", fields: [{ key: "dayOfWeek", label: "Day (1 = Monday)", type: "number", default: 1 }] },
];

const OPERATORS = ["equals", "not_equals", "greater_than", "less_than", "contains", "in", "not_in", "is_set", "is_empty", "older_than_days"];
const CONDITION_FIELDS = ["amount", "probability", "stage", "daysInStage", "segment", "region", "productLine", "healthScore", "arr", "priority", "severity", "ownerId"];

const ACTIONS: { value: string; label: string; hint: string; fields: { key: string; label: string; type: "text" | "number" | "select" | "textarea"; options?: string[]; default?: string | number }[] }[] = [
  { value: "notify_role", label: "Notify a role", hint: "Creates an in-app notification for everyone with that role.", fields: [
    { key: "role", label: "Role", type: "select", options: ["OWNER", "ADMIN", "MANAGER", "ANALYST", "MEMBER"], default: "MANAGER" },
    { key: "title", label: "Title", type: "text", default: "Automation alert" },
    { key: "body", label: "Message", type: "textarea", default: "A record needs attention." },
    { key: "severity", label: "Severity", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM" },
  ] },
  { value: "notify_user", label: "Notify the record owner", hint: "Notifies the assigned owner of the triggering record.", fields: [
    { key: "title", label: "Title", type: "text", default: "Owner action needed" },
    { key: "body", label: "Message", type: "textarea", default: "Please review this record." },
    { key: "severity", label: "Severity", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM" },
  ] },
  { value: "create_task", label: "Create a task", hint: "Adds a task to the queue with an optional due window.", fields: [
    { key: "subject", label: "Task", type: "text", default: "Follow up" },
    { key: "dueInDays", label: "Due in days", type: "number", default: 2 },
    { key: "assigneeRole", label: "Assign to role", type: "select", options: ["OWNER", "ADMIN", "MANAGER", "ANALYST", "MEMBER"], default: "MANAGER" },
  ] },
  { value: "update_stage", label: "Move the deal stage", hint: "Changes the stage of the triggering opportunity.", fields: [{ key: "stage", label: "New stage", type: "select", options: ["DISCOVERY", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "WON", "LOST"], default: "NEGOTIATION" }] },
  { value: "assign_owner", label: "Reassign the owner", hint: "Routes the record to the best available owner.", fields: [{ key: "strategy", label: "Strategy", type: "select", options: ["round_robin", "highest_conversion", "least_loaded"], default: "highest_conversion" }] },
  { value: "send_email", label: "Send an email", hint: "Queued for delivery; without a provider it stays explicitly queued.", fields: [
    { key: "subject", label: "Subject", type: "text", default: "Update from Nexus OS" },
    { key: "body", label: "Body", type: "textarea", default: "This is an automated update." },
  ] },
  { value: "slack_message", label: "Post to Slack", hint: "Posts to the configured channel.", fields: [{ key: "text", label: "Message", type: "textarea", default: "Automation triggered." }] },
  { value: "webhook", label: "Call a webhook", hint: "POSTs the payload to your endpoint.", fields: [{ key: "url", label: "Endpoint URL", type: "text", default: "https://" }] },
  { value: "create_risk", label: "Raise a risk", hint: "Adds a risk to the register from the automation.", fields: [
    { key: "title", label: "Risk title", type: "text", default: "Automated risk" },
    { key: "category", label: "Category", type: "select", options: ["REVENUE", "CUSTOMER", "OPERATIONAL", "COMPLIANCE", "FINANCIAL", "REPUTATIONAL", "SECURITY"], default: "OPERATIONAL" },
    { key: "severity", label: "Severity", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM" },
    { key: "probability", label: "Probability %", type: "number", default: 60 },
  ] },
  { value: "escalate", label: "Escalate", hint: "Escalates to the senior pod and notifies leadership.", fields: [
    { key: "title", label: "Title", type: "text", default: "Escalation" },
    { key: "body", label: "Message", type: "textarea", default: "Escalated automatically." },
  ] },
];

type ActionDraft = { type: string; config: Record<string, string> };
type ConditionDraft = { field: string; operator: string; value: string };

export default function NewAutomationPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [triggerType, setTriggerType] = React.useState("deal_inactive");
  const [triggerConfig, setTriggerConfig] = React.useState<Record<string, string>>({ inactiveDays: "7" });
  const [conditions, setConditions] = React.useState<ConditionDraft[]>([]);
  const [actions, setActions] = React.useState<ActionDraft[]>([{ type: "notify_role", config: { role: "MANAGER", title: "Deal needs attention", body: "A qualified deal has gone quiet.", severity: "HIGH" } }]);

  const trigger = TRIGGERS.find((entry) => entry.value === triggerType)!;

  const create = useApiMutation<{ id: string }, Record<string, unknown>>({
    path: "/api/automations",
    invalidate: [["automations"], ["operations"], qk.dashboard],
    onSuccess: (data, variables) => {
      toast.success(`Automation saved as ${String((variables as { status?: string }).status ?? "DRAFT").toLowerCase()}.`);
      router.push(`/automations/${data.data.id}`);
    },
  });

  const payload = (status: "DRAFT" | "ACTIVE") => ({
    name: name.trim(),
    description: description.trim() || null,
    triggerType,
    triggerConfig: Object.fromEntries(
      Object.entries(triggerConfig)
        .filter(([, value]) => value !== "" && value !== undefined)
        .map(([key, value]) => {
          const field = trigger.fields.find((entry) => entry.key === key);
          return [key, field?.type === "number" ? Number(value) : value];
        }),
    ),
    conditions: conditions
      .filter((condition) => condition.field && condition.operator)
      .map((condition) => ({ field: condition.field, operator: condition.operator, value: isNaN(Number(condition.value)) ? condition.value : Number(condition.value) })),
    actions: actions.map((action) => ({ type: action.type, config: action.config })),
    status,
  });

  const valid = name.trim().length >= 3 && actions.length > 0;

  return (
    <div className="space-y-6">
      <Link href="/automations" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Automations
      </Link>

      <PageHeader
        eyebrow="Automation builder"
        title="New automation"
        description="Build the rule in three steps: WHEN it fires, IF the record qualifies, THEN what happens. Save it as a draft to review, or activate it straight away."
        actions={
          <>
            <Button variant="outline" size="sm" disabled={!valid || create.isPending} onClick={() => create.mutate(payload("DRAFT"))}>
              <Save className="size-3.5" /> Save draft
            </Button>
            <Button size="sm" disabled={!valid || create.isPending} onClick={() => create.mutate(payload("ACTIVE"))}>
              {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
              Create & activate
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>1 · WHEN does it fire?</CardTitle>
                <CardDescription>Pick the event and tune its parameters.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field>
                <Label htmlFor="automation-name">Name</Label>
                <Input id="automation-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Escalate stalled enterprise deals" required />
                <FieldHint>At least three characters.</FieldHint>
              </Field>
              <Field>
                <Label htmlFor="automation-description">What it does</Label>
                <Textarea id="automation-description" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the outcome so the next person understands why it exists." />
              </Field>
              <Field>
                <Label htmlFor="automation-trigger">Trigger</Label>
                <NativeSelect
                  id="automation-trigger"
                  value={triggerType}
                  onChange={(event) => {
                    const next = TRIGGERS.find((entry) => entry.value === event.target.value)!;
                    setTriggerType(next.value);
                    setTriggerConfig(Object.fromEntries(next.fields.filter((field) => field.default !== undefined).map((field) => [field.key, String(field.default)])));
                  }}
                >
                  {TRIGGERS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </NativeSelect>
                <FieldHint>{trigger.hint}</FieldHint>
              </Field>

              {trigger.fields.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {trigger.fields.map((field) => (
                    <Field key={field.key}>
                      <Label htmlFor={`trigger-${field.key}`}>{field.label}</Label>
                      {field.type === "select" ? (
                        <NativeSelect id={`trigger-${field.key}`} value={triggerConfig[field.key] ?? ""} onChange={(event) => setTriggerConfig({ ...triggerConfig, [field.key]: event.target.value })}>
                          {field.options?.map((option) => (
                            <option key={option} value={option}>
                              {option ? titleCase(option) : "Any"}
                            </option>
                          ))}
                        </NativeSelect>
                      ) : (
                        <Input
                          id={`trigger-${field.key}`}
                          type={field.type === "number" ? "number" : "text"}
                          value={triggerConfig[field.key] ?? ""}
                          onChange={(event) => setTriggerConfig({ ...triggerConfig, [field.key]: event.target.value })}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>2 · IF which conditions?</CardTitle>
                <CardDescription>All conditions must pass. Leave empty to fire on every match of the trigger.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setConditions([...conditions, { field: "amount", operator: "greater_than", value: "10000" }])}>
                <Plus className="size-3.5" /> Add condition
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {conditions.length ? (
                conditions.map((condition, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1.2fr_1.2fr_1fr_auto]">
                    <NativeSelect value={condition.field} onChange={(event) => setConditions(conditions.map((entry, position) => (position === index ? { ...entry, field: event.target.value } : entry)))} aria-label="Condition field">
                      {CONDITION_FIELDS.map((field) => (
                        <option key={field} value={field}>
                          {titleCase(field.replace(/([A-Z])/g, " $1"))}
                        </option>
                      ))}
                    </NativeSelect>
                    <NativeSelect value={condition.operator} onChange={(event) => setConditions(conditions.map((entry, position) => (position === index ? { ...entry, operator: event.target.value } : entry)))} aria-label="Condition operator">
                      {OPERATORS.map((operator) => (
                        <option key={operator} value={operator}>
                          {titleCase(operator.replace(/_/g, " "))}
                        </option>
                      ))}
                    </NativeSelect>
                    <Input
                      value={condition.value}
                      placeholder="Value"
                      disabled={["is_set", "is_empty"].includes(condition.operator)}
                      onChange={(event) => setConditions(conditions.map((entry, position) => (position === index ? { ...entry, value: event.target.value } : entry)))}
                    />
                    <Button variant="ghost" size="icon-sm" onClick={() => setConditions(conditions.filter((_, position) => position !== index))} aria-label="Remove condition">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No conditions — the automation fires for every record that matches the trigger.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>3 · THEN do what?</CardTitle>
                <CardDescription>Steps run top to bottom. An automation needs at least one.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setActions([
                    ...actions,
                    { type: "create_task", config: { subject: "Follow up with the account", dueInDays: "2", assigneeRole: "MANAGER" } },
                  ])
                }
              >
                <Plus className="size-3.5" /> Add step
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {actions.map((action, index) => {
                const definition = ACTIONS.find((entry) => entry.value === action.type)!;
                return (
                  <div key={index} className="space-y-3 rounded-lg border border-border/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Step {index + 1}
                        <ArrowRight className="size-3" />
                      </span>
                      <div className="flex items-center gap-2">
                        <NativeSelect
                          value={action.type}
                          className="h-8 w-auto min-w-[190px] text-xs"
                          onChange={(event) => {
                            const next = ACTIONS.find((entry) => entry.value === event.target.value)!;
                            setActions(
                              actions.map((entry, position) =>
                                position === index
                                  ? { type: next.value, config: Object.fromEntries(next.fields.filter((field) => field.default !== undefined).map((field) => [field.key, String(field.default)])) }
                                  : entry,
                              ),
                            );
                          }}
                          aria-label="Action type"
                        >
                          {ACTIONS.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                              {entry.label}
                            </option>
                          ))}
                        </NativeSelect>
                        <Button variant="ghost" size="icon-sm" onClick={() => setActions(actions.filter((_, position) => position !== index))} aria-label="Remove step">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-2xs text-muted-foreground">{definition.hint}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {definition.fields.map((field) => (
                        <Field key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : undefined}>
                          <Label htmlFor={`action-${index}-${field.key}`}>{field.label}</Label>
                          {field.type === "select" ? (
                            <NativeSelect
                              id={`action-${index}-${field.key}`}
                              value={action.config[field.key] ?? ""}
                              onChange={(event) => setActions(actions.map((entry, position) => (position === index ? { ...entry, config: { ...entry.config, [field.key]: event.target.value } } : entry)))}
                            >
                              {field.options?.map((option) => (
                                <option key={option} value={option}>
                                  {titleCase(option.replace(/_/g, " "))}
                                </option>
                              ))}
                            </NativeSelect>
                          ) : field.type === "textarea" ? (
                            <Textarea
                              id={`action-${index}-${field.key}`}
                              rows={2}
                              value={action.config[field.key] ?? ""}
                              onChange={(event) => setActions(actions.map((entry, position) => (position === index ? { ...entry, config: { ...entry.config, [field.key]: event.target.value } } : entry)))}
                            />
                          ) : (
                            <Input
                              id={`action-${index}-${field.key}`}
                              type={field.type === "number" ? "number" : "text"}
                              value={action.config[field.key] ?? ""}
                              onChange={(event) => setActions(actions.map((entry, position) => (position === index ? { ...entry, config: { ...entry.config, [field.key]: event.target.value } } : entry)))}
                            />
                          )}
                        </Field>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Flow preview</CardTitle>
                <CardDescription>Exactly what will be stored and executed.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <FlowStep label="WHEN" tone="info">
                {trigger.label}
                {Object.entries(triggerConfig).filter(([, value]) => value !== "").length ? (
                  <span className="mt-1 block text-2xs text-muted-foreground">
                    {Object.entries(triggerConfig)
                      .filter(([, value]) => value !== "")
                      .map(([key, value]) => `${titleCase(key.replace(/([A-Z])/g, " $1"))}: ${value}`)
                      .join(" · ")}
                  </span>
                ) : null}
              </FlowStep>
              <FlowStep label="IF" tone="warning">
                {conditions.length ? (
                  <ul className="space-y-0.5">
                    {conditions.map((condition, index) => (
                      <li key={index} className="text-2xs">
                        {titleCase(condition.field.replace(/([A-Z])/g, " $1"))} {condition.operator.replace(/_/g, " ")} {condition.value}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-2xs text-muted-foreground">No conditions — fires on every match.</span>
                )}
              </FlowStep>
              <FlowStep label="THEN" tone="success">
                <ol className="space-y-1">
                  {actions.map((action, index) => (
                    <li key={index} className="flex gap-2 text-2xs">
                      <span className="text-muted-foreground">{index + 1}.</span>
                      <span>
                        {ACTIONS.find((entry) => entry.value === action.type)?.label}
                        {action.config.title || action.config.subject || action.config.text ? (
                          <span className="block text-muted-foreground">{action.config.title ?? action.config.subject ?? action.config.text}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </FlowStep>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Before you activate</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-2xs text-muted-foreground">
              <p className="flex gap-2">
                <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                Every run is written to the automation log with its duration and result.
              </p>
              <p className="flex gap-2">
                <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                Actions that create notifications, tasks or risks land in the modules owners already watch.
              </p>
              <p className="flex gap-2">
                <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                Email and Slack steps are queued with an explicit note until a provider credential is connected.
              </p>
              <p className="flex gap-2">
                <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                Pausing is instant and never deletes the execution history.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FlowStep({ label, tone, children }: { label: string; tone: "info" | "warning" | "success"; children: React.ReactNode }) {
  const toneClass = {
    info: "border-sky-500/30 bg-sky-500/[0.06]",
    warning: "border-amber-500/30 bg-amber-500/[0.06]",
    success: "border-emerald-500/30 bg-emerald-500/[0.06]",
  }[tone];
  return (
    <div className={cn("rounded-lg border p-3", toneClass)}>
      <p className="text-2xs font-semibold uppercase tracking-[0.14em]">{label}</p>
      <div className="mt-1 text-[13px] font-medium">{children}</div>
    </div>
  );
}
