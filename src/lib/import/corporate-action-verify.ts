import {
  securityKey,
  adjustQtyPrice,
  type CorporateAction,
  type CorporateActionContext,
} from "./corporate-actions";
import type { CorporateActionCandidate, SecurityTrades } from "./corporate-action-detect";
import type { RefAction } from "./corporate-actions-data";

export interface FeedVerification {
  status: "verified" | "inferred" | "unexplained";
  /** Feed actions to persist & apply — only populated when status is "verified". */
  actions: CorporateAction[];
}

const num = (v: number) => (typeof v === "number" ? v : Number(v));

/**
 * Feed-first verification. A detected mismatch only *flags* the security; the
 * authoritative factor and ex_date come from the NSE/BSE reference feed. We apply
 * the feed's in-window split/bonus to the security's individual trades (reusing
 * adjustQtyPrice) and check whether the observed mismatch reconciles:
 *
 *   - oversold (Signal A): adjusted buys must be ≥ sells;
 *   - holdings  (Signal B): adjusted FIFO-open must equal the broker holdings.
 *
 * If it reconciles the action is certain → "verified" (auto-apply). Otherwise we
 * fall back to the detector's own inferred/unexplained status (manual review).
 *
 * Being trade-aware is what makes this robust when trades straddle a split, where
 * the aggregate sell/buy ratio does NOT equal the true factor — e.g. PGEL (×10)
 * or HDFCBANK (×2). The old ratio-guess approach discarded those.
 */
export function reconcileWithFeed(
  candidate: CorporateActionCandidate,
  sec: SecurityTrades,
  feedActions: RefAction[],
  ca: CorporateActionContext
): FeedVerification {
  const fallback: FeedVerification = { status: candidate.status, actions: [] };

  // Need a canonical security to persist against, and trades + feed to reconcile.
  if (sec.stock_id == null || sec.trades.length === 0 || feedActions.length === 0) {
    return fallback;
  }

  const key = securityKey(sec.stock_id, sec.isin, ca.canonicalMap);

  // Raw (unadjusted) totals classify the mismatch: oversold (sold more than
  // bought) vs a still-held holdings gap.
  let rawBuys = 0;
  let rawSells = 0;
  let earliest = sec.trades[0].trade_date;
  let latest = sec.trades[0].trade_date;
  for (const t of sec.trades) {
    if (t.trade_type === "buy") rawBuys += num(t.quantity);
    else rawSells += num(t.quantity);
    if (t.trade_date < earliest) earliest = t.trade_date;
    if (t.trade_date > latest) latest = t.trade_date;
  }
  const isOversold = rawSells > rawBuys + 1e-6;

  // An action must post-date some trade to adjust anything (ex_date > earliest).
  // For an OVERSOLD security we also require ex_date <= the last trade: an action
  // dated after your final sell cannot explain having oversold earlier, so it
  // must not be stacked in (e.g. a bonus announced after you exited). A pure
  // holdings gap has no upper bound — you may have bought once and held through
  // a split that happened after your last trade. Already-applied actions are
  // excluded so a proactive apply pass isn't double-counted.
  const alreadyApplied = new Set(
    (ca.actionsBySecurity.get(key) ?? []).map((a) => `${a.action_type}|${a.ex_date}`)
  );
  const relevant = feedActions.filter(
    (a) =>
      a.ex_date > earliest &&
      (!isOversold || a.ex_date <= latest) &&
      !alreadyApplied.has(`${a.action_type}|${a.ex_date}`)
  );
  if (relevant.length === 0) return fallback;

  const newActions: CorporateAction[] = relevant.map((a) => ({
    stock_id: sec.stock_id as string,
    action_type: a.action_type,
    ex_date: a.ex_date,
    factor: num(a.factor),
  }));
  const trial = [...(ca.actionsBySecurity.get(key) ?? []), ...newActions];

  let buys = 0;
  let sells = 0;
  for (const t of sec.trades) {
    const { qty } = adjustQtyPrice(num(t.quantity), num(t.price), t.trade_date, trial);
    if (t.trade_type === "buy") buys += qty;
    else sells += qty;
  }
  const fifoOpen = Math.max(0, buys - sells);

  const oversoldOk = sells <= buys + Math.max(1, buys * 0.01);
  const holdingsOk =
    sec.holdingsQty == null || sec.holdingsQty <= 0
      ? true
      : Math.abs(fifoOpen - sec.holdingsQty) <= Math.max(1, sec.holdingsQty * 0.01);

  if (oversoldOk && holdingsOk) return { status: "verified", actions: newActions };
  return fallback;
}

/**
 * Feed-confirmed corporate actions to apply for a held security, independent of
 * any detected mismatch. An NSE/BSE split/bonus is an authoritative fact: if its
 * ex_date falls while the account still held a net-positive position (and on or
 * before today), it must be applied — otherwise a plain buy-and-hold through a
 * split shows stale pre-split quantity and cost (e.g. TDPOWERSYS).
 *
 * Excludes:
 *  - actions already applied (present in the CA context);
 *  - actions dated after the position was fully exited — you don't receive a
 *    split/bonus on shares you'd already sold. Splits/bonuses never change the
 *    SIGN of net holdings, so a raw net (buys − sells before ex_date) suffices to
 *    decide "were they still holding?".
 */
export function feedActionsToApply(
  sec: SecurityTrades,
  feedActions: RefAction[],
  ca: CorporateActionContext,
  today: string
): CorporateAction[] {
  if (sec.stock_id == null || sec.trades.length === 0) return [];
  const key = securityKey(sec.stock_id, sec.isin, ca.canonicalMap);
  const applied = new Set(
    (ca.actionsBySecurity.get(key) ?? []).map((a) => `${a.action_type}|${a.ex_date}`)
  );

  const out: CorporateAction[] = [];
  for (const a of feedActions) {
    if (a.ex_date > today) continue;
    if (applied.has(`${a.action_type}|${a.ex_date}`)) continue;
    let net = 0;
    for (const t of sec.trades) {
      if (t.trade_date >= a.ex_date) continue;
      net += t.trade_type === "buy" ? num(t.quantity) : -num(t.quantity);
    }
    if (net > 1e-6) {
      out.push({
        stock_id: sec.stock_id,
        action_type: a.action_type,
        ex_date: a.ex_date,
        factor: num(a.factor),
      });
    }
  }
  return out;
}
