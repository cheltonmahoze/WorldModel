"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { AuthCenter, AuthLoading } from "@/components/app/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldHint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiPost, ApiError } from "@/lib/api-client";

const MIN_LENGTH = 12;

function InvitePageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [accepted, setAccepted] = React.useState(false);

  const checks = [
    { label: `At least ${MIN_LENGTH} characters`, ok: password.length >= MIN_LENGTH },
    { label: "One uppercase and one lowercase letter", ok: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: "One number or symbol", ok: /[\d\W]/.test(password) },
  ];
  const strong = checks.every((check) => check.ok) && password === confirm && name.trim().length >= 2;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!strong) {
      setError("Complete your name and choose a password that meets every requirement.");
      return;
    }
    setPending(true);
    try {
      const response = await apiPost<{ organizationId: string; redirectTo: string }>("/api/team/accept", {
        token,
        name: name.trim(),
        password,
      });
      setAccepted(true);
      setTimeout(() => {
        router.push(response.data.redirectTo || "/dashboard");
        router.refresh();
      }, 1200);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
        setFieldErrors(cause.details ?? {});
      } else {
        setError("We could not accept this invitation. Try again in a moment.");
      }
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <AuthCenter icon={AlertTriangle} title="Invitation link incomplete" subtitle="The invitation token is missing">
        <Card>
          <CardContent className="space-y-4 p-5">
            <Alert tone="warning" title="Ask for a new invitation">
              This URL does not contain an invitation token. Open the link exactly as it was sent, or ask an administrator to resend the invitation from
              Team settings.
            </Alert>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthCenter>
    );
  }

  if (accepted) {
    return (
      <AuthCenter icon={CheckCircle2} title="Welcome aboard" subtitle="Your membership is active">
        <Card>
          <CardContent className="space-y-4 p-5">
            <Alert tone="success" title="Invitation accepted">
              You are now a member of this workspace. Loading your dashboard…
            </Alert>
          </CardContent>
        </Card>
      </AuthCenter>
    );
  }

  return (
    <AuthCenter icon={UserPlus} title="Join the workspace" subtitle="An invitation is waiting for this email address">
      <Card>
        <CardContent className="p-5">
          {error ? (
            <Alert tone="danger" title="We could not accept the invitation">
              {error}
            </Alert>
          ) : null}

          <form className={error ? "mt-4 space-y-4" : "space-y-4"} onSubmit={submit} noValidate>
            <Field>
              <Label htmlFor="name">Your name</Label>
              <Input id="name" value={name} autoComplete="name" placeholder="Ana Silva" onChange={(event) => setName(event.target.value)} required />
              {fieldErrors.name ? <FieldError>{fieldErrors.name[0]}</FieldError> : null}
            </Field>

            <Field>
              <Label htmlFor="password">Choose a password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                placeholder="••••••••••••"
                onChange={(event) => setPassword(event.target.value)}
              />
              {fieldErrors.password ? <FieldError>{fieldErrors.password[0]}</FieldError> : null}
            </Field>

            <Field>
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                placeholder="••••••••••••"
                onChange={(event) => setConfirm(event.target.value)}
              />
              {confirm && confirm !== password ? <FieldError>Passwords do not match yet.</FieldError> : null}
            </Field>

            <ul className="space-y-1.5 rounded-lg border border-border/70 bg-surface-sunken p-3">
              {checks.map((check) => (
                <li key={check.label} className="flex items-center gap-2 text-2xs">
                  <CheckCircle2 className={check.ok ? "size-3.5 text-success" : "size-3.5 text-muted-foreground/50"} />
                  <span className={check.ok ? "text-foreground" : "text-muted-foreground"}>{check.label}</span>
                </li>
              ))}
            </ul>

            <FieldHint>Accepting the invitation activates your seat and signs you in on this device.</FieldHint>

            <Button type="submit" className="w-full" disabled={pending || !strong}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {pending ? "Joining…" : "Accept invitation"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-2xs text-muted-foreground">
        Invitation links are single-use and expire after 7 days. Ask an administrator if yours has expired.
      </p>
    </AuthCenter>
  );
}

/**
 * `useSearchParams()` opts the page into client-side rendering, so the query
 * string consumer sits behind a Suspense boundary and the shell still prerenders.
 */
export default function InvitePage() {
  return (
    <React.Suspense fallback={<AuthLoading />}>
      <InvitePageContent />
    </React.Suspense>
  );
}
