"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy, RefreshCw, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MobileNav } from "@/components/app/mobile-nav";
import { CommandPalette } from "@/components/app/command-palette";
import { NotificationCenter } from "@/components/app/notification-center";
import { OrgSwitcher, type Membership } from "@/components/app/org-switcher";
import { UserMenu } from "@/components/app/user-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useApiMutation } from "@/hooks/use-api";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/components/app/nav-config";
import type { RoleName } from "@/lib/rbac";
import { toast } from "sonner";

export function Topbar({
  user,
  role,
  membership,
  memberships,
  counts,
}: {
  user: { name: string; email: string; avatarUrl: string | null; jobTitle: string | null };
  role: RoleName;
  membership: Membership;
  memberships: Membership[];
  counts: { insights: number; risks: number; notifications: number };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const current = [...PRIMARY_NAV, ...SECONDARY_NAV].find((item) =>
    pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href.split("?")[0]}/`)),
  );

  const refresh = useApiMutation<{ insights: number; risks: number; briefUpdatedAt: string }, void>({
    path: "/api/intelligence/run",
    method: "POST",
    onSuccess: (response) => {
      toast.success("Intelligence refreshed", {
        description: `${response.data.insights} opportunities and ${response.data.risks} risks re-scored.`,
      });
      startTransition(() => router.refresh());
    },
  });

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border/70 bg-background/85 px-3 backdrop-blur-xl sm:gap-3 sm:px-4">
      <MobileNav counts={counts} />
      <div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex">
        <CommandPalette />
      </div>
      <div className="flex flex-1 items-center gap-2 lg:hidden">
        <span className="truncate text-sm font-semibold">{current?.label ?? "Nexus OS"}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Badge variant="neutral" className="hidden xl:inline-flex">
          {membership.plan.charAt(0) + membership.plan.slice(1).toLowerCase()} plan
        </Badge>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              loading={refresh.isPending || isPending}
              onClick={() => refresh.mutate()}
              aria-label="Refresh intelligence"
            >
              {refresh.isPending || isPending ? null : <RefreshCw className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Re-run the intelligence engines on live tenant data</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm" aria-label="Help and documentation">
              <Link href="/help">
                <LifeBuoy className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>How Nexus OS computes every metric</TooltipContent>
        </Tooltip>
        <NotificationCenter organizationId={membership.organizationId} />
        <div className="mx-0.5 hidden h-6 w-px bg-border/70 sm:block" />
        <OrgSwitcher current={membership} memberships={memberships} />
        <UserMenu user={user} role={role} organizationName={membership.organizationName} />
      </div>

      <Link href="/intelligence" className="sr-only">
        <Sparkles /> Intelligence
      </Link>
    </header>
  );
}
