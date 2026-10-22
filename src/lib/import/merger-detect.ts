// ─────────────────────────────────────────────────────────────────────────────
// INDEPENDENCE NOTICE
// This module derives all position data from tradebook trades only.
// The broker-statement holdings import (holdings table) is a completely separate
// feature. Never import, query, or reference the holdings table here, and never
// let holdings data influence merger detection. These two features are
// independent — a user may use one, both, or neither.
// ─────────────────────────────────────────────────────────────────────────────

import { adjustQtyPrice, securityKey, type CorporateActionContext } from "./corporate-actions";
import type { SecurityTrades } from "./corporate-action-detect";
import type { OrphanPairSuggestion } from "./tradebook-types";
import type { RefAction } from "./corporate-actions-data";

// Convention used throughout this file (and all callers):
//   fromSymbol / fromStockId  =  ABSORBED company  (was merged away; user bought it)
//   toSymbol   / toStockId    =  SURVIVING company  (received shares after merger)

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** True when toQty/fromQty has a reduced-fraction denominator ≤ 500. */
function isCleanRatio(fromQty: number, toQty: number): boolean {
  const a = Math.round(fromQty);
  const b = Math.round(toQty);
  if (a <= 0 || b <= 0) return false;
  const g = gcd(a, b);
  return a / g <= 500;
}

function netQty(sec: SecurityTrades, ca: CorporateActionContext): { netOpen: number; totalBuys: number; totalSells: number } {
  const key = securityKey(sec.stock_id, sec.isin, ca.canonicalMap);
  const actions = ca.actionsBySecurity.get(key) ?? [];
  let buys = 0;
  let sells = 0;
  for (const t of sec.trades) {
    const { qty } = adjustQtyPrice(Number(t.quantity), Number(t.price), t.trade_date, actions);
    if (t.trade_type === "buy") buys += qty;
    else sells += qty;
  }
  return { netOpen: Math.max(0, buys - sells), totalBuys: buys, totalSells: sells };
}

/**
 * Detect merger pairs from tradebook data, using the NSE/BSE reference feed
 * as the primary gate so only confirmed merger targets are considered.
 *
 * Two detection paths:
 *
 * PATH 1 — Feed knows the surviving company (acquirer_symbol set):
 *   Directly matches the absorbed company against the named acquirer in the
 *   user's securities. Does NOT require the surviving company to have sells.
 *   Covers: still holding B, partial sell of B, bought more B after merger.
 *
 * PATH 2 — Acquirer unknown (acquirer_symbol null):
 *   Falls back to ratio heuristic: pairs absorbed company against sell-only
 *   securities in the same account. All sales of B are assumed merger proceeds.
 *
 * Never auto-applied — results are confirmed by matchOrphanPairsWithFeed or
 * surfaced as manual suggestions.
 */
