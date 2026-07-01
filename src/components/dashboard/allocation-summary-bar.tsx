"use client";

import { useMemo } from "react";
import type { AllocationRanges } from "@/types/database";
import { getEffectiveRanges, getAllocationStatus } from "@/lib/utils/calculations";

type CompanyWithStock = {
  star_rating: number | null;
  quantity: number | null;
  avg_buy_price: number | null;
  indian_stocks: { price: number | null } | null;
};

export function AllocationSummaryBar({
  companies,
  allocationRanges,
}: {
  companies: CompanyWithStock[];
  allocationRanges: AllocationRanges | null;
}) {
  const ranges = getEffectiveRanges(allocationRanges);

  const starGroups = useMemo(() => {
    let totalValue = 0;
    const groupValues: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

    for (const c of companies) {
      const qty = c.quantity;
      const price = c.indian_stocks?.price;
      if (!qty || !price) continue;
      const value = qty * price;
      totalValue += value;
      const star = c.star_rating ?? 1;
      if (star >= 1 && star <= 4) {
        groupValues[star] += value;
      }
    }

    if (totalValue === 0) return null;

    return [4, 3, 2, 1].map((star) => {
      const pct = (groupValues[star] / totalValue) * 100;
      const range = ranges[String(star)] ?? { min: 0, max: 2 };
      const count = companies.filter((c) => (c.star_rating ?? 1) === star && c.quantity && c.quantity > 0).length;
      // Target range is per-stock, so multiply by count for group-level
      const groupMin = range.min * count;
      const groupMax = range.max * count;
      const status = getAllocationStatus(pct, { min: groupMin, max: groupMax });

      return { star, pct, groupMin, groupMax, status, count };
    });
  }, [companies, ranges]);

  if (!starGroups) return null;

  const statusColors = {
    under: "text-rose-500",
    in_range: "text-green-600",
    over: "text-red-600",
  };

  const statusBg = {
    under: "bg-rose-50 dark:bg-rose-950/30",
    in_range: "bg-green-50 dark:bg-green-950/30",
    over: "bg-red-50 dark:bg-red-950/30",
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-2 text-sm">
      <span className="text-xs font-medium text-muted-foreground mr-1">Allocation (Current Value)</span>
      {starGroups.map(({ star, pct, groupMin, groupMax, status, count }) => {
        if (count === 0) return null;
        return (
          <div
            key={star}
            className={`flex items-center gap-1.5 rounded px-2 py-0.5 ${statusBg[status]}`}
          >
            <span className="text-yellow-500 text-xs">{"★".repeat(star)}</span>
            <span className={`font-semibold tabular-nums ${statusColors[status]}`}>
              {pct.toFixed(1)}%
            </span>
            <span className="text-muted-foreground text-xs">
              ({groupMin.toFixed(0)}-{groupMax.toFixed(0)}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}
