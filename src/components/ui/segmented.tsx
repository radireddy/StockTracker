"use client";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
};

/**
 * A compact segmented control (iOS-style pill toggle). Used across the
 * dashboard for Portfolios/Watchlists, Portfolio/Allocation and
 * Invested/Current switches — one styling definition, many consumers.
 *
 * Buttons expose `aria-pressed`; the whole group is labelled for assistive
 * tech. Colour is never the only signal — the active segment also lifts with
 * the card background + soft shadow.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  size = "default",
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "default";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex rounded-[10px] bg-muted dark:bg-background p-[3px]",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-[0.83rem]",
              active
                ? "bg-card text-foreground shadow-soft dark:bg-muted dark:shadow-none"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
