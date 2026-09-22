import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Product-styled 404 — never a raw framework error page. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-border bg-surface-sunken">
        <Compass className="size-5 text-muted-foreground" />
      </span>
      <h1 className="mt-5 text-lg font-semibold tracking-[-0.02em]">This page does not exist</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        The link may be out of date, or the record was archived. Everything else in the workspace is one click away.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild size="sm">
          <Link href="/dashboard">
            <ArrowLeft className="size-3.5" /> Back to overview
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/intelligence">Open intelligence</Link>
        </Button>
      </div>
    </main>
  );
}