export function detectOrphanPairs(
  securities: SecurityTrades[],
  ca: CorporateActionContext,
  refBySymbol: Map<string, RefAction[]>
): OrphanPairSuggestion[] {
  // Build a map: absorbed symbol → latest merger ref entry.
  // Only securities confirmed as merger targets by the feed are candidates.
  const latestMergerRef = new Map<string, RefAction>();
  for (const [symbol, actions] of refBySymbol) {
    const mergers = actions.filter((a) => a.action_type === "merger");
    if (mergers.length > 0) latestMergerRef.set(symbol, mergers[mergers.length - 1]);
  }

  // Absorbed candidates: feed-confirmed + trade-derived open position > 0.
  // Not restricted to buy-only — partial sells before the merger date are fine;
  // what matters is that the remaining position was not sold away (netOpen > 0).
  const absorbed = securities.filter(
    (s) => s.stock_id != null && s.trades.length > 0 && latestMergerRef.has(s.symbol)
  );

  // Surviving candidates for Path 2: any security where total sells exceed total
  // buys (unexplained oversell). "Sell-only" (zero buys) is the clearest signal,
  // but a security with independent buys AND more sells than buys also qualifies —
  // the excess sells may represent merger-received shares sold after the exchange
  // (e.g. GRUH → BANDHANBNK where the user also held BANDHANBNK independently).
  const oversold = securities.filter((s) => {
    if (!s.trades.length) return false;
    const { totalBuys, totalSells } = netQty(s, ca);
    return totalSells > totalBuys;
  });

  // Keyed by symbol for Path 1 direct lookup.
  const secBySymbol = new Map(securities.map((s) => [s.symbol, s]));

  const suggestions: OrphanPairSuggestion[] = [];

  for (const from of absorbed) {
    const { netOpen } = netQty(from, ca);
    // Skip if position fully reconciles — no unexplained shares remaining.
    if (netOpen <= 0) continue;

    const ref = latestMergerRef.get(from.symbol)!;

    if (ref.acquirer_symbol) {
      // ── Path 1: Feed names the surviving company ────────────────────────────
      // Match directly without needing sell-only trades for the surviving company.
      const toSec = secBySymbol.get(ref.acquirer_symbol);
      if (!toSec) {
        // Surviving company has zero tradebook entries — cannot derive stock_id
        // from trade data alone. User should use the Record Merger dialog.
        continue;
      }

      const { netOpen: toNetOpen, totalBuys: toTotalBuys, totalSells: toTotalSells } = netQty(toSec, ca);
      // Unexplained sells: sells beyond what the company's own buys account for.
      // For sell-only companies this equals toTotalSells; for oversold-but-mixed
      // companies (e.g. independent buys AND merger-received sells) it's the excess.
      const toUnexplainedSells = toTotalSells > toTotalBuys ? Math.round(toTotalSells - toTotalBuys) : 0;

      let impliedRatio: number;
      let toQty: number;

      if (ref.factor != null) {
        // Feed provides the authoritative swap ratio.
        impliedRatio = ref.factor;
        toQty = Math.round(netOpen * ref.factor);
      } else if (toUnexplainedSells > 0) {
        // Oversold (covers both sell-only and mixed with independent buys):
        // unexplained sells are merger proceeds → reliable denominator.
        impliedRatio = toUnexplainedSells / netOpen;
        toQty = toUnexplainedSells;
      } else if (toNetOpen > 0) {
        // Still holding (all or partially): use trade-derived open as estimate.
        // May overcount if user bought more B after the merger at market price.
        impliedRatio = toNetOpen / netOpen;
        toQty = Math.round(toNetOpen);
      } else {
        // Cannot determine ratio — use 1:1 placeholder; user corrects in dialog.
        impliedRatio = 1;
        toQty = Math.round(netOpen);
      }

      suggestions.push({
        fromSymbol: from.symbol,
        fromStockId: from.stock_id as string,
        toSymbol: ref.acquirer_symbol,
        toStockId: toSec.stock_id,
        impliedRatio,
        fromQty: Math.round(netOpen),
        toQty,
      });
      continue; // Do not fall through to Path 2 for this absorbed security.
    }

    // ── Path 2: Acquirer unknown → ratio heuristic ─────────────────────────
    // Pair absorbed company against oversold securities in the same account.
    // The "unexplained sells" are the portion above what the surviving company's
    // own buys can account for — these must have come from the merger exchange.
    for (const to of oversold) {
      if (to.symbol === from.symbol) continue;
      if (from.account_id !== to.account_id) continue;
      const { totalBuys: toTotalBuys, totalSells: toTotalSells } = netQty(to, ca);
      const unexplainedSells = Math.round(toTotalSells - toTotalBuys);
      if (unexplainedSells < 10) continue;
      const impliedRatio = unexplainedSells / netOpen;
      if (impliedRatio < 0.1 || impliedRatio > 20) continue;
      if (!isCleanRatio(netOpen, unexplainedSells)) continue;

      suggestions.push({
        fromSymbol: from.symbol,
        fromStockId: from.stock_id as string,
        toSymbol: to.symbol,
        toStockId: to.stock_id,
        impliedRatio,
        fromQty: Math.round(netOpen),
        toQty: unexplainedSells,
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
 * pair.fromSymbol = absorbed company  (what the feed records the merger under)
 * pair.toSymbol   = surviving company (what the feed's acquirer_symbol names)
 *
 * A pair is confirmed (auto-applied) when:
 *   - The feed has a merger record for the absorbed company (pair.fromSymbol)
 *   - The feed's acquirer_symbol is null (no acquirer named → accept any pairing)
 *     OR matches the surviving company (pair.toSymbol)
 *   - Both stockIds are non-null (required to write the canonical pointer)
 *
 * A pair is left unconfirmed (surfaced as a manual suggestion) when:
 *   - No feed record exists for the absorbed company.
 *   - The feed names a different acquirer than pair.toSymbol.
 *   - Either stockId is null.
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

    // The feed records the merger event on the absorbed company's symbol.
    const feedForAbsorbed = (refBySymbol.get(pair.fromSymbol) ?? []).filter(
      (r) => r.action_type === "merger"
    );

    if (feedForAbsorbed.length === 0) {
      unconfirmed.push(pair);
      continue;
    }

    const mergerRef = feedForAbsorbed[feedForAbsorbed.length - 1];

    // If the feed names a specific acquirer it must match the surviving company.
    if (mergerRef.acquirer_symbol !== null && mergerRef.acquirer_symbol !== pair.toSymbol) {
      unconfirmed.push(pair);
      continue;
    }

    confirmed.push({ ...pair, ex_date: mergerRef.ex_date });
  }

  return { confirmed, unconfirmed };
}
