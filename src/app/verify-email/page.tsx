"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, BadgeCheck, Loader2, MailCheck } from "lucide-react";
import { AuthCenter, AuthLoading } from "@/components/app/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiPost, ApiError } from "@/lib/api-client";

type State = "verifying" | "verified" | "failed";

function VerifyEmailPageContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = React.useState<State>(token ? "verifying" : "failed");
  const [message, setMessage] = React.useState<string>(
    token ? "" : "The verification token is missing from this link. Open the link from the email exactly as it was sent.",
  );

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiPost<{ ok: boolean; verified: boolean }>("/api/auth/verify-email", { token })
      .then(() => {
        if (!cancelled) setState("verified");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState("failed");
        setMessage(error instanceof ApiError ? error.message : "We could not verify this address. Request a new link from settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthCenter
      icon={state === "verified" ? BadgeCheck : state === "failed" ? AlertTriangle : MailCheck}
      title={state === "verified" ? "Email verified" : state === "failed" ? "Verification failed" : "Verifying your email"}
      subtitle={state === "verifying" ? "One moment while we confirm the token" : undefined}
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          {state === "verifying" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking your verification token…
            </p>
          ) : state === "verified" ? (
            <>
              <Alert tone="success" title="Your address is confirmed">
                Email verification is recorded on your account. You can now sign in and receive intelligence briefs, digests and alerts at this address.
              </Alert>
              <Button asChild className="w-full">
                <Link href="/dashboard">Enter the workspace</Link>
              </Button>
            </>
          ) : (
            <>
              <Alert tone="danger" title="We could not verify this address">
                {message}
              </Alert>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/login">Back to sign in</Link>
                </Button>
                <Button asChild className="flex-1">
                  <Link href="/settings?tab=security">Send a new link</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-2xs text-muted-foreground">
        Verification links are single-use and expire after 24 hours. Nothing changes on your account unless the token is valid.
      </p>
    </AuthCenter>
  );
}

/**
 * `useSearchParams()` opts the page into client-side rendering, so the query
 * string consumer sits behind a Suspense boundary and the shell still prerenders.
 */
export default function VerifyEmailPage() {
  return (
    <React.Suspense fallback={<AuthLoading />}>
      <VerifyEmailPageContent />
    </React.Suspense>
  );
}
