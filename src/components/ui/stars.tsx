import { cn } from "@/lib/utils";

/**
 * Conviction rating as filled/empty stars in the amber theme colour, with a
 * text alternative for assistive tech. `n` filled of 4. Returns null for 0.
 */
export function Stars({
  rating,
  className,
}: {
  rating: number | null;
  className?: string;
}) {
  const n = rating ?? 0;
  if (n <= 0) return null;
  return (
    <span
      className={cn("text-amber tracking-[1px]", className)}
      aria-label={`${n} of 4 stars`}
    >
      <span aria-hidden="true">
        {"★".repeat(n)}
        <span className="text-muted-foreground/30">{"★".repeat(Math.max(0, 4 - n))}</span>
      </span>
    </span>
  );
}
