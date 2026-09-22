import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Number & currency formatting ─────────────────────────────────────────── */

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  if (typeof value === "object" && value !== null && "toString" in value) {
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function formatCurrency(
  value: unknown,
  options: { currency?: string; compact?: boolean; decimals?: number; locale?: string } = {},
) {
  const amount = toNumber(value);
  const { currency = "EUR", compact = false, decimals, locale = "en-GB" } = options;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: decimals ?? (compact ? 1 : Math.abs(amount) > 1000 ? 0 : 2),
    minimumFractionDigits: decimals ?? (compact ? 0 : Math.abs(amount) > 1000 ? 0 : 2),
  }).format(amount);
}

export function formatCompactCurrency(value: unknown, currency = "EUR") {
  return formatCurrency(value, { currency, compact: true });
}

export function formatNumber(value: unknown, options: { decimals?: number; compact?: boolean } = {}) {
  const amount = toNumber(value);
  return new Intl.NumberFormat("en-GB", {
    notation: options.compact ? "compact" : "standard",
    maximumFractionDigits: options.decimals ?? 0,
  }).format(amount);
}

export function formatPercent(value: unknown, options: { decimals?: number; sign?: boolean } = {}) {
  const amount = toNumber(value);
  const formatted = new Intl.NumberFormat("en-GB", {
    style: "percent",
    maximumFractionDigits: options.decimals ?? 1,
    minimumFractionDigits: options.decimals ?? 1,
  }).format(amount / 100);
  return options.sign && amount > 0 ? `+${formatted}` : formatted;
}

export function formatDelta(value: unknown, decimals = 1) {
  const amount = toNumber(value);
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(decimals)}%`;
}

/* ── Dates ────────────────────────────────────────────────────────────────── */

export function formatDate(value: Date | string | null | undefined, style: "short" | "long" | "month" = "short") {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  if (style === "month") return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(date);
  if (style === "long")
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(value: Date | string | null | undefined, now: Date = new Date()) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  const formatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds || unit === "second") {
      return formatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return "just now";
}

export function daysBetween(a: Date | string, b: Date | string = new Date()) {
  const first = typeof a === "string" ? new Date(a) : a;
  const second = typeof b === "string" ? new Date(b) : b;
  return Math.round((second.getTime() - first.getTime()) / 86400000);
}

export function daysAgo(days: number, from: Date = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return date;
}

/* ── Strings & misc ───────────────────────────────────────────────────────── */

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function truncate(value: string, length = 96) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function percentChange(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function healthTone(score: number) {
  if (score >= 80) return "success" as const;
  if (score >= 65) return "info" as const;
  if (score >= 50) return "warning" as const;
  return "danger" as const;
}

export function groupBy<T, K extends string | number>(items: T[], keyFn: (item: T) => K) {
  return items.reduce<Record<K, T[]>>((acc, item) => {
    const key = keyFn(item);
    (acc[key] ||= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

export function sum<T>(items: T[], valueFn: (item: T) => number) {
  return items.reduce((acc, item) => acc + valueFn(item), 0);
}

export function average<T>(items: T[], valueFn: (item: T) => number) {
  return items.length ? sum(items, valueFn) / items.length : 0;
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function csvEscape(value: unknown) {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]) {
  if (!rows.length) return "";
  const cols = columns ?? Object.keys(rows[0]!);
  const header = cols.join(",");
  const body = rows.map((row) => cols.map((col) => csvEscape(row[col])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const parseLine = (line: string) => {
    const values: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      if (quoted) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') quoted = false;
        else current += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") {
        values.push(current);
        current = "";
      } else current += char;
    }
    values.push(current);
    return values;
  };
  const headers = parseLine(lines[0]!);
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}
