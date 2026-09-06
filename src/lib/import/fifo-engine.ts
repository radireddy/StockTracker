import type { RawTradeForFifo, LotMatch } from "./tradebook-types";
import {
  securityKey,
  adjustQtyPrice,
  type CorporateActionContext,
} from "./corporate-actions";

export interface FifoInput {
  userId: string;
  accountId: string;
  /** All trades for this account (any ISINs). Grouped by canonical security. */
  trades: RawTradeForFifo[];
  /**
   * Optional corporate-action context. When present, trades are grouped by
   * canonical security (unifying ISIN changes) and pre-action quantities/prices
   * are normalized to current units before matching.
   */
  ca?: CorporateActionContext;
}

/**
 * Compute FIFO lot matches for all trades in a single account.
 *
 * Algorithm:
 *  1. Group trades by ISIN.
 *  2. For each ISIN, sort all trades by execution time (falling back to trade_date).
 *  3. Walk day-by-day. Days with BOTH buys and sells are "intraday-eligible":
 *     same-day buys are matched against same-day sells first (speculative income).
 *     Leftover intraday buys join the delivery FIFO queue.
 *  4. Remaining delivery sells drain the FIFO queue in oldest-first order.
 *
 * Returns only matched pairs; open buy lots are NOT returned.
 */
export function computeFifoMatches({ userId, accountId, trades, ca }: FifoInput): LotMatch[] {
  if (trades.length === 0) return [];

  const matches: LotMatch[] = [];

  const canonicalMap = ca?.canonicalMap ?? new Map<string, string>();
  const actionsBySecurity = ca?.actionsBySecurity ?? new Map();

  // Group by canonical security (unifies ISIN changes). Normalize each trade's
  // quantity/price to current units so pre/post-action legs reconcile.
  const bySecurity = new Map<string, RawTradeForFifo[]>();
  for (const t of trades) {
    const key = securityKey(t.stock_id, t.isin, canonicalMap);
    const { qty, price } = adjustQtyPrice(
      t.quantity,
      t.price,
      t.trade_date,
      actionsBySecurity.get(key) ?? []
    );
    const adjusted: RawTradeForFifo = { ...t, quantity: qty, price };
    const list = bySecurity.get(key);
    if (list) list.push(adjusted);
    else bySecurity.set(key, [adjusted]);
  }

  for (const [, isinTrades] of bySecurity) {
    // Sort by execution time; fall back to trade_date start-of-day
    const sorted = [...isinTrades].sort((a, b) => {
      const ta = a.executed_at ?? `${a.trade_date}T00:00:00Z`;
      const tb = b.executed_at ?? `${b.trade_date}T00:00:00Z`;
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    // Group by date → {buys, sells}
    const byDate = new Map<string, { buys: RawTradeForFifo[]; sells: RawTradeForFifo[] }>();
    for (const t of sorted) {
      let day = byDate.get(t.trade_date);
      if (!day) {
        day = { buys: [], sells: [] };
        byDate.set(t.trade_date, day);
      }
      (t.trade_type === "buy" ? day.buys : day.sells).push(t);
    }

    // Delivery FIFO queue: {trade, remaining qty}
    const queue: Array<{ trade: RawTradeForFifo; remaining: number }> = [];

    for (const date of [...byDate.keys()].sort()) {
      const { buys, sells } = byDate.get(date)!;
      const hasIntraday = buys.length > 0 && sells.length > 0;

      if (hasIntraday) {
        // Work on mutable copies of same-day buy remainders
        const intradayBuys = buys.map((t) => ({ trade: t, remaining: t.quantity }));

        for (const sell of sells) {
          let sellLeft = sell.quantity;

          // 1. Match sell against same-day buys (intraday)
          for (const lot of intradayBuys) {
            if (sellLeft <= 0 || lot.remaining <= 0) continue;
            const matched = Math.min(lot.remaining, sellLeft);
            lot.remaining -= matched;
            sellLeft -= matched;
            matches.push(buildMatch(userId, accountId, lot.trade, sell, matched, true));
          }

          // 2. Overflow: drain the delivery queue
          if (sellLeft > 0) {
            sellLeft = drainQueue(queue, sell, sellLeft, userId, accountId, matches);
          }
        }

        // Leftover intraday buys → join the delivery queue (oldest first)
        for (const lot of intradayBuys) {
          if (lot.remaining > 0) queue.push({ trade: lot.trade, remaining: lot.remaining });
        }
      } else if (buys.length > 0) {
        // Pure buy day — add to queue
        for (const t of buys) queue.push({ trade: t, remaining: t.quantity });
      } else {
        // Pure sell day — drain queue
        for (const sell of sells) {
          drainQueue(queue, sell, sell.quantity, userId, accountId, matches);
        }
      }
    }
  }

  return matches;
}

function drainQueue(
  queue: Array<{ trade: RawTradeForFifo; remaining: number }>,
  sell: RawTradeForFifo,
  sellLeft: number,
  userId: string,
  accountId: string,
  matches: LotMatch[]
): number {
  for (const lot of queue) {
    if (sellLeft <= 0 || lot.remaining <= 0) continue;
    const matched = Math.min(lot.remaining, sellLeft);
    lot.remaining -= matched;
    sellLeft -= matched;
    matches.push(buildMatch(userId, accountId, lot.trade, sell, matched, false));
  }
  return sellLeft;
}

function buildMatch(
  userId: string,
  accountId: string,
  buy: RawTradeForFifo,
  sell: RawTradeForFifo,
  matchedQty: number,
  isIntraday: boolean
): LotMatch {
  const buyMs  = new Date(buy.trade_date).getTime();
  const sellMs = new Date(sell.trade_date).getTime();
  const holdingDays = Math.round((sellMs - buyMs) / 86_400_000);
  return {
    user_id: userId,
    account_id: accountId,
    stock_id: buy.stock_id,
    isin: buy.isin,
    buy_trade_id: buy.id,
    sell_trade_id: sell.id,
    matched_quantity: matchedQty,
    buy_date: buy.trade_date,
    sell_date: sell.trade_date,
    buy_price: buy.price,
    sell_price: sell.price,
    realized_pnl: (sell.price - buy.price) * matchedQty,
    holding_days: holdingDays,
    is_intraday: isIntraday,
    is_long_term: !isIntraday && holdingDays >= 365,
  };
}
