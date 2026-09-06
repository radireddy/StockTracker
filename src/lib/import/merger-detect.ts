import { adjustQtyPrice, securityKey, type CorporateActionContext } from "./corporate-actions";
import type { SecurityTrades } from "./corporate-action-detect";
import type { OrphanPairSuggestion } from "./tradebook-types";
import type { RefAction } from "./corporate-actions-data";

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** True when toQty/fromQty is a "clean" fraction (denominator ≤ 500 in lowest terms). */
function isCleanRatio(fromQty: number, toQty: number): boolean {
  const a = Math.round(fromQty);
  const b = Math.round(toQty);
  if (a <= 0 || b <= 0) return false;
  const g = gcd(a, b);
  return a / g <= 500;
}

function netQty(sec: SecurityTrades, ca: CorporateActionContext): { netOpen: number; totalSells: number } {
  const key = securityKey(sec.stock_id, sec.isin, ca.canonicalMap);
  const actions = ca.actionsBySecurity.get(key) ?? [];
  let buys = 0;
  let sells = 0;
  for (const t of sec.trades) {
    const { qty } = adjustQtyPrice(Number(t.quantity), Number(t.price), t.trade_date, actions);
    if (t.trade_type === "buy") buys += qty;
    else sells += qty;
  }
  return { netOpen: Math.max(0, buys - sells), totalSells: sells };
}

/**
 * Detect likely merger pairs in a set of securities.
 *
 * A pair (A, B) is a merger candidate when:
 *   - Same account
 *   - A has only buys, net open > 0, non-null stock_id
 *   - B has only sells, no buys
 *   - toQty / fromNetOpen has a "clean" rational denominator (≤ 500)
 *
 * Never auto-applied — always surfaced as a suggestion for user confirmation.
 */
export function detectOrphanPairs(
  securities: SecurityTrades[],
  ca: CorporateActionContext
): OrphanPairSuggestion[] {
  // Partition into buy-only and sell-only groups, keyed by account.
  const buyOnly = securities.filter(
    (s) =>
      s.stock_id != null &&
      s.trades.length > 0 &&
      s.trades.every((t) => t.trade_type === "buy")
  );
  const sellOnly = securities.filter(
    (s) =>
      s.trades.length > 0 &&
      s.trades.every((t) => t.trade_type === "sell")
  );

  const suggestions: OrphanPairSuggestion[] = [];

  for (const from of buyOnly) {
    const { netOpen } = netQty(from, ca);
    if (netOpen <= 0) continue;

    for (const to of sellOnly) {
      // Must be the same account (mergers happen account-by-account at the broker).
      if (from.account_id !== to.account_id) continue;

      const { totalSells } = netQty(to, ca);
      if (totalSells <= 0) continue;
      if (!isCleanRatio(netOpen, totalSells)) continue;

      suggestions.push({
        fromSymbol: from.symbol,
        fromStockId: from.stock_id as string,
        toSymbol: to.symbol,
        toStockId: to.stock_id,
        impliedRatio: totalSells / netOpen,
        fromQty: Math.round(netOpen),
        toQty: Math.round(totalSells),
      });
    }
  }

  return suggestions;
}

export interface ConfirmedMerger extends OrphanPairSuggestion {
  ex_date: string;
}

/**
 * Cross-reference orphan pairs with the NSE/BSE merger reference feed.
 *
 * In an orphan pair, pair.toSymbol is the sell-only (absorbed) company and
 * pair.fromSymbol is the buy-only (surviving) company. The feed records the
 * merger event on the absorbed symbol. When the feed confirms the event AND
 * does not name a different acquirer, the pair is promoted to auto-apply.
 *
 * A pair is left unconfirmed when:
 *   - No merger ref exists for the absorbed symbol.
 *   - The ref's acquirer_symbol is non-null and differs from pair.fromSymbol.
 *   - Either stockId is null (can't write the canonical pointer).
 */
export function matchOrphanPairsWithFeed(
  pairs: OrphanPairSuggestion[],
  refBySymbol: Map<string, RefAction[]>
): { confirmed: ConfirmedMerger[]; unconfirmed: OrphanPairSuggestion[] } {
  const confirmed: ConfirmedMerger[] = [];
  const unconfirmed: OrphanPairSuggestion[] = [];

  for (const pair of pairs) {
    if (!pair.fromStockId || !pair.toStockId) {
      unconfirmed.push(pair);
      continue;
    }

    // pair.toSymbol = sell-only = absorbed company = what the feed records on.
    const feedForAbsorbed = (refBySymbol.get(pair.toSymbol) ?? []).filter(
      (r) => r.action_type === "merger"
    );

    if (feedForAbsorbed.length === 0) {
      unconfirmed.push(pair);
      continue;
    }

    // Use the latest merger ref entry (most relevant if multiple exist).
    const mergerRef = feedForAbsorbed[feedForAbsorbed.length - 1];

    // If feed names a specific acquirer, it must match the buy-only (surviving) symbol.
    if (mergerRef.acquirer_symbol !== null && mergerRef.acquirer_symbol !== pair.fromSymbol) {
      unconfirmed.push(pair);
      continue;
    }

    confirmed.push({ ...pair, ex_date: mergerRef.ex_date });
  }

  return { confirmed, unconfirmed };
}
