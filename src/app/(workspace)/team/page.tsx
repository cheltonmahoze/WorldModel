"use client";

import * as React from "react";
import { KeyRound, Loader2, Mail, MonitorSmartphone, Plus, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ConfirmDialog, InlineError, InfoRow, StatCard, StatusPill } from "@/components/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldHint, Label } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiMutation, useApiQuery, qk, toast } from "@/hooks/use-api";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, assignableRoles, type RoleName } from "@/lib/rbac";
import { formatCurrency, formatDate, formatNumber, formatPercent, relativeTime, titleCase } from "@/lib/utils";

type Member = {
  id: string;
  userId: string;
  role: string;
  status: string;
  title: string | null;
  department: string | null;
  joinedAt: string;
  lastSeenAt: string | null;
  invitedEmail: string | null;
  inviteExpiresAt: string | null;
  user: { id: string; name: string; email: string; jobTitle: string | null; avatarUrl: string | null; lastActiveAt: string | null; emailVerifiedAt: string | null };
  teams: { id: string; name: string; color: string | null }[];
  workload: { openDeals: number; openPipeline: number };
  accounts: { accounts: number; arr: number };
  isCurrentUser: boolean;
};

type Team = { id: string; name: string; description: string | null; department: string | null; color: string | null; leadId: string | null; _count: { members: number } };

type TeamResponse = {
  members: Member[];
  teams: Team[];
  invites: { id: string; invitedEmail: string | null; role: string; inviteExpiresAt: string | null; user: { name: string; email: string } }[];
  seats: { used: number; pending: number; limit: number; plan: string };
  roleSummary: { role: string; count: number }[];
  canManage: boolean;
};

type Session = { id: string; device: string | null; location: string | null; ip: string | null; lastSeenAt: string; createdAt: string; expiresAt: string; revokedAt: string | null; currentSessionId: string };

