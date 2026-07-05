import { cn } from "@/lib/utils";

/**
 * Gradient page header shared across authenticated pages. Mirrors the
 * dashboard header pattern: `.page-header-glow` wrapper + primary eyebrow +
 * bold title, with an optional right-aligned action slot.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("page-header-glow", className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 text-2xl font-bold tracking-tight lg:text-[2rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
