"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { ArrowRight, Loader2, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { AuthHero, AuthSplit, AuthLoading } from "@/components/app/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Field, FieldHint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useApiMutation } from "@/hooks/use-api";
import { ApiError } from "@/lib/api-client";

type LoginResponse = { user: { id: string; name: string; email: string }; organization: { id: string; name: string } | null; redirectTo: string };

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [email, setEmail] = React.useState("alex.morgan@nexus-demo.com");
  const [password, setPassword] = React.useState("NexusDemo2026!");
  const [formError, setFormError] = React.useState<string | null>(null);

  const login = useApiMutation<LoginResponse, { email: string; password: string; next?: string }>({
    path: "/api/auth/login",
    method: "POST",
    onSuccess: (data) => {
      router.replace(next && next.startsWith("/") ? next : data.data.redirectTo);
      router.refresh();
    },
    onError: (error) => setFormError(error.message),
  });

  const fieldError = (field: string) => (login.error instanceof ApiError ? login.error.fieldError(field) : undefined);

  return (
    <AuthSplit
      hero={
        <AuthHero
          title="Your business, decoded."
          subtitle="Transforme dados operacionais em decisões que movem receita. Every signal, risk and opportunity in one workspace — with the action that follows it."
          points={[
            "Where revenue is leaking, quantified in euros",
            "Which accounts are about to churn — and why",
            "What your team should execute this week",
          ]}
          footnote={
            <>
              <ShieldCheck className="size-3.5" />
              Multi-tenant by design · RBAC · full audit trail
            </>
          }
        />
      }
    >

      <h2 className="text-xl font-semibold tracking-[-0.02em]">Sign in</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Use your work email to open the revenue workspace.</p>

          <Card className="mt-6">
            <CardContent className="space-y-4 p-5">
              {formError ? <Alert tone="danger" title="We could not sign you in">{formError}</Alert> : null}

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFormError(null);
                  login.mutate({ email, password, next: next ?? undefined });
                }}
              >
                <Field>
                  <Label htmlFor="email">Work email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="pl-8" />
                  </div>
                  <FieldHint>{fieldError("email")}</FieldHint>
                </Field>

                <Field>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="pl-8" />
                  </div>
                  <FieldHint>{fieldError("password")}</FieldHint>
                </Field>

                <div className="flex items-center justify-between">
                  <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    Forgot password?
                  </Link>
                  <FieldHint>Session expires after 30 days of inactivity.</FieldHint>
                </div>

                <Button type="submit" className="w-full" disabled={login.isPending}>
                  {login.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {login.isPending ? "Signing in…" : "Sign in"}
                  {!login.isPending ? <ArrowRight className="size-3.5" /> : null}
                </Button>
              </form>

              <Button asChild variant="outline" className="w-full">
                <a href="/api/auth/demo?next=/dashboard">
                  <Sparkles className="size-3.5" /> Enter the demo workspace without signing in
                </a>
              </Button>

              <div className="rounded-lg border border-border/70 bg-surface-sunken p-3 text-2xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">Demo workspace · open access</p>
                <p className="mt-0.5">
                  Anyone with the link lands straight in the Northwind Group workspace as its Owner. Prefer an account? Sign in as
                  alex.morgan@nexus-demo.com · NexusDemo2026!
                  <br />
                  Other roles: sofia.marques@ (admin), daniel.okafor@ (manager), marco.rossi@ (analyst), priya.raman@ (member) — all @nexus-demo.com.
                </p>
              </div>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            No workspace yet?{" "}
            <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              Create one
            </Link>
          </p>
    </AuthSplit>
  );
}

/**
 * `useSearchParams()` opts the page into client-side rendering, so the query
 * string consumer sits behind a Suspense boundary and the shell still prerenders.
 */
export default function LoginPage() {
  return (
    <React.Suspense fallback={<AuthLoading />}>
      <LoginPageContent />
    </React.Suspense>
  );
}
