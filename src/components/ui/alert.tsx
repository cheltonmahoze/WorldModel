import { AlertTriangle, CheckCircle2, Info, ShieldAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  info: { wrapper: "border-info/25 bg-info-soft/60 text-info", icon: Info },
  success: { wrapper: "border-success/25 bg-success-soft/60 text-success", icon: CheckCircle2 },
  warning: { wrapper: "border-warning/25 bg-warning-soft/70 text-warning", icon: AlertTriangle },
  danger: { wrapper: "border-destructive/25 bg-destructive-soft/70 text-destructive", icon: XCircle },
  critical: { wrapper: "border-destructive/30 bg-destructive-soft/70 text-destructive", icon: ShieldAlert },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const config = TONES[tone];
  const Icon = config.icon;
  return (
    <div className={cn("flex gap-3 rounded-xl border px-3.5 py-3", config.wrapper, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <p className="text-[13px] font-semibold">{title}</p> : null}
        {children ? <div className="text-xs leading-relaxed text-foreground/75">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
