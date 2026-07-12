export type CompanyForPnl = {
  quantity: number | null;
  avg_buy_price: number | null;
  indian_stocks: { price: number | null } | null;
};

export type PortfolioPnl = {
  totalCurrent: number;
  totalInvested: number;
  pnl: number;
  pnlPct: number;
  heldCount: number;
};

export function computePortfolioPnl(companies: CompanyForPnl[]): PortfolioPnl | null {
  let totalInvested = 0;
  let totalCurrent = 0;
  let pricedInvested = 0;
  let held = 0;

  for (const c of companies) {
    const qty = c.quantity;
    const avgBuy = c.avg_buy_price;
    if (!qty || !avgBuy) continue;
    totalInvested += qty * avgBuy;
    held += 1;
    const currentPrice = c.indian_stocks?.price ?? null;
    if (currentPrice != null) {
      totalCurrent += qty * currentPrice;
      pricedInvested += qty * avgBuy;
    }
  }

  if (totalInvested === 0) return null;

  // P&L is computed only over priced holdings so the comparison is apples-to-apples.
  const pnl = totalCurrent - pricedInvested;
  const pnlPct = pricedInvested > 0 ? (pnl / pricedInvested) * 100 : 0;

  return { totalCurrent, totalInvested, pnl, pnlPct, heldCount: held };
}
