import type { OpenPosition } from "./tradebook-types";

export interface PositionSummary {
  invested: number;
  current: number;
  pnl: number;
  pnlPct: number;
  openCount: number;
}

function num(v: number): number {
  return typeof v === "number" ? v : Number(v);
}

/** Invested / current value from remaining (unsold) quantity only. */
export function summarizeOpenPositions(positions: OpenPosition[]): PositionSummary {
  const invested = positions.reduce(
    (sum, p) => sum + num(p.quantity) * num(p.avg_buy_price),
    0
  );
  const current = positions.reduce((sum, p) => {
    const price = p.current_price != null ? num(p.current_price) : num(p.avg_buy_price);
    return sum + num(p.quantity) * price;
  }, 0);
  const pnl = current - invested;
  return {
    invested,
    current,
    pnl,
    pnlPct: invested > 0 ? (pnl / invested) * 100 : 0,
    openCount: positions.length,
  };
}
