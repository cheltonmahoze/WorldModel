"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for the unauthenticated screens. Built once so the hero panel,
 * brand treatment and page rhythm cannot drift between sign-in, sign-up,
 * recovery, verification and invitation flows.
 */

export function AuthHero({
  icon: Icon = Fingerprint,
  title,
  subtitle,
  points = [],
  footnote,
  glow = "left",
}: {
  icon?: LucideIcon;
  title: string;
  subtitle: string;
  points?: string[];
  footnote?: React.ReactNode;
  glow?: "left" | "right";
}) {
  return (
    <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface-sunken p-10 lg:flex">
      <div
        className={cn(
          "absolute inset-0",
          glow === "right"
            ? "bg-[radial-gradient(120%_80%_at_85%_0%,hsl(var(--primary)/0.18),transparent_60%)]"
            : "bg-[radial-gradient(120%_80%_at_15%_0%,hsl(var(--primary)/0.16),transparent_60%)]",
        )}
      />
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lifted">
            <Icon className="size-4.5" />
          </span>
          <span className="text-sm font-semibold tracking-[-0.01em]">Nexus OS</span>
        </div>
        <h1 className="mt-14 max-w-md text-[32px] font-semibold leading-[1.1] tracking-[-0.03em]">{title}</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        {points.length ? (
          <ul className="mt-10 space-y-3 text-sm text-muted-foreground">
            {points.map((line) => (
              <li key={line} className="flex items-center gap-2.5">
                <span className="size-1.5 rounded-full bg-primary" />
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {footnote ? <div className="relative flex items-center gap-2 text-2xs text-muted-foreground">{footnote}</div> : null}
    </section>
  );
}

/** Two-column layout: hero on the left, task column on the right. */
export function AuthSplit({
  hero,
  children,
  gridClass = "lg:grid-cols-[1.05fr_1fr]",
  widthClass = "max-w-[400px]",
}: {
  hero: React.ReactNode;
  children: React.ReactNode;
  gridClass?: string;
  widthClass?: string;
}) {
  return (
    <main className={cn("grid min-h-dvh", gridClass)}>
      {hero}
      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className={cn("w-full", widthClass)}>
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Fingerprint className="size-4.5" />
              </span>
              <span className="text-sm font-semibold">Nexus OS</span>
            </div>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

/** Single-column layout for focused auth tasks (recovery, verification, invite). */
export function AuthCenter({
  icon: Icon = Fingerprint,
  title,
  subtitle,
  backHref = "/login",
  backLabel = "Back to sign in",
  footer,
  children,
  widthClass = "max-w-[440px]",
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  widthClass?: string;
}) {
  return (
    <main className={cn("mx-auto flex min-h-dvh flex-col justify-center px-5 py-12", widthClass)}>
      <Link href={backHref} className="mb-8 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        {backLabel}
      </Link>

      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.02em]">{title}</h1>
          {subtitle ? <p className="text-2xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>

      <div className="mt-6 space-y-4">{children}</div>

      {footer ? <div className="mt-6 text-center text-xs text-muted-foreground">{footer}</div> : null}
    </main>
  );
}

/**
 * Prerender fallback for the auth screens: the branded shell with a quiet pulse,
 * so the first paint never flashes an unstyled form.
 */
export function AuthLoading() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-10 animate-pulse place-items-center rounded-xl bg-primary/10 text-primary">
          <Fingerprint className="size-5" />
        </span>
        <p className="text-xs text-muted-foreground">Loading your workspace…</p>
      </div>
    </main>
  );
}
