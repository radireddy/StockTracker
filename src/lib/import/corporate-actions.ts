/**
 * Corporate-action normalization for FIFO.
 *
 * Trades are immutable; splits/bonuses are applied at compute time. A trade
 * dated BEFORE an action's ex_date is converted to current (post-action) units:
 * quantity is multiplied by the factor and price divided by it, so cost and
 * acquisition date are preserved and pre/post-action legs reconcile.
 *
 * ISIN/symbol changes are handled separately by the canonical_stock_id pointer
 * (see resolveCanonical); this module only handles quantity/price factors.
 */

export interface CorporateAction {
  stock_id: string; // canonical security the action applies to
  action_type: "split" | "bonus" | "merger";
  ex_date: string; // YYYY-MM-DD
  factor: number; // share multiplier (1:5 split = 5; 1:1 bonus = 2)
}

export interface CorporateActionContext {
  /** superseded stock_id -> canonical stock_id */
  canonicalMap: Map<string, string>;
  /** canonical stock_id -> its split/bonus actions */
  actionsBySecurity: Map<string, CorporateAction[]>;
}

/** Resolve a (possibly superseded) stock_id to its canonical id. */
export function resolveCanonical(
  stockId: string | null,
  canonicalMap: Map<string, string>
): string | null {
  if (stockId == null) return null;
  return canonicalMap.get(stockId) ?? stockId;
}

/**
 * Stable grouping key for a trade: the canonical stock_id when available,
 * otherwise the raw ISIN (legacy trades with no stock_id).
 */
export function securityKey(
  stockId: string | null,
  isin: string,
  canonicalMap: Map<string, string>
): string {
  return resolveCanonical(stockId, canonicalMap) ?? isin;
}

/**
 * Product of factors for actions whose ex_date is strictly AFTER the trade date.
 * `actions` must already be filtered to the trade's (canonical) security.
 */
export function cumulativeFactor(tradeDate: string, actions: CorporateAction[]): number {
  let factor = 1;
  for (const a of actions) {
    if (a.ex_date > tradeDate) factor *= a.factor;
  }
  return factor;
}

/** Normalize a pre-action trade's quantity/price to current units. */
export function adjustQtyPrice(
  qty: number,
  price: number,
  tradeDate: string,
  actions: CorporateAction[]
): { qty: number; price: number } {
  const f = cumulativeFactor(tradeDate, actions);
  if (f === 1) return { qty, price };
  return { qty: qty * f, price: price / f };
}
