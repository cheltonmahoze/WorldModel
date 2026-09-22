"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/components/app/nav-config";
import { cn } from "@/lib/utils";

export function MobileNav({ counts }: { counts: { insights: number; risks: number; notifications: number } }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  return (
    <>
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
        <Menu className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[86vw] max-w-[320px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-md bg-primary text-[12px] font-bold text-primary-foreground">N</span>
              Nexus OS
            </SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-1 px-3">
            <button
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event("nexus:open-command"));
              }}
              className="mb-2 flex w-full items-center gap-2 rounded-lg border border-border/70 bg-surface-sunken/60 px-3 py-2 text-xs text-muted-foreground"
            >
              <Search className="size-3.5" /> Search customers, deals, risks…
            </button>
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => {
              const badge = item.badgeKey ? counts[item.badgeKey] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive(item.href.split("?")[0]!)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge > 0 ? <Badge variant={item.badgeKey === "risks" ? "danger" : "neutral"}>{badge}</Badge> : null}
                </Link>
              );
            })}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
