"use client";

import { useRouter } from "next/navigation";
import { LogOut, Monitor, Moon, Shield, Sun, User } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { useApiMutation } from "@/hooks/use-api";
import { ROLE_LABELS, type RoleName } from "@/lib/rbac";
import Link from "next/link";

export function UserMenu({
  user,
  role,
  organizationName,
}: {
  user: { name: string; email: string; avatarUrl: string | null; jobTitle: string | null };
  role: RoleName;
  organizationName: string;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const logout = useApiMutation<{ ok: true }, void>({
    path: "/api/auth/logout",
    method: "POST",
    onSuccess: () => {
      router.replace("/login");
      router.refresh();
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full transition-opacity hover:opacity-85" aria-label="Account menu">
          <UserAvatar name={user.name} src={user.avatarUrl} className="size-8" tone="primary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[264px]">
        <div className="flex items-start gap-3 px-2.5 py-2">
          <UserAvatar name={user.name} src={user.avatarUrl} className="size-9" tone="primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{user.name}</p>
            <p className="truncate text-2xs text-muted-foreground">{user.email}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <Badge variant="default">{ROLE_LABELS[role]}</Badge>
              <span className="truncate text-2xs text-muted-foreground">{organizationName}</span>
            </div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=profile" className="flex items-center gap-2">
            <User className="size-4" /> Profile & preferences
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=security" className="flex items-center gap-2">
            <Shield className="size-4" /> Security & sessions
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? <Moon className="size-4" /> : theme === "light" ? <Sun className="size-4" /> : <Monitor className="size-4" />}
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as "light" | "dark" | "system")}>
              <DropdownMenuRadioItem value="light" className="gap-2 text-[13px]">
                <Sun className="size-4" /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" className="gap-2 text-[13px]">
                <Moon className="size-4" /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system" className="gap-2 text-[13px]">
                <Monitor className="size-4" /> System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" disabled={logout.isPending} onSelect={() => logout.mutate()}>
          <LogOut className="size-4" /> {logout.isPending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
