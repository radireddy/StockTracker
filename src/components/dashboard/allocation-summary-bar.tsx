"use client";

import { useMemo } from "react";
import type { AllocationRanges } from "@/types/database";
import { getEffectiveRanges, getAllocationStatus } from "@/lib/utils/calculations";
import { Stars } from "@/components/ui/stars";
import { StatusTag, STATUS_VAR, STATUS_LABEL } from "@/components/dashboard/status-tag";

type CompanyWithStock = {
  star_rating: number | null;
  quantity: number | null;
  avg_buy_price: number | null;
  indian_stocks: { price: number | null } | null;
};

/**
 * Allocation health card: one bar per conviction level (4★→1★) showing current
 * weight against its target band, tagged Under / In Range / Over. Aggregation
 * is by current market value.
 */
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
      if (star >= 1 && star <= 4) groupValues[star] += value;
    }

    if (totalValue === 0) return null;

    return [4, 3, 2, 1].map((star) => {
      const pct = (groupValues[star] / totalValue) * 100;
      const range = ranges[String(star)] ?? { min: 0, max: 2 };
      const count = companies.filter(
        (c) => (c.star_rating ?? 1) === star && c.quantity && c.quantity > 0
      ).length;
      const groupMin = range.min * count;
      const groupMax = range.max * count;
      const status = getAllocationStatus(pct, { min: groupMin, max: groupMax });
      return { star, pct, groupMin, groupMax, status, count };
    });
  }, [companies, ranges]);

  if (!starGroups) return null;

  const unratedCount = companies.filter(
    (c) => c.star_rating == null && c.quantity != null && c.quantity > 0
  ).length;

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border bg-card p-6 shadow-soft">
      <h3 className="flex items-baseline justify-between text-sm font-semibold">
        Allocation health
        <span className="text-xs font-normal text-muted-foreground">
          current value vs. target by conviction
        </span>
      </h3>

      {starGroups.map(({ star, pct, groupMin, groupMax, status, count }) => {
        if (count === 0) return null;
        const scale = Math.max(groupMax * 1.05, pct * 1.05) || 1;
        const fillW = Math.min(100, (pct / scale) * 100);
        const bandLeft = (groupMin / scale) * 100;
        const bandRight = 100 - (groupMax / scale) * 100;
        return (
          <div
            key={star}
            className="flex items-center gap-3"
            aria-label={`${star} star: ${pct.toFixed(1)}% of portfolio, target ${groupMin.toFixed(0)}–${groupMax.toFixed(0)}%, ${STATUS_LABEL[status]}`}
          >
            <Stars rating={star} className="w-[62px] shrink-0 text-[0.76rem]" />
            <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-md"
                style={{
                  width: `${fillW}%`,
                  background: `color-mix(in oklch, ${STATUS_VAR[status]} 55%, var(--card))`,
                }}
              />
              <div
                className="absolute -inset-y-px border-x-[1.5px] border-dashed border-foreground/40"
                style={{ left: `${bandLeft}%`, right: `${bandRight}%` }}
              />
            </div>
            <span
              className="flex w-[118px] shrink-0 items-center justify-end gap-1.5 text-[0.78rem]"
              aria-hidden="true"
            >
              <b className="font-mono tabular-nums">{pct.toFixed(1)}%</b>
              <StatusTag status={status} />
            </span>
          </div>
        );
      })}
      {unratedCount > 0 && (
        <p className="text-[0.72rem] text-muted-foreground">
          {unratedCount} {unratedCount === 1 ? "company is" : "companies are"} not yet rated — they&rsquo;re assumed 1★ until you rate them.
        </p>
      )}
    </div>
  );
}
