"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { ArrowRight, Building2, Loader2, ShieldCheck } from "lucide-react";
import { AuthHero, AuthSplit, AuthLoading } from "@/components/app/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldHint, Label } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { useApiMutation } from "@/hooks/use-api";
import { ApiError } from "@/lib/api-client";

type SignupResponse = { user: { id: string; name: string; email: string }; emailVerification: { expiresAt: string } | null; redirectTo: string };

const INDUSTRIES = ["B2B SaaS", "Financial services", "Manufacturing", "Logistics", "Professional services", "Healthcare", "Retail", "Energy", "Telecom", "Other"];

function SignupPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    password: "",
    organizationName: "",
    industry: "B2B SaaS",
    plan: "GROWTH",
  });
  const [formError, setFormError] = React.useState<string | null>(null);

  const signup = useApiMutation<SignupResponse, typeof form>({
    path: "/api/auth/signup",
    onSuccess: (data) => {
      router.replace(params.get("next") ?? data.data.redirectTo);
      router.refresh();
    },
    onError: (error) => setFormError(error.message),
  });

  const fieldError = (field: string) => (signup.error instanceof ApiError ? signup.error.fieldError(field) : undefined);

  return (
    <AuthSplit
      gridClass="lg:grid-cols-[1fr_1.05fr]"
      widthClass="max-w-[420px]"
      hero={
        <AuthHero
          icon={Building2}
          glow="right"
          title="Stand up a revenue operating system in minutes."
          subtitle="Your workspace ships with multi-tenancy, role-based access, an audit trail, background automations and a documented API on the day you sign up."
          points={[
            "14-day trial on every plan",
            "Starter €99 · Growth €399 · Scale €999 per month",
            "Upgrade, downgrade or cancel from billing settings",
          ]}
          footnote={
            <>
              <ShieldCheck className="size-3.5" />
              GDPR-ready data residency options · EU hosting by default
            </>
          }
        />
      }
    >
      <h2 className="text-xl font-semibold tracking-[-0.02em]">Create your workspace</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">You become the Owner of this organization. Additional seats are billed per plan.</p>

      <Card className="mt-6">
            <CardContent className="p-5">
              {formError ? <Alert tone="danger" title="We could not create the workspace">{formError}</Alert> : null}
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFormError(null);
                  signup.mutate(form);
                }}
              >
                <Field>
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" required />
                  <FieldHint>{fieldError("name")}</FieldHint>
                </Field>
                <Field>
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" name="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required />
                  <FieldHint>{fieldError("email")}</FieldHint>
                </Field>
                <Field>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" name="password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" required />
                  <FieldHint>{fieldError("password") ?? "Minimum 10 characters with at least one letter and one number."}</FieldHint>
                </Field>
                <Field>
                  <Label htmlFor="organizationName">Organization</Label>
                  <Input id="organizationName" value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} placeholder="Northwind Group" required />
                  <FieldHint>{fieldError("organizationName")}</FieldHint>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label htmlFor="industry">Industry</Label>
                    <NativeSelect id="industry" value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })}>
                      {INDUSTRIES.map((industry) => (
                        <option key={industry} value={industry}>
                          {industry}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <Label htmlFor="plan">Starting plan</Label>
                    <NativeSelect id="plan" value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })}>
                      <option value="STARTER">Starter — €99/mo</option>
                      <option value="GROWTH">Growth — €399/mo</option>
                      <option value="SCALE">Scale — €999/mo</option>
                    </NativeSelect>
                  </Field>
                </div>

                <Button type="submit" className="w-full" disabled={signup.isPending}>
                  {signup.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {signup.isPending ? "Creating workspace…" : "Create workspace"}
                  {!signup.isPending ? <ArrowRight className="size-3.5" /> : null}
                </Button>
                <p className="text-2xs leading-relaxed text-muted-foreground">
                  By creating a workspace you agree to the platform terms. An email-verification link is generated for your account in the verification centre.
                </p>
              </form>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
      </p>
    </AuthSplit>
  );
}

/**
 * `useSearchParams()` opts the page into client-side rendering, so the query
 * string consumer sits behind a Suspense boundary and the shell still prerenders.
 */
export default function SignupPage() {
  return (
    <React.Suspense fallback={<AuthLoading />}>
      <SignupPageContent />
    </React.Suspense>
  );
}
