import { computeFifoMatches } from "./fifo-engine";
import {
  securityKey,
  adjustQtyPrice,
  resolveCanonical,
  type CorporateActionContext,
} from "./corporate-actions";
import type { OpenLot, OpenPosition, RawTradeForFifo } from "./tradebook-types";

export { summarizeOpenPositions } from "./position-summary";
export type { PositionSummary } from "./position-summary";

const QTY_EPS = 1e-6;

/** Trade row needed to derive remaining (unsold) buy lots. */
export interface TradeForOpenPositions extends RawTradeForFifo {
  user_id: string;
  account_id: string;
  symbol: string;
  broker_trade_id: string;
  /** 'zerodha' (imported) | 'manual' (user-entered). Defaults to 'zerodha'. */
  source?: "zerodha" | "manual";
  /** True when a broker row has been overridden (its `original` snapshot is set). */
  edited?: boolean;
}

export interface RemainingLot {
  id: string;
  user_id: string;
  account_id: string;
  isin: string;
  stock_id: string | null;
  symbol: string;
  trade_date: string;
  executed_at: string | null;
  broker_trade_id: string;
  original_qty: number;
  remaining_qty: number;
  buy_price: number;
  source?: "zerodha" | "manual";
  edited?: boolean;
}

export interface StockQuote {
  name: string | null;
  sector: string | null;
  nse_symbol: string | null;
  price: number | null;
}

export interface AccountMeta {
  label: string;
  broker: string;
}

function num(v: number): number {
  return typeof v === "number" ? v : Number(v);
}

/**
 * Remaining buy lots after FIFO matching. Fully sold buys are omitted.
 * Computes FIFO per account so multi-account books stay isolated.
 */
export function deriveRemainingLots(
  trades: TradeForOpenPositions[],
  ca?: CorporateActionContext
): RemainingLot[] {
  if (trades.length === 0) return [];

  const canonicalMap = ca?.canonicalMap ?? new Map<string, string>();
  const actionsBySecurity = ca?.actionsBySecurity ?? new Map();

  const byAccount = new Map<string, TradeForOpenPositions[]>();
  for (const t of trades) {
    const list = byAccount.get(t.account_id);
    if (list) list.push(t);
    else byAccount.set(t.account_id, [t]);
  }

  const remaining: RemainingLot[] = [];

  for (const [accountId, acctTrades] of byAccount) {
    const matches = computeFifoMatches({
      userId: acctTrades[0]?.user_id ?? "",
      accountId,
      trades: acctTrades,
      ca,
    });

    const soldQty = new Map<string, number>();
    for (const m of matches) {
      soldQty.set(m.buy_trade_id, (soldQty.get(m.buy_trade_id) ?? 0) + m.matched_quantity);
    }

    for (const t of acctTrades) {
      if (t.trade_type !== "buy") continue;
      // Normalize the lot to current units so remaining_qty (which subtracts
      // adjusted sold quantity) and buy_price are in the same basis.
      const key = securityKey(t.stock_id, t.isin, canonicalMap);
      const { qty: adjOriginal, price: adjPrice } = adjustQtyPrice(
        num(t.quantity),
        num(t.price),
        t.trade_date,
        actionsBySecurity.get(key) ?? []
      );
      const rem = adjOriginal - (soldQty.get(t.id) ?? 0);
      if (rem <= QTY_EPS) continue;
      remaining.push({
        id: t.id,
        user_id: t.user_id,
        account_id: t.account_id,
        isin: t.isin,
        stock_id: resolveCanonical(t.stock_id, canonicalMap),
        symbol: t.symbol,
        trade_date: t.trade_date,
        executed_at: t.executed_at,
        broker_trade_id: t.broker_trade_id,
        original_qty: adjOriginal,
        remaining_qty: rem,
        buy_price: adjPrice,
        source: t.source,
        edited: t.edited,
      });
    }
  }

  return remaining;
}