export default function TeamPage() {
  const query = useApiQuery<TeamResponse>(qk.team, "/api/team");
  const sessions = useApiQuery<{ items: Session[]; currentSessionId: string }>(qk.sessions, "/api/sessions");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [teamOpen, setTeamOpen] = React.useState(false);
  const [inviteForm, setInviteForm] = React.useState({ email: "", role: "MEMBER" as RoleName, title: "", department: "" });
  const [teamForm, setTeamForm] = React.useState({ name: "", description: "", department: "", color: "#4F46E5", leadId: "" });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmMember, setConfirmMember] = React.useState<Member | null>(null);
  const [confirmTeam, setConfirmTeam] = React.useState<Team | null>(null);

  const invite = useApiMutation<{ inviteUrl?: string; email: string; role: string; emailed: boolean }, typeof inviteForm>({
    path: "/api/team/invite",
    invalidate: [qk.team],
    successMessage: (data) => (data.emailed ? `Invitation sent to ${data.email}.` : `Invitation created for ${data.email}.`),
    onSuccess: (data) => {
      setInviteOpen(false);
      setInviteForm({ email: "", role: "MEMBER", title: "", department: "" });
      if (data.data.inviteUrl) {
        toast.info("No email provider is configured, so the invite link is shown here.", {
          description: data.data.inviteUrl,
          action: { label: "Copy", onClick: () => navigator.clipboard?.writeText(data.data.inviteUrl!) },
          duration: 20000,
        });
      }
    },
    onSettled: () => setBusy(null),
  });

  const resendInvite = useApiMutation<{ inviteUrl?: string; email: string; role: string; emailed: boolean }, typeof inviteForm>({
    path: "/api/team/invite",
    invalidate: [qk.team],
    successMessage: (data) => `Invitation reissued for ${data.email}.`,
    onSettled: () => setBusy(null),
  });

  const createTeam = useApiMutation<Team, typeof teamForm>({
    path: "/api/teams",
    invalidate: [qk.team, qk.teams],
    successMessage: (data) => `Team “${data.name}” created.`,
    onSuccess: () => {
      setTeamOpen(false);
      setTeamForm({ name: "", description: "", department: "", color: "#4F46E5", leadId: "" });
    },
    onSettled: () => setBusy(null),
  });

  const updateMember = useApiMutation<{ id: string }, { id: string; role?: string }>({
    path: (variables: { id: string }) => `/api/team/${variables.id}`,
    method: "PATCH",
    invalidate: [qk.team, qk.sessions],
    successMessage: "Member updated.",
    onSettled: () => setBusy(null),
  });

  const removeMember = useApiMutation<{ id: string }, { id: string }>({
    path: (variables: { id: string }) => `/api/team/${variables.id}`,
    method: "DELETE",
    invalidate: [qk.team],
    successMessage: "Member removed and their sessions revoked.",
    onSettled: () => {
      setBusy(null);
      setConfirmMember(null);
    },
  });

  const removeTeam = useApiMutation<{ id: string }, { id: string }>({
    path: (variables: { id: string }) => `/api/teams/${variables.id}`,
    method: "DELETE",
    invalidate: [qk.team, qk.teams],
    successMessage: "Team removed.",
    onSettled: () => {
      setBusy(null);
      setConfirmTeam(null);
    },
  });

  const revoke = useApiMutation<{ ok: boolean }, { id: string }>({
    path: (variables: { id: string }) => `/api/sessions?id=${variables.id}`,
    method: "DELETE",
    invalidate: [qk.sessions],
    successMessage: "Session revoked — that device must sign in again.",
    onSettled: () => setBusy(null),
  });

  const data = query.data?.data;
  const actorRole = (data?.members.find((member) => member.isCurrentUser)?.role ?? "MEMBER") as RoleName;
  const assignable = assignableRoles(actorRole);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team & access"
        title="Team"
        description="People, roles, teams and sessions. Role changes are enforced server-side and written to the audit trail."
        actions={
          data?.canManage ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setTeamOpen(true)}>
                <Plus className="size-3.5" /> New team
              </Button>
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="size-3.5" /> Invite people
              </Button>
            </>
          ) : null
        }
      />

      {query.isError ? <InlineError message={query.error?.message ?? "Could not load the team."} onRetry={() => query.refetch()} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Seats used" value={`${formatNumber(data?.seats.used ?? 0)} / ${formatNumber(data?.seats.limit ?? 0)}`} hint={`${data?.seats.plan ?? ""} plan · ${formatNumber(data?.seats.pending ?? 0)} pending invites`} icon={Users} />
        <StatCard label="Members" value={formatNumber(data?.members.length ?? 0)} hint={`${formatNumber(data?.teams.length ?? 0)} teams`} icon={Users} />
        <StatCard label="Active sessions" value={formatNumber(sessions.data?.data.items.filter((session) => !session.revokedAt).length ?? 0)} hint="Across all devices" icon={MonitorSmartphone} />
        <StatCard
          label="Admins"
          value={formatNumber((data?.roleSummary ?? []).filter((row) => ["OWNER", "ADMIN"].includes(row.role)).reduce((acc, row) => acc + row.count, 0))}
          hint={(data?.roleSummary ?? []).map((row) => `${row.count} ${ROLE_LABELS[row.role as RoleName] ?? row.role}`).join(" · ")}
          icon={ShieldCheck}
        />
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>People in this workspace</CardTitle>
                <CardDescription>Workload and account ownership are attached to each person.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {query.isLoading ? (
                <SkeletonTable rows={6} columns={5} />
              ) : data?.members.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[940px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 text-left font-medium">Person</th>
                        <th className="py-2 text-left font-medium">Role</th>
                        <th className="py-2 text-left font-medium">Teams</th>
                        <th className="py-2 text-right font-medium">Open deals</th>
                        <th className="py-2 text-right font-medium">Pipeline</th>
                        <th className="py-2 text-right font-medium">Accounts</th>
                        <th className="py-2 text-left font-medium">Last seen</th>
                        <th className="py-2 text-right font-medium" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {data.members.map((member) => (
                        <tr key={member.id}>
                          <td className="py-2.5">
                            <span className="flex items-center gap-2">
                              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-2xs font-medium">{member.user.name.slice(0, 1)}</span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {member.user.name}
                                  {member.isCurrentUser ? <span className="ml-1.5 text-2xs text-muted-foreground">(you)</span> : null}
                                </span>
                                <span className="block truncate text-2xs text-muted-foreground">{member.user.email}</span>
                              </span>
                            </span>
                          </td>
                          <td className="py-2.5">
                            {data.canManage && member.role !== "OWNER" && assignable.includes(member.role as RoleName) ? (
                              <NativeSelect
                                className="h-7 w-auto min-w-[120px] text-xs"
                                value={member.role}
                                disabled={busy === member.id}
                                onChange={(event) => {
                                  setBusy(member.id);
                                  updateMember.mutate({ id: member.id, role: event.target.value });
                                }}
                                aria-label={`Role for ${member.user.name}`}
                              >
                                {assignable.map((role) => (
                                  <option key={role} value={role}>
                                    {ROLE_LABELS[role]}
                                  </option>
                                ))}
                              </NativeSelect>
                            ) : (
                              <Badge variant={member.role === "OWNER" ? "solid" : "neutral"} className="font-normal">
                                {ROLE_LABELS[member.role as RoleName] ?? member.role}
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5">
                            <span className="flex flex-wrap gap-1">
                              {member.teams.length ? (
                                member.teams.map((team) => (
                                  <Badge key={team.id} variant="outline" className="font-normal">
                                    {team.name}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-2xs text-muted-foreground">No team</span>
                              )}
                            </span>
                          </td>
                          <td className="tabular py-2.5 text-right">{formatNumber(member.workload.openDeals)}</td>
                          <td className="tabular py-2.5 text-right">{formatCurrency(member.workload.openPipeline, { compact: true })}</td>
                          <td className="tabular py-2.5 text-right">
                            {formatNumber(member.accounts.accounts)}
                            <span className="ml-1 text-2xs text-muted-foreground">{formatCurrency(member.accounts.arr, { compact: true })}</span>
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground">{member.lastSeenAt ? relativeTime(member.lastSeenAt) : "Never"}</td>
                          <td className="py-2.5 text-right">
                            {data.canManage && !member.isCurrentUser && member.role !== "OWNER" ? (
                              <Button variant="ghost" size="icon-sm" onClick={() => setConfirmMember(member)} aria-label={`Remove ${member.user.name}`}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={Users} title="No members yet" description="Invite a colleague to collaborate in this workspace." action={data?.canManage ? { label: "Invite people", onClick: () => setInviteOpen(true) } : undefined} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Teams</CardTitle>
                <CardDescription>Teams group people for ownership, reporting and automation targeting.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data?.teams.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {data.teams.map((team) => (
                    <div key={team.id} className="flex flex-col justify-between gap-3 rounded-lg border border-border/70 p-3.5">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ background: team.color ?? "#6366f1" }} />
                          <p className="text-[13px] font-medium">{team.name}</p>
                        </div>
                        <p className="text-2xs leading-relaxed text-muted-foreground">{team.description ?? "No description"}</p>
                        <p className="text-2xs text-muted-foreground">
                          {team.department ?? "General"} · {formatNumber(team._count.members)} member{team._count.members === 1 ? "" : "s"} · lead{" "}
                          {data.members.find((member) => member.userId === team.leadId)?.user.name ?? "unassigned"}
                        </p>
                      </div>
                      {data.canManage ? (
                        <Button variant="outline" size="sm" className="h-8" onClick={() => setConfirmTeam(team)}>
                          Delete team
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Users} title="No teams yet" description="Create a team to group members for reporting and ownership." action={data?.canManage ? { label: "New team", onClick: () => setTeamOpen(true) } : undefined} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invites">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Pending invitations</CardTitle>
                <CardDescription>Invitations expire automatically and can be resent by re-inviting the address.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data?.invites.length ? (
                <ul className="divide-y divide-border/60">
                  {data.invites.map((invite) => (
                    <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-[13px] font-medium">{invite.invitedEmail ?? invite.user.email}</p>
                        <p className="text-2xs text-muted-foreground">
                          {ROLE_LABELS[invite.role as RoleName] ?? invite.role} · expires {invite.inviteExpiresAt ? formatDate(invite.inviteExpiresAt) : "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill value="PENDING" />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={busy === invite.id}
                          onClick={() => {
                            setBusy(invite.id);
                            resendInvite.mutate({
                              email: invite.invitedEmail ?? invite.user.email,
                              role: invite.role as RoleName,
                              title: "",
                              department: "",
                            });
                          }}
                        >
                          <Mail className="size-3.5" /> Resend
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Mail} title="No pending invitations" description="Everyone invited has already accepted." action={data?.canManage ? { label: "Invite people", onClick: () => setInviteOpen(true) } : undefined} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Active sessions</CardTitle>
                <CardDescription>Every device signed into this workspace. Revoking forces a fresh sign-in.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {sessions.isLoading ? (
                <SkeletonTable rows={3} columns={4} />
              ) : sessions.data?.data.items.length ? (
                <ul className="divide-y divide-border/60">
                  {sessions.data.data.items.map((session) => (
                    <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[13px] font-medium">
                          {session.device ?? "Unknown device"}
                          {session.id === sessions.data!.data.currentSessionId ? <Badge variant="info" className="font-normal">This device</Badge> : null}
                        </p>
                        <p className="text-2xs text-muted-foreground">
                          {session.ip ?? "no IP recorded"} · started {relativeTime(session.createdAt)} · last seen {relativeTime(session.lastSeenAt)} · expires{" "}
                          {formatDate(session.expiresAt)}
                        </p>
                      </div>
                      {session.revokedAt ? (
                        <Badge variant="neutral" className="font-normal">
                          Revoked
                        </Badge>
                      ) : session.id === sessions.data!.data.currentSessionId ? (
                        <span className="text-2xs text-muted-foreground">Sign out from the account menu</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={busy === session.id}
                          onClick={() => {
                            setBusy(session.id);
                            revoke.mutate({ id: session.id });
                          }}
                        >
                          {busy === session.id ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
                          Revoke
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={MonitorSmartphone} title="No other sessions" description="Only this device is signed in." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <div className="grid gap-4 lg:grid-cols-2">
            {ROLES.map((role) => (
              <Card key={role}>
                <CardHeader>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {ROLE_LABELS[role]}
                      <Badge variant="outline" className="font-normal">
                        {formatNumber((data?.roleSummary ?? []).find((row) => row.role === role)?.count ?? 0)} assigned
                      </Badge>
                    </CardTitle>
                    <CardDescription>{ROLE_DESCRIPTIONS[role]}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <InfoRow label="Can manage members" value={["OWNER", "ADMIN"].includes(role) ? "Yes" : "No"} />
                  <div className="mt-2">
                    <InfoRow label="Can delete the workspace" value={role === "OWNER" ? "Yes" : "No"} />
                  </div>
                  <div className="mt-2">
                    <InfoRow label="Read access" value="Yes" />
                  </div>
                  <p className="mt-3 text-2xs text-muted-foreground">
                    Permissions are enforced on every API route ({formatPercent(100)} server-side) — the interface simply hides what the role cannot do.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite to {data?.seats.plan ? "the workspace" : "the workspace"}</DialogTitle>
            <DialogDescription>
              Seats: {data?.seats.used ?? 0} of {data?.seats.limit ?? 0} used. Invitations expire after seven days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field>
              <Label htmlFor="invite-email">Work email</Label>
              <Input id="invite-email" type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} placeholder="colleague@company.com" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="invite-role">Role</Label>
                <NativeSelect id="invite-role" value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value as RoleName })}>
                  {assignable.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </NativeSelect>
                <FieldHint>{ROLE_DESCRIPTIONS[inviteForm.role]}</FieldHint>
              </Field>
              <Field>
                <Label htmlFor="invite-title">Job title</Label>
                <Input id="invite-title" value={inviteForm.title} onChange={(event) => setInviteForm({ ...inviteForm, title: event.target.value })} placeholder="Account Executive" />
              </Field>
            </div>
            <Field>
              <Label htmlFor="invite-department">Department</Label>
              <Input id="invite-department" value={inviteForm.department} onChange={(event) => setInviteForm({ ...inviteForm, department: event.target.value })} placeholder="Revenue" />
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={invite.isPending || !inviteForm.email.includes("@")}
              onClick={() => {
                setBusy("invite");
                invite.mutate(inviteForm);
              }}
            >
              {invite.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
            <DialogDescription>Teams appear in reporting filters and can be targeted by automations.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field>
              <Label htmlFor="team-name">Team name</Label>
              <Input id="team-name" value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} placeholder="Enterprise Sales" />
            </Field>
            <Field>
              <Label htmlFor="team-description">Purpose</Label>
              <Input id="team-description" value={teamForm.description} onChange={(event) => setTeamForm({ ...teamForm, description: event.target.value })} placeholder="Named accounts above €100k ARR" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="team-department">Department</Label>
                <Input id="team-department" value={teamForm.department} onChange={(event) => setTeamForm({ ...teamForm, department: event.target.value })} placeholder="Revenue" />
              </Field>
              <Field>
                <Label htmlFor="team-lead">Lead</Label>
                <NativeSelect id="team-lead" value={teamForm.leadId} onChange={(event) => setTeamForm({ ...teamForm, leadId: event.target.value })}>
                  <option value="">No lead yet</option>
                  {(data?.members ?? []).map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.user.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field>
              <Label htmlFor="team-color">Colour</Label>
              <Input id="team-color" type="color" value={teamForm.color} onChange={(event) => setTeamForm({ ...teamForm, color: event.target.value })} className="h-9 w-20 p-1" />
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={createTeam.isPending || teamForm.name.trim().length < 2}
              onClick={() => {
                setBusy("team");
                createTeam.mutate({ ...teamForm, leadId: teamForm.leadId || "" });
              }}
            >
              {createTeam.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Create team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmMember)}
        onOpenChange={(open) => !open && setConfirmMember(null)}
        title={`Remove ${confirmMember?.user.name ?? "member"}?`}
        description="They lose access immediately and every active session is revoked. Records they own stay in the workspace."
        confirmLabel="Remove member"
        pending={busy === confirmMember?.id}
        onConfirm={() => {
          if (!confirmMember) return;
          setBusy(confirmMember.id);
          removeMember.mutate({ id: confirmMember.id });
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmTeam)}
        onOpenChange={(open) => !open && setConfirmTeam(null)}
        title={`Delete ${confirmTeam?.name ?? "team"}?`}
        description="Members keep their access — only the team grouping is removed."
        confirmLabel="Delete team"
        pending={busy === confirmTeam?.id}
        onConfirm={() => {
          if (!confirmTeam) return;
          setBusy(confirmTeam.id);
          removeTeam.mutate({ id: confirmTeam.id });
        }}
      />
    </div>
  );
}
