"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactCurrency, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

const axisDate = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
};

const fullDate = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
};

/**
 * Chart primitives shared by every module. They all read the same design
 * tokens as the rest of the product, so a chart never looks bolted on.
 */

export const CHART_COLORS = ["#6366f1", "#22d3ee", "#34d399", "#fbbf24", "#fb7185", "#a78bfa"];

const axisProps = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 10,
    fontSize: 12,
    boxShadow: "0 12px 32px -18px rgb(15 23 42 / 0.45)",
    padding: "8px 10px",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))", fontSize: 11, marginBottom: 4 },
  itemStyle: { color: "hsl(var(--foreground))", fontSize: 12, padding: 0 },
} as const;

export type SeriesPoint = { period: string | Date; value: number; forecast?: boolean };

function toDate(value: string | Date) {
  return typeof value === "string" ? new Date(value) : value;
}

export function AreaTrend({
  data,
  height = 240,
  valueFormatter = (value: number) => formatCompactCurrency(value),
  color = CHART_COLORS[0],
  comparisonKey,
  comparisonLabel = "Previous period",
}: {
  data: SeriesPoint[];
  height?: number;
  valueFormatter?: (value: number) => string;
  color?: string;
  comparisonKey?: string;
  comparisonLabel?: string;
}) {
  const hasForecast = data.some((point) => point.forecast);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id={`fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          {...axisProps}
          dataKey="period"
          tickFormatter={(value) => axisDate(value)}
          minTickGap={32}
        />
        <YAxis {...axisProps} tickFormatter={(value) => valueFormatter(Number(value))} width={62} />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(value) => fullDate(value as string)}
          formatter={(value: number) => valueFormatter(value)}
        />
        {comparisonKey ? <Area type="monotone" dataKey={comparisonKey} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" fill="transparent" name={comparisonLabel} /> : null}
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#fill-${color.replace("#", "")})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        {hasForecast ? (
          <Area
            type="monotone"
            dataKey="projected"
            stroke={color}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            fill="transparent"
            dot={false}
            name="Forecast"
          />
        ) : null}
        {comparisonKey ? <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} /> : null}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarsByCategory({
  data,
  height = 240,
  valueFormatter = (value: number) => formatCompactCurrency(value),
  color = CHART_COLORS[0],
  horizontal = false,
}: {
  data: { label: string; value: number; secondary?: number }[];
  height?: number;
  valueFormatter?: (value: number) => string;
  color?: string;
  horizontal?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 8 : -12 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} stroke="hsl(var(--border))" />
        {horizontal ? (
          <>
            <XAxis {...axisProps} type="number" tickFormatter={(value) => valueFormatter(Number(value))} />
            <YAxis {...axisProps} type="category" dataKey="label" width={132} />
          </>
        ) : (
          <>
            <XAxis {...axisProps} dataKey="label" interval={0} angle={-18} textAnchor="end" height={54} />
            <YAxis {...axisProps} tickFormatter={(value) => valueFormatter(Number(value))} width={62} />
          </>
        )}
        <Tooltip {...tooltipStyle} formatter={(value: number, name) => [valueFormatter(value), name === "secondary" ? "Weighted" : "Value"]} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={color} maxBarSize={46} />
        {data.some((row) => row.secondary !== undefined) ? (
          <Bar dataKey="secondary" radius={[6, 6, 0, 0]} fill={CHART_COLORS[5]} maxBarSize={46} />
        ) : null}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ComboTrend({
  data,
  height = 260,
  lineLabel = "Win rate",
  barLabel = "Won value",
  formatter = (value: number) => formatCompactCurrency(value),
}: {
  data: { period: string | Date; value: number; rate: number }[];
  height?: number;
  lineLabel?: string;
  barLabel?: string;
  formatter?: (value: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis {...axisProps} dataKey="period" tickFormatter={(value) => axisDate(value)} minTickGap={28} />
        <YAxis {...axisProps} yAxisId="left" tickFormatter={(value) => formatter(Number(value))} width={62} />
        <YAxis {...axisProps} yAxisId="right" orientation="right" tickFormatter={(value) => `${Number(value).toFixed(0)}%`} width={44} />
        <Tooltip {...tooltipStyle} labelFormatter={(value) => fullDate(value as string)} />
        <Bar yAxisId="left" dataKey="value" name={barLabel} fill={CHART_COLORS[1]} radius={[6, 6, 0, 0]} maxBarSize={30} />
        <Line yAxisId="right" type="monotone" dataKey="rate" name={lineLabel} stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function DonutBreakdown({
  data,
  height = 220,
  valueFormatter = (value: number) => formatNumber(value),
}: {
  data: { label: string; value: number }[];
  height?: number;
  valueFormatter?: (value: number) => string;
}) {
  const total = data.reduce((acc, row) => acc + row.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart data={data.map((row, index) => ({ ...row, fill: CHART_COLORS[index % CHART_COLORS.length] }))} innerRadius="42%" outerRadius="100%" startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, Math.max(1, ...data.map((row) => row.value))]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "hsl(var(--muted))" }} />
          <Tooltip {...tooltipStyle} formatter={(value: number, _name, entry) => [valueFormatter(value), (entry as { payload?: { label?: string } })?.payload?.label ?? "Value"]} />
        </RadialBarChart>
      </ResponsiveContainer>
      <ul className="w-full space-y-2 sm:w-56">
        {data.map((row, index) => (
          <li key={row.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 truncate">
              <span className="size-2 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
              <span className="truncate text-muted-foreground">{row.label}</span>
            </span>
            <span className="tabular font-medium">
              {total ? formatPercent((row.value / total) * 100, { decimals: 0 }) : "0%"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sparkline({ data, color = CHART_COLORS[0], height = 40 }: { data: number[]; color?: string; height?: number }) {
  const points = data.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color.replace("#", "")})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ScoreRing({
  score,
  size = 132,
  label,
  sublabel,
}: {
  score: number;
  size?: number;
  label?: string;
  sublabel?: string;
}) {
  const tone = score >= 80 ? CHART_COLORS[2] : score >= 60 ? CHART_COLORS[3] : CHART_COLORS[4];
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart data={[{ value: Math.max(0, Math.min(100, score)), fill: tone }]} innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "hsl(var(--muted))" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-2xl font-semibold leading-none">{Math.round(score)}</span>
        {label ? <span className="mt-1 text-2xs uppercase tracking-wider text-muted-foreground">{label}</span> : null}
        {sublabel ? <span className="mt-0.5 text-2xs text-muted-foreground">{sublabel}</span> : null}
      </div>
    </div>
  );
}

export function ScoreBars({ factors }: { factors: { label: string; score: number; weight?: number; detail?: string }[] }) {
  return (
    <ul className="space-y-3">
      {factors.map((factor) => (
        <li key={factor.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              {factor.label}
              {factor.weight ? <span className="ml-1.5 text-2xs text-muted-foreground/70">{Math.round(factor.weight * 100)}% weight</span> : null}
            </span>
            <span className="tabular font-medium">{factor.score.toFixed(0)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(2, Math.min(100, factor.score))}%`,
                background: factor.score >= 80 ? CHART_COLORS[2] : factor.score >= 60 ? CHART_COLORS[3] : CHART_COLORS[4],
              }}
            />
          </div>
          {factor.detail ? <p className="text-2xs text-muted-foreground">{factor.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function ValueBreakdownTable({ rows }: { rows: { label: string; value: number }[] }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-border/60 last:border-0">
            <td className="py-2 text-muted-foreground">{row.label}</td>
            <td className="tabular py-2 text-right font-medium">{formatCurrency(row.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export { Cell, Bar };