/** Collapse remaining lots into one row per ISIN (FIFO-weighted avg cost). */
export function aggregateOpenPositions(
  lots: RemainingLot[],
  quotes: Map<string, StockQuote>
): OpenPosition[] {
  // Group by canonical security (stock_id already resolved to canonical in
  // deriveRemainingLots); fall back to ISIN for legacy lots with no stock_id.
  const bySecurity = new Map<string, RemainingLot[]>();
  for (const lot of lots) {
    const k = lot.stock_id ?? lot.isin;
    const list = bySecurity.get(k);
    if (list) list.push(lot);
    else bySecurity.set(k, [lot]);
  }

  const positions: OpenPosition[] = [];

  for (const [, isinLots] of bySecurity) {
    const quantity = isinLots.reduce((s, l) => s + l.remaining_qty, 0);
    if (quantity <= QTY_EPS) continue;

    const cost = isinLots.reduce((s, l) => s + l.remaining_qty * l.buy_price, 0);
    const avgBuy = cost / quantity;
    const stockId = isinLots.find((l) => l.stock_id)?.stock_id ?? null;
    const quote = (stockId && quotes.get(stockId)) || undefined;
    const currentPrice = quote?.price ?? null;
    const symbol = quote?.nse_symbol || isinLots[0].symbol;
    // Prefer the ISIN of a lot carrying the canonical stock_id.
    const isin = (isinLots.find((l) => l.stock_id)?.isin) ?? isinLots[0].isin;

    positions.push({
      isin,
      stock_id: stockId,
      symbol,
      name: quote?.name ?? null,
      sector: quote?.sector ?? null,
      quantity,
      avg_buy_price: avgBuy,
      current_price: currentPrice,
      unrealized_pnl:
        currentPrice != null ? (currentPrice - avgBuy) * quantity : null,
      pnl_pct:
        currentPrice != null && avgBuy > 0
          ? ((currentPrice - avgBuy) / avgBuy) * 100
          : null,
    });
  }

  positions.sort((a, b) => b.quantity - a.quantity);
  return positions;
}

export function remainingLotsToOpenLots(
  lots: RemainingLot[],
  accounts: Map<string, AccountMeta>,
  quotes: Map<string, StockQuote>,
  asOf: Date = new Date()
): OpenLot[] {
  const asOfDay = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());

  // Collapse multiple partial fills from the same day + account into one display row.
  // Broker orders often split across dozens of tiny executions at nearly-identical prices;
  // showing each execution separately overwhelms the UI with noise.
  const groupMap = new Map<string, RemainingLot[]>();
  for (const lot of lots) {
    const k = `${lot.trade_date}\x00${lot.account_id}\x00${lot.buy_price}`;
    const g = groupMap.get(k);
    if (g) g.push(lot);
    else groupMap.set(k, [lot]);
  }

  const result: OpenLot[] = [];

  for (const [, group] of groupMap) {
    // Representative = earliest execution within the group
    const rep = group.reduce((earliest, lot) => {
      const ea = earliest.executed_at ?? `${earliest.trade_date}T00:00:00Z`;
      const la = lot.executed_at ?? `${lot.trade_date}T00:00:00Z`;
      return la < ea ? lot : earliest;
    });

    const [y, m, d] = rep.trade_date.split("-").map(Number);
    const buyDay = Date.UTC(y, m - 1, d);
    const holdingDays = Math.round((asOfDay - buyDay) / 86_400_000);

    const originalQty = group.reduce((s, l) => s + l.original_qty, 0);
    const remainingQty = group.reduce((s, l) => s + l.remaining_qty, 0);
    // Weighted-average buy price by original quantity
    const avgBuyPrice =
      group.reduce((s, l) => s + l.original_qty * l.buy_price, 0) / originalQty;

    const quote = rep.stock_id ? quotes.get(rep.stock_id) : undefined;
    const currentPrice = quote?.price ?? null;
    const acct = accounts.get(rep.account_id);
    const cagr =
      currentPrice != null && avgBuyPrice > 0 && holdingDays >= 7
        ? (Math.pow(currentPrice / avgBuyPrice, 365 / holdingDays) - 1) * 100
        : null;

    result.push({
      id: rep.id,
      account_id: rep.account_id,
      account_label: acct?.label ?? "",
      broker: acct?.broker ?? "",
      trade_date: rep.trade_date,
      original_qty: originalQty,
      remaining_qty: remainingQty,
      buy_price: avgBuyPrice,
      current_price: currentPrice,
      unrealized_pnl:
        currentPrice != null ? (currentPrice - avgBuyPrice) * remainingQty : null,
      pnl_pct:
        currentPrice != null && avgBuyPrice > 0
          ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100
          : null,
      holding_days: holdingDays,
      cagr,
      broker_trade_id: rep.broker_trade_id,
      trade_ids: group.map((l) => l.id),
      source: group.every((l) => l.source === "manual")
        ? "manual"
        : group.every((l) => (l.source ?? "zerodha") === "zerodha")
          ? "zerodha"
          : "mixed",
      edited: group.some((l) => l.edited === true),
    });
  }

  result.sort((a, b) => (a.trade_date > b.trade_date ? -1 : a.trade_date < b.trade_date ? 1 : 0));
  return result;
}
