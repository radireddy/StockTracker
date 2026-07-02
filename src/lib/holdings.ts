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
