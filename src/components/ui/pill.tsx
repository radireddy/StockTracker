"use client";

import { cn } from "@/lib/utils";

/**
 * Rounded pill button used for the portfolio/watchlist selector rows on both
 * desktop and mobile. Supports an optional colour dot, a trailing count, an
 * active state (brand fill) and a dashed "ghost" style for the +New affordance.
 */
export function Pill({
  active = false,
  ghost = false,
  dotColor,
  count,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  active?: boolean;
  ghost?: boolean;
  dotColor?: string | null;
  count?: number | null;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[0.8rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : ghost
            ? "border-dashed border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
        className
      )}
      {...props}
    >
      {dotColor && (
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {children}
      {count != null && (
        <span
          className={cn(
            "font-mono text-[0.72rem] tabular-nums",
            active ? "text-primary-foreground/80" : "text-muted-foreground/60"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
