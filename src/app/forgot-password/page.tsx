"use client";

import Link from "next/link";
import * as React from "react";
import { KeyRound, Loader2, MailCheck } from "lucide-react";
import { AuthCenter } from "@/components/app/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldHint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useApiMutation } from "@/hooks/use-api";

/** Mirrors the server contract: the raw token only exists outside production. */
type ResetResponse = {
  sent: boolean;
  message: string;
  devToken?: string | null;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const request = useApiMutation<ResetResponse, { email: string }>({
    path: "/api/auth/forgot-password",
    onError: () => undefined,
  });

  const sent = request.isSuccess;
  const devToken = request.data?.data.devToken ?? null;
  const resetUrl = devToken ? `/reset-password?token=${devToken}` : null;

  return (
    <AuthCenter
      icon={sent ? MailCheck : KeyRound}
      title={sent ? "Check your inbox" : "Reset your password"}
      subtitle={sent ? "Single-use link, 45 minute validity" : "We will email you a single-use link"}
    >
      {sent ? (
        <Card>
          <CardContent className="space-y-3 p-5 text-sm">
            <p className="text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, a single-use reset link was generated. It expires in 45
              minutes and can only be used once.
            </p>

            {resetUrl ? (
              <Alert tone="info" title="No mail provider configured">
                This deployment has no SMTP credentials, so the link is surfaced here instead of being emailed (non-production only).
                <div className="mt-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={resetUrl}>Open the reset link</Link>
                  </Button>
                </div>
                <p className="mt-2 break-all font-mono text-2xs text-muted-foreground">{resetUrl}</p>
              </Alert>
            ) : null}

            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Return to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-5">
            {request.isError ? (
              <Alert tone="danger" title="Request failed">
                {request.error.message}
              </Alert>
            ) : null}
            <form
              className={request.isError ? "mt-4 space-y-4" : "space-y-4"}
              onSubmit={(event) => {
                event.preventDefault();
                request.mutate({ email });
              }}
            >
              <Field>
                <Label htmlFor="email">Work email</Label>
                <Input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
                <FieldHint>The response is identical whether or not the account exists — no account enumeration.</FieldHint>
              </Field>
              <Button type="submit" className="w-full" disabled={request.isPending}>
                {request.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {request.isPending ? "Generating link…" : "Send reset link"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </AuthCenter>
  );
}
