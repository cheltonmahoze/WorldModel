"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import { ROLE_LABELS, type RoleName } from "@/lib/rbac";

export type Membership = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  plan: string;
  role: RoleName;
  logoUrl: string | null;
};

export function OrgSwitcher({ current, memberships }: { current: Membership; memberships: Membership[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  const switchTo = async (organizationId: string) => {
    if (organizationId === current.organizationId) return;
    setPending(organizationId);
    try {
      await apiPost("/api/organizations/switch", { organizationId });
      toast.success("Workspace switched");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch workspace");
    } finally {
      setPending(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-card px-2.5 text-left text-[13px] font-medium transition-colors hover:bg-secondary/60">
          <span className="grid size-5 shrink-0 place-items-center rounded-md bg-primary/12 text-[11px] font-semibold text-primary">
            {current.organizationName.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-[130px] truncate sm:block">{current.organizationName}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[268px]">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {memberships.map((membership) => (
          <DropdownMenuItem
            key={membership.id}
            onSelect={() => void switchTo(membership.organizationId)}
            className="items-start"
          >
            <Building2 className="mt-0.5 size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{membership.organizationName}</span>
              <span className="block text-2xs text-muted-foreground">
                {ROLE_LABELS[membership.role]} · {membership.plan.charAt(0) + membership.plan.slice(1).toLowerCase()}
              </span>
            </span>
            {membership.organizationId === current.organizationId ? <Check className="mt-0.5 size-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/settings/organization?new=1" className="flex items-center gap-2">
            <Plus className="size-4" /> Create organization
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
