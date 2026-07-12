export type Star = 1 | 2 | 3 | 4;

export type StarRange = { min: number; max: number };

export type StarInput = {
  star: Star;
  count: number;
  range: StarRange;
};

export type BucketResult = {
  star: Star;
  count: number;
  range: StarRange;
  perStockMin: number;
  perStockMax: number;
  bucketMin: number;
  bucketMax: number;
  isAbsolute: boolean;
  hasRangeError: boolean;
  // Set when the result is budget-constrained (min fits, max doesn't).
  // suggestedPct is the per-stock % within [range.min, range.max] that
  // exhausts the budget exactly. null for error buckets and unconstrained results.
  suggestedPct: number | null;
  suggestedAmount: number | null; // per stock, in rupees
};

export type CalculatorResult = {
  buckets: BucketResult[];
  totalAmount: number;
  totalDeployedMin: number;
  totalDeployedMax: number;
  cashBufferMin: number;
  cashBufferMax: number;
  // Hard error: even allocating at minimum percentages exceeds the total.
  isUnderCapitalized: boolean;
  // Budget fits between min and max: suggest a target within each range.
  isBudgetConstrained: boolean;
  isFullyDeployed: boolean;
};

export function calculate(totalAmount: number, inputs: StarInput[]): CalculatorResult {
  const active = inputs
    .filter((i) => i.count > 0)
    .sort((a, b) => b.star - a.star);

  const buckets: Omit<BucketResult, "suggestedPct" | "suggestedAmount">[] = active.map((input) => {
    const hasRangeError = input.range.min > input.range.max;
    const perStockMin = hasRangeError ? 0 : (input.range.min / 100) * totalAmount;
    const perStockMax = hasRangeError ? 0 : (input.range.max / 100) * totalAmount;
    return {
      star: input.star,
      count: input.count,
      range: input.range,
      perStockMin,
      perStockMax,
      bucketMin: input.count * perStockMin,
      bucketMax: input.count * perStockMax,
      isAbsolute: !hasRangeError && input.range.min === input.range.max,
      hasRangeError,
    };
  });

  const validBuckets = buckets.filter((b) => !b.hasRangeError);
  const totalDeployedMin = validBuckets.reduce((s, b) => s + b.bucketMin, 0);
  const totalDeployedMax = validBuckets.reduce((s, b) => s + b.bucketMax, 0);

  // Three distinct cases:
  //   isUnderCapitalized: sum(mins) > budget — hard error, no valid allocation exists
  //   isBudgetConstrained: sum(mins) ≤ budget ≤ sum(maxes) — suggest via t-interpolation
  //   else: sum(maxes) ≤ budget — cash buffer remains, show ranges normally
  const isUnderCapitalized = totalDeployedMin > totalAmount;
  const isBudgetConstrained = !isUnderCapitalized && totalDeployedMax > totalAmount;

  // t ∈ [0,1]: how far across the range we can go given the budget.
  // t=0 → all minimums, t=1 → all maximums. Each bucket scales proportionally.
  const t =
    isBudgetConstrained && totalDeployedMax > totalDeployedMin
      ? (totalAmount - totalDeployedMin) / (totalDeployedMax - totalDeployedMin)
      : null;

  const annotatedBuckets: BucketResult[] = buckets.map((b) => {
    if (t === null || b.hasRangeError) {
      return { ...b, suggestedPct: null, suggestedAmount: null };
    }
    const suggestedPct = b.range.min + t * (b.range.max - b.range.min);
    return {
      ...b,
      suggestedPct,
      suggestedAmount: (suggestedPct / 100) * totalAmount,
    };
  });

  const cashBufferMin = Math.max(0, totalAmount - totalDeployedMax);
  const cashBufferMax = Math.max(0, totalAmount - totalDeployedMin);
  const isFullyDeployed =
    cashBufferMin === 0 && cashBufferMax === 0 && !isUnderCapitalized && !isBudgetConstrained;

  return {
    buckets: annotatedBuckets,
    totalAmount,
    totalDeployedMin,
    totalDeployedMax,
    cashBufferMin,
    cashBufferMax,
    isUnderCapitalized,
    isBudgetConstrained,
    isFullyDeployed,
  };
}
