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
};

export type CalculatorResult = {
  buckets: BucketResult[];
  totalAmount: number;
  totalDeployedMin: number;
  totalDeployedMax: number;
  cashBufferMin: number;
  cashBufferMax: number;
  isOverAllocated: boolean;
  isFullyDeployed: boolean;
};

export function calculate(totalAmount: number, inputs: StarInput[]): CalculatorResult {
  const active = inputs
    .filter((i) => i.count > 0)
    .sort((a, b) => b.star - a.star);

  const buckets: BucketResult[] = active.map((input) => {
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
  const isOverAllocated = totalDeployedMax > totalAmount;
  const cashBufferMin = Math.max(0, totalAmount - totalDeployedMax);
  const cashBufferMax = Math.max(0, totalAmount - totalDeployedMin);

  return {
    buckets,
    totalAmount,
    totalDeployedMin,
    totalDeployedMax,
    cashBufferMin,
    cashBufferMax,
    isOverAllocated,
    isFullyDeployed: cashBufferMin === 0 && cashBufferMax === 0 && !isOverAllocated,
  };
}
