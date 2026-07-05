import { cn } from "@/lib/utils";
import type { AllocationStatus } from "@/lib/utils/calculations";

/** Human labels for each allocation status. */
export const STATUS_LABEL: Record<AllocationStatus, string> = {
  under: "Under",
  in_range: "In Range",
  over: "Over",
};

/** CSS variable per status — for bar fills / stripes built with inline styles. */
export const STATUS_VAR: Record<AllocationStatus, string> = {
  under: "var(--warning)",
  in_range: "var(--positive)",
  over: "var(--destructive)",
};

/** Text-colour utility per status (token-backed, theme-aware). */
export const STATUS_TEXT: Record<AllocationStatus, string> = {
  under: "text-warning",
  in_range: "text-positive",
  over: "text-destructive",
};

/** Left conviction/status stripe colour per status. */
export const STATUS_STRIPE: Record<AllocationStatus, string> = {
  under: "border-l-warning",
  in_range: "border-l-positive",
  over: "border-l-destructive",
};

/** Soft row tint per status (allocation table member rows). */
export const STATUS_ROW_BG: Record<AllocationStatus, string> = {
  under: "bg-warning/[0.07]",
  in_range: "bg-positive/[0.07]",
  over: "bg-destructive/[0.07]",
};

/** A compact uppercase status tag (Under / In Range / Over). */
export function StatusTag({
  status,
  className,
}: {
  status: AllocationStatus;
  className?: string;
}) {
  const cls: Record<AllocationStatus, string> = {
    under: "text-warning bg-warning/[0.16]",
    in_range: "text-positive bg-positive/[0.14]",
    over: "text-destructive bg-destructive/[0.12]",
  };
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[0.64rem] font-bold uppercase tracking-wide",
        cls[status],
        className
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
