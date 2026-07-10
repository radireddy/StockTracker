/**
 * Combine an existing holding lot with an additional purchase in the same
 * account. Quantities add up and the average buy price becomes the
 * cost-weighted average of both lots — mirroring how a broker aggregates
 * multiple buys of the same stock into a single position.
 */
export function combineHoldingLots(
  existing: { quantity: number; avg_buy_price: number },
  added: { quantity: number; avg_buy_price: number }
): { quantity: number; avg_buy_price: number } {
  const quantity = existing.quantity + added.quantity;
  if (quantity <= 0) {
    return { quantity, avg_buy_price: added.avg_buy_price };
  }
  const cost =
    existing.quantity * existing.avg_buy_price + added.quantity * added.avg_buy_price;
  return { quantity, avg_buy_price: cost / quantity };
}

export interface HoldingsSummary {
  totalQty: number;
  totalCost: number;
  weightedAvg: number;
  totalCurrentValue: number | null;
  totalPnl: number | null;
  totalPnlPct: number | null;
}

/**
 * Aggregate a set of holding lots into the position summary shown on the
 * company Holdings tab. `currentPrice` is null when the stock has no live
 * quote, in which case all P&L fields are null.
 *
 * Note the asymmetry between `totalPnl` and `totalPnlPct`: when the cost basis
 * is zero (e.g. lots imported/created with a 0 average price) but a live price
 * exists, `totalPnl` is a real number while `totalPnlPct` is null — there is no
 * cost to express the gain as a percentage of. Callers must handle a null
 * `totalPnlPct` even when `totalPnl` is non-null.
 */
export function summarizeHoldings(
  holdings: { quantity: number; avg_buy_price: number }[],
  currentPrice: number | null
): HoldingsSummary {
  const totalQty = holdings.reduce((s, h) => s + h.quantity, 0);
  const totalCost = holdings.reduce((s, h) => s + h.quantity * h.avg_buy_price, 0);
  const weightedAvg = totalQty > 0 ? totalCost / totalQty : 0;
  const totalCurrentValue = currentPrice != null ? totalQty * currentPrice : null;
  const totalPnl = totalCurrentValue != null ? totalCurrentValue - totalCost : null;
  const totalPnlPct = totalCost > 0 && totalPnl != null ? (totalPnl / totalCost) * 100 : null;
  return { totalQty, totalCost, weightedAvg, totalCurrentValue, totalPnl, totalPnlPct };
}

/**
 * Whether moving a company into `targetType` from `currentType` must prompt for
 * an account. Only the watchlist -> holdings move needs one: there is no
 * position to carry, so an account is required to create the initial holdings
 * row. Holdings -> holdings carries existing positions (with their own
 * accounts), and watchlist targets hold no positions at all.
 */
export function requiresAccountForMove(
  currentType: "holdings" | "watchlist",
  targetType: "holdings" | "watchlist"
): boolean {
  return currentType === "watchlist" && targetType === "holdings";
}
