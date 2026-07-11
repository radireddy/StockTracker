import type { AllocationRanges } from "@/types/database";
import { getEffectiveRanges, getAllocationStatus } from "@/lib/utils/calculations";
import type { AllocationStatus } from "@/lib/utils/calculations";

export type CompanyForAllocation = {
  star_rating: number | null;
  quantity: number | null;
  indian_stocks: { price: number | null } | null;
};

export type StarGroup = {
  star: number;
  pct: number;
  groupMin: number;
  groupMax: number;
  status: AllocationStatus;
  count: number;
};

export function computeStarGroups(
  companies: CompanyForAllocation[],
  allocationRanges: AllocationRanges | null
): StarGroup[] | null {
  const ranges = getEffectiveRanges(allocationRanges);

  let totalValue = 0;
  const groupValues: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const c of companies) {
    const qty = c.quantity;
    const price = c.indian_stocks?.price;
    if (!qty || !price) continue;
    const value = qty * price;
    totalValue += value;
    const star = c.star_rating ?? 0;
    if (star >= 0 && star <= 4) groupValues[star] += value;
  }

  if (totalValue === 0) return null;

  return [4, 3, 2, 1, 0].map((star) => {
    const pct = (groupValues[star] / totalValue) * 100;
    const range = ranges[String(star)] ?? { min: 0, max: 2 };
    const count = companies.filter(
      (c) => (c.star_rating ?? 0) === star && c.quantity && c.quantity > 0
    ).length;
    const groupMin = range.min * count;
    const groupMax = range.max * count;
    const status = getAllocationStatus(pct, { min: groupMin, max: groupMax });
    return { star, pct, groupMin, groupMax, status, count };
  });
}

export function countUnrated(companies: CompanyForAllocation[]): number {
  return companies.filter(
    (c) => c.star_rating == null && c.quantity != null && c.quantity > 0
  ).length;
}
