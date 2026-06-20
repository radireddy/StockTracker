export function marginOfSafety(
  buyPrice: number,
  currentPrice: number
): number {
  if (buyPrice === 0) return 0;
  return (buyPrice - currentPrice) / buyPrice;
}

export function irr(
  targetMcap: number,
  buyingMcap: number,
  years: number
): number {
  if (buyingMcap === 0 || years === 0) return 0;
  return Math.pow(targetMcap / buyingMcap, 1 / years) - 1;
}

export function forwardPeg(currentPe: number, cagrPatGrowth: number): number {
  if (cagrPatGrowth === 0) return 0;
  return currentPe / (cagrPatGrowth * 100);
}

export function currentPe(marketCap: number, latestPat: number): number {
  if (latestPat === 0) return 0;
  return marketCap / latestPat;
}

export function cagrGrowth(
  futureValue: number,
  baseValue: number,
  years: number
): number {
  if (baseValue === 0 || years === 0) return 0;
  return Math.pow(futureValue / baseValue, 1 / years) - 1;
}

export function isBuySignal(
  currentPrice: number | null,
  buyPrice: number | null
): boolean {
  if (!currentPrice || !buyPrice) return false;
  return currentPrice <= buyPrice;
}
