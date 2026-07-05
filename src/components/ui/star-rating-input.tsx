"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const CONVICTION_LABELS = ["Not rated", "Low conviction", "Moderate", "Strong", "High conviction"];

/**
 * Click- and keyboard-driven conviction picker: 1–4 amber stars with a
 * hover/focus preview and a plain-language descriptor. Shared by the company
 * Details editor and the Add Company form so both read identically.
 *
 * Controlled: pass the current `value` (1–4, or 0 for unrated) and an
 * `onChange`. Exposes a `radiogroup` for assistive tech.
 */
export function StarRatingInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const [preview, setPreview] = useState(0);
  const shown = preview || value;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="radiogroup"
        aria-label="Star rating"
        className="flex items-center gap-0.5"
        onMouseLeave={() => setPreview(0)}
      >
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setPreview(n)}
            onFocus={() => setPreview(n)}
            onBlur={() => setPreview(0)}
            onClick={() => onChange(n)}
            className={cn(
              "rounded-md px-0.5 text-[1.65rem] leading-none transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              n <= shown
                ? "text-amber drop-shadow-[0_1px_1px_rgba(0,0,0,0.06)]"
                : "text-muted-foreground/25 hover:text-amber/40"
            )}
          >
            ★
          </button>
        ))}
      </div>
      <span className="text-xs font-medium text-muted-foreground tabular-nums">
        {CONVICTION_LABELS[shown]}
      </span>
    </div>
  );
}
