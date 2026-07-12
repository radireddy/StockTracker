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
  let held = 0;

  for (const c of companies) {
    const qty = c.quantity;
    const avgBuy = c.avg_buy_price;
    if (!qty || !avgBuy) continue;
    const currentPrice = c.indian_stocks?.price ?? null;
    if (currentPrice == null) continue;
    totalInvested += qty * avgBuy;
    totalCurrent += qty * currentPrice;
    held += 1;
  }

  if (totalInvested === 0) return null;

  const pnl = totalCurrent - totalInvested;
  const pnlPct = (pnl / totalInvested) * 100;

  return { totalCurrent, totalInvested, pnl, pnlPct, heldCount: held };
}
