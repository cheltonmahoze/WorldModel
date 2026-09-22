import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        neutral: "border-border/70 bg-secondary/60 text-muted-foreground",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        danger: "border-transparent bg-destructive-soft text-destructive",
        info: "border-transparent bg-info-soft text-info",
        outline: "border-border text-foreground",
        solid: "border-transparent bg-foreground text-background",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const DOT_TONES = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
} as const;

export function StatusDot({ tone = "neutral", pulse = false }: { tone?: keyof typeof DOT_TONES; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-1.5">
      {pulse && <span className={cn("absolute inline-flex size-full animate-pulse-ring rounded-full", DOT_TONES[tone])} />}
      <span className={cn("relative inline-flex size-1.5 rounded-full", DOT_TONES[tone])} />
    </span>
  );
}

export { badgeVariants };
