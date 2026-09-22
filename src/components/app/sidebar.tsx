"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/components/app/nav-config";

type Counts = { insights: number; risks: number; notifications: number };

export function Sidebar({ counts }: { counts: Counts }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("nexus-sidebar");
    if (stored === "collapsed") setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((previous) => {
      localStorage.setItem("nexus-sidebar", previous ? "expanded" : "collapsed");
      return !previous;
    });
  };

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "hidden shrink-0 flex-col border-r border-border/70 bg-surface/80 backdrop-blur transition-[width] duration-200 lg:flex",
        collapsed ? "w-[68px]" : "w-[248px]",
      )}
    >
      <div className={cn("flex h-14 items-center gap-2 border-b border-border/70 px-4", collapsed && "justify-center px-2")}>
        <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground">
            N
          </span>
          {!collapsed && (
            <span className="truncate text-sm font-semibold tracking-[-0.01em]">
              Nexus<span className="text-muted-foreground"> OS</span>
            </span>
          )}
        </Link>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {!collapsed && <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Workspace</p>}
        {PRIMARY_NAV.map((item) => {
          const active = isActive(item.href);
          const badge = item.badgeKey ? counts[item.badgeKey] : 0;
          const content = (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <item.icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && badge > 0 ? (
                <Badge variant={item.badgeKey === "risks" ? "danger" : "neutral"} className="ml-auto tabular">
                  {badge}
                </Badge>
              ) : null}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{content}</TooltipTrigger>
              <TooltipContent side="right">
                {item.label} — {item.description}
              </TooltipContent>
            </Tooltip>
          ) : (
            content
          );
        })}

        <div className="pt-3">
          {!collapsed && <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Platform</p>}
          {SECONDARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                isActive(item.href.split("?")[0]!)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          ))}
        </div>
      </nav>

      {!collapsed ? (
        <div className="border-t border-border/70 p-3">
          <div className="surface-inset p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Intelligence engine</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {counts.insights} opportunities and {counts.risks} risks tracked from live tenant data.
            </p>
            <Button asChild size="sm" variant="secondary" className="mt-3 w-full">
              <Link href="/intelligence">
                <Plus className="size-3.5" /> Run analysis
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <button
        onClick={toggle}
        className="flex h-10 items-center justify-center border-t border-border/70 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
      </button>
    </aside>
  );
}
