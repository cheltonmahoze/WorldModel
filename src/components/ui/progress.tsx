import { cn } from "@/lib/utils";

const TONES = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
} as const;

export function Progress({
  value,
  tone = "primary",
  className,
  height = 6,
}: {
  value: number;
  tone?: keyof typeof TONES;
  className?: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-secondary", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", TONES[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function ScoreRing({
  score,
  size = 64,
  label,
  tone = "primary",
}: {
  score: number;
  size?: number;
  label?: string;
  tone?: keyof typeof TONES;
}) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const stroke = { primary: "stroke-primary", success: "stroke-success", warning: "stroke-warning", danger: "stroke-destructive", info: "stroke-info" }[tone];
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} className="stroke-secondary" strokeWidth={6} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={cn(stroke, "transition-[stroke-dashoffset] duration-700 ease-out")}
          strokeWidth={6}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-sm font-semibold">{Math.round(score)}</span>
        {label ? <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span> : null}
      </div>
    </div>
  );
}
