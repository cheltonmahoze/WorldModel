"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Command,
  CornerDownLeft,
  FileDown,
  FilePlus2,
  LayoutDashboard,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery, qk } from "@/hooks/use-api";
import { useDebouncedValue, useHotkey } from "@/hooks/use-hotkey";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/components/app/nav-config";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { formatCurrency, formatDate, toCsv } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SearchGroup = {
  customers: { id: string; label: string; sublabel: string; href: string }[];
  opportunities: { id: string; label: string; sublabel: string; href: string }[];
  risks: { id: string; label: string; sublabel: string; href: string }[];
  users: { id: string; label: string; sublabel: string; href: string }[];
  automations: { id: string; label: string; sublabel: string; href: string }[];
};

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: typeof Search;
  perform: () => void | Promise<void>;
};

const CREATE_TARGETS = [
  { key: "opportunity", label: "Create opportunity", href: "/opportunities?new=1", permission: "opportunity:write" },
  { key: "customer", label: "Create customer", href: "/customers?new=1", permission: "customer:write" },
  { key: "automation", label: "Create automation", href: "/automations?new=1", permission: "automation:write" },
  { key: "risk", label: "Log a risk", href: "/risks?new=1", permission: "risk:write" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebouncedValue(query, 180);

  useHotkey(
    useCallback((event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k", []),
    useCallback(() => setOpen((value) => !value), []),
  );

  useEffect(() => {
    const listener = () => setOpen(true);
    window.addEventListener("nexus:open-command", listener);
    return () => window.removeEventListener("nexus:open-command", listener);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const searchQuery = useApiQuery<SearchGroup>(qk.search(debounced), `/api/search?q=${encodeURIComponent(debounced)}&limit=5`, {
    enabled: open && debounced.trim().length >= 2,
    staleTime: 10_000,
  });

  const exportReport = useCallback(async () => {
    setExporting(true);
    try {
      const response = await apiFetch<{ rows: Record<string, unknown>[]; filename: string }>("/api/reports/export?type=pipeline");
      downloadBlob(response.data.filename, toCsv(response.data.rows));
      toast.success("Pipeline report exported");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, []);

  const commands = useMemo<CommandItem[]>(() => {
    const navigation: CommandItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => ({
      id: `nav:${item.href}`,
      label: `Go to ${item.label}`,
      hint: item.description,
      group: "Navigation",
      icon: item.icon,
      perform: () => router.push(item.href),
    }));

    const creates: CommandItem[] = CREATE_TARGETS.map((target) => ({
      id: `create:${target.key}`,
      label: target.label,
      group: "Actions",
      icon: FilePlus2,
      perform: () => router.push(target.href),
    }));

    return [
      ...creates,
      {
        id: "run:intelligence",
        label: "Run intelligence analysis",
        hint: "Re-score opportunities, risks and the executive brief",
        group: "Actions",
        icon: Sparkles,
        perform: async () => {
          await apiFetch("/api/intelligence/run", { method: "POST", json: { engines: ["insights", "risks", "brief"] } });
          toast.success("Intelligence refreshed");
          router.refresh();
        },
      },
      {
        id: "export:pipeline",
        label: "Export pipeline report (CSV)",
        group: "Actions",
        icon: FileDown,
        perform: exportReport,
      },
      {
        id: "open:analytics",
        label: "Open analytics",
        hint: "Segments, funnel, cohort and temporal comparison",
        group: "Actions",
        icon: LayoutDashboard,
        perform: () => router.push("/analytics"),
      },
      {
        id: "search:customer",
        label: "Search a customer",
        hint: "Type a company name to open the 360° view",
        group: "Actions",
        icon: Building2,
        perform: () => router.push("/customers"),
      },
      ...navigation,
    ];
  }, [router, exportReport]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 12);
    const needle = query.toLowerCase();
    return commands.filter((command) => command.label.toLowerCase().includes(needle) || command.group.toLowerCase().includes(needle)).slice(0, 8);
  }, [commands, query]);

  const resultItems = useMemo<CommandItem[]>(() => {
    const data = searchQuery.data?.data;
    if (!data) return [];
    const map: [keyof SearchGroup, string, typeof Building2][] = [
      ["customers", "Customers", Building2],
      ["opportunities", "Opportunities", Sparkles],
      ["risks", "Risks", ShieldAlert],
      ["users", "People", Users],
      ["automations", "Automations", Workflow],
    ];
    return map.flatMap(([key, group, icon]) =>
      (data[key] ?? []).map((entry) => ({
        id: `${key}:${entry.id}`,
        label: entry.label,
        hint: entry.sublabel,
        group,
        icon,
        perform: () => router.push(entry.href),
      })),
    );
  }, [searchQuery.data, router]);

  const allItems = useMemo(() => [...filteredCommands, ...resultItems], [filteredCommands, resultItems]);
  const active = allItems[activeIndex];
  const grouped = useMemo(() => {
    const groups = new Map<string, CommandItem[]>();
    allItems.forEach((item, index) => {
      groups.set(item.group, [...(groups.get(item.group) ?? []), { ...item, id: `${item.id}#${index}` }]);
    });
    return [...groups.entries()];
  }, [allItems]);

  useEffect(() => setActiveIndex(0), [query, resultItems.length]);

  const run = async (item?: CommandItem) => {
    if (!item) return;
    setOpen(false);
    await item.perform();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex h-9 w-full max-w-[420px] items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-left text-[13px] text-muted-foreground transition-colors hover:border-border hover:bg-secondary/40"
      >
        <Search className="size-3.5" />
        <span className="flex-1 truncate">Search customers, deals, risks, people…</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-border/70 bg-surface-sunken px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:flex">
          <Command className="size-2.5" /> K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent hideClose size="lg" className="top-[16%] translate-y-0 gap-0 p-0 sm:max-w-[620px]">
          <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.min(index + 1, allItems.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  void run(active);
                }
              }}
              placeholder="Search or type a command…"
              className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              aria-label="Command palette search"
            />
            {searchQuery.isFetching ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          </div>

          <div className="scrollbar-thin max-h-[52vh] overflow-y-auto p-1.5">
            {searchQuery.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-8 w-full" />
                ))}
              </div>
            ) : allItems.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium">No matches for “{query}”</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a company name, a deal title, or one of the commands such as “Create opportunity”.
                </p>
              </div>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group} className="mb-1">
                  <p className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
                  {items.map((item) => {
                    const index = Number(item.id.split("#")[1]);
                    const isActive = index === activeIndex;
                    return (
                      <button
                        key={item.id}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => void run(allItems[index])}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                          isActive ? "bg-secondary" : "hover:bg-secondary/60",
                        )}
                      >
                        <item.icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{item.label}</span>
                          {item.hint ? <span className="block truncate text-2xs text-muted-foreground">{item.hint}</span> : null}
                        </span>
                        {isActive ? <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5 text-2xs text-muted-foreground">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border/70 bg-surface-sunken px-1">↑</kbd>
                <kbd className="rounded border border-border/70 bg-surface-sunken px-1">↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border/70 bg-surface-sunken px-1">↵</kbd> open
              </span>
              <span className="hidden items-center gap-1 sm:flex">
                <kbd className="rounded border border-border/70 bg-surface-sunken px-1">esc</kbd> close
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              {exporting ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} Nexus Intelligence
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
