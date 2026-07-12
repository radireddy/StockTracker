"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dashed-border empty-state block: an icon in a soft brand circle, a title, a
 * supporting line and an actions row. Reused for the holdings/watchlist empty
 * states today and any future "nothing here yet" surface.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Action buttons/links, stacked below the copy. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-border bg-muted/25 px-6 py-10 text-center",
        className
      )}
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-accent text-accent-foreground shadow-soft">
        <Icon size={24} aria-hidden="true" />
      </div>
      <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {children && (
        <div className="mx-auto mt-5 flex max-w-xs flex-col items-stretch gap-2.5">
          {children}
        </div>
      )}
    </div>
  );
}
