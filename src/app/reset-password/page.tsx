"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { AuthCenter, AuthLoading } from "@/components/app/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldHint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiPost, ApiError } from "@/lib/api-client";

const MIN_LENGTH = 12;

function ResetPasswordPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [done, setDone] = React.useState(false);

  const checks = [
    { label: `At least ${MIN_LENGTH} characters`, ok: password.length >= MIN_LENGTH },
    { label: "One uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "One lowercase letter", ok: /[a-z]/.test(password) },
    { label: "One number", ok: /\d/.test(password) },
    { label: "One symbol", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const strong = checks.every((check) => check.ok) && password === confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!strong) {
      setError("Choose a password that meets every requirement and matches the confirmation.");
      return;
    }
    setPending(true);
    try {
      await apiPost<{ ok: boolean }>("/api/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => {
        router.push("/login");
        router.refresh();
      }, 1400);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
        setFieldErrors(cause.details ?? {});
      } else {
        setError("We could not reset the password. Try again in a moment.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCenter
      icon={done ? CheckCircle2 : KeyRound}
      title={done ? "Password updated" : "Choose a new password"}
      subtitle={done ? "All other devices were signed out" : "Single-use reset link"}
      footer={
        <span>
          Need a new link? <Link className="text-foreground underline underline-offset-4" href="/forgot-password">Request another reset email</Link>
        </span>
      }
    >
      {!token ? (
        <Card>
          <CardContent className="p-5">
            <Alert tone="warning" title="This link is incomplete">
              The reset token is missing from the URL. Open the link from the email exactly as it was sent, or request a new one.
            </Alert>
          </CardContent>
        </Card>
      ) : done ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            <Alert tone="success" title="Password updated">
              Your new password is active and every previous session was revoked. Redirecting you to the sign-in screen…
            </Alert>
            <Button asChild className="w-full">
              <Link href="/login">Sign in now</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-5">
            <form className="space-y-4" onSubmit={submit} noValidate>
              {error ? (
                <Alert tone="danger" title="We could not complete the reset">
                  {error}
                </Alert>
              ) : null}

              <Field>
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
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

              <Button type="submit" className="w-full" disabled={pending || !strong}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                {pending ? "Updating password…" : "Set new password"}
              </Button>

              <FieldHint>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" />
                  Passwords are hashed with scrypt and never logged.
                </span>
              </FieldHint>
            </form>
          </CardContent>
        </Card>
      )}
    </AuthCenter>
  );
}

/**
 * `useSearchParams()` opts the page into client-side rendering, so the query
 * string consumer sits behind a Suspense boundary and the shell still prerenders.
 */
export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<AuthLoading />}>
      <ResetPasswordPageContent />
    </React.Suspense>
  );
}
