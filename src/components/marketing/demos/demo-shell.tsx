"use client";

import { useInView } from "@/hooks/use-in-view";

/**
 * Shared frame for the marketing faux-UI demos: a browser-chrome-styled card
 * that reveals its children with a soft rise once scrolled into view. All
 * demos share this so they read as one coherent product surface.
 */
export function DemoShell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={[
        "overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-black/[0.03] transition-all duration-700 ease-out motion-reduce:transition-none",
        inView ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-chart-4/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
        <span className="ml-2 truncate text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

/** ₹ formatter — compact for large amounts (L / Cr), plain otherwise. */
export function inr(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
