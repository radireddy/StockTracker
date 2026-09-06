"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import {
  deriveRemainingLots,
  remainingLotsToOpenLots,
  type StockQuote,
  type TradeForOpenPositions,
} from "@/lib/import/open-positions";
import { loadCorporateActionContext } from "@/lib/import/corporate-actions-data";
import { resolveCanonical } from "@/lib/import/corporate-actions";
import { fetchAllRows } from "@/lib/supabase/paginate";
import type { OpenPosition, OpenLot } from "@/lib/import/tradebook-types";

const log = createLogger({ service: "trades-actions" });

type TradeRow = {
  id: string;
  user_id: string;
  account_id: string;
  isin: string;
  stock_id: string | null;
  symbol: string;
  trade_date: string;
  trade_type: "buy" | "sell";
  quantity: number | string;
  price: number | string;
  executed_at: string | null;
  broker_trade_id: string;
  source?: "zerodha" | "manual";
  original?: unknown | null;
};

function toTrade(row: TradeRow): TradeForOpenPositions {
  return {
    id: row.id,
    user_id: row.user_id,
    account_id: row.account_id,
    isin: row.isin,
    stock_id: row.stock_id,
    symbol: row.symbol,
    trade_date: row.trade_date,
    trade_type: row.trade_type,
    quantity: Number(row.quantity),
    price: Number(row.price),
    executed_at: row.executed_at,
    broker_trade_id: row.broker_trade_id,
    source: row.source ?? "zerodha",
    edited: row.original != null,
  };
}

async function loadTrades(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  accountIds?: string[],
  isin?: string
): Promise<TradeForOpenPositions[]> {
  try {
    // Page past the PostgREST 1000-row cap. Order by the primary key so pages
    // are stable and never overlap or gap.
    const rows = await fetchAllRows<TradeRow>((from, to) => {
      let query = supabase
        .from("trades")
        .select(
          "id, user_id, account_id, isin, stock_id, symbol, trade_date, trade_type, quantity, price, executed_at, broker_trade_id, source, original"
        )
        .eq("excluded", false)
        .order("id", { ascending: true });
      if (accountIds && accountIds.length > 0) {
        query = query.in("account_id", accountIds);
      }
      if (isin) query = query.eq("isin", isin);
      return query.range(from, to);
    });
    return rows.map(toTrade);
  } catch (e) {
    log.error("Failed to load trades", {
      error: e instanceof Error ? e.message : String(e),
      isin,
    });
    throw e;
  }
}

async function loadTradesByStockIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  stockIds: string[],
  accountIds?: string[]
): Promise<TradeForOpenPositions[]> {
  const rows = await fetchAllRows<TradeRow>((from, to) => {
    let query = supabase
      .from("trades")
      .select(
        "id, user_id, account_id, isin, stock_id, symbol, trade_date, trade_type, quantity, price, executed_at, broker_trade_id"
      )
      .in("stock_id", stockIds)
      .order("id", { ascending: true });
    if (accountIds && accountIds.length > 0) {
      query = query.in("account_id", accountIds);
    }
    return query.range(from, to);
  });
  return rows.map(toTrade);
}

async function loadQuotes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  stockIds: string[]
): Promise<Map<string, StockQuote>> {
  const quotes = new Map<string, StockQuote>();
  const unique = [...new Set(stockIds.filter(Boolean))];
  if (unique.length === 0) return quotes;

  const { data, error } = await supabase
    .from("indian_stocks")
    .select("id, name, sector, nse_symbol, price")
    .in("id", unique);
  if (error) {
    log.error("Failed to load stock quotes", { error: error.message });
    return quotes;
  }
  for (const row of (data ?? []) as Array<{
    id: string;
    name: string | null;
    sector: string | null;
    nse_symbol: string | null;
    price: number | string | null;
  }>) {
    quotes.set(row.id, {
      name: row.name,
      sector: row.sector,
      nse_symbol: row.nse_symbol,
      price: row.price == null ? null : Number(row.price),
    });
  }
  return quotes;
}

type SnapshotRow = {
  account_id: string;
  stock_id: string | null;
  isin: string;
  symbol: string;
  quantity: number | string;
  avg_buy_price: number | string;
};

/**
 * Returns open positions for the user, consolidated across accounts by canonical
 * security. Reads the pre-computed `open_position_snapshots` (one row per
 * account+security, refreshed at import time with corporate-action adjustments
 * already applied) and joins live price for unrealized P&L. Cheap: a handful of
 * rows, no per-request FIFO, no raw-trade transfer.
 */
export async function getOpenPositions(
  accountIds?: string[]
): Promise<OpenPosition[]> {
  const { supabase } = await getAuthUser();

  const snaps = await fetchAllRows<SnapshotRow>((from, to) => {
    let q = supabase
      .from("open_position_snapshots")
      .select("account_id, stock_id, isin, symbol, quantity, avg_buy_price")
      .order("stock_id", { ascending: true });
    if (accountIds && accountIds.length > 0) q = q.in("account_id", accountIds);
    return q.range(from, to);
  });

  // Consolidate across accounts by canonical security (cost-weighted avg).
  const byKey = new Map<
    string,
    { stock_id: string | null; isin: string; symbol: string; qty: number; cost: number }
  >();
  for (const s of snaps) {
    const key = s.stock_id ?? s.isin;
    const qty = Number(s.quantity);
    const cur = byKey.get(key) ?? {
      stock_id: s.stock_id,
      isin: s.isin,
      symbol: s.symbol,
      qty: 0,
      cost: 0,
    };
    cur.qty += qty;
    cur.cost += qty * Number(s.avg_buy_price);
    byKey.set(key, cur);
  }

  const quotes = await loadQuotes(
    supabase,
    [...byKey.values()].map((v) => v.stock_id).filter((id): id is string => id != null)
  );

  const positions: OpenPosition[] = [];
  for (const v of byKey.values()) {
    if (v.qty <= 0) continue;
    const avgBuy = v.cost / v.qty;
    const quote = (v.stock_id && quotes.get(v.stock_id)) || undefined;
    const currentPrice = quote?.price ?? null;
    positions.push({
      isin: v.isin,
      stock_id: v.stock_id,
      symbol: quote?.nse_symbol || v.symbol,
      name: quote?.name ?? null,
      sector: quote?.sector ?? null,
      quantity: v.qty,
      avg_buy_price: avgBuy,
      current_price: currentPrice,
      unrealized_pnl: currentPrice != null ? (currentPrice - avgBuy) * v.qty : null,
      pnl_pct:
        currentPrice != null && avgBuy > 0
          ? ((currentPrice - avgBuy) / avgBuy) * 100
          : null,
    });
  }

  positions.sort((a, b) => b.quantity - a.quantity);
  return positions;
}

/**
 * Returns all distinct securities the user has ever traded (regardless of
 * current quantity). Used in the RecordMergerDialog so that the to-security
 * (surviving company) appears in the dropdown even when its net quantity is 0
 * or negative before the merger is recorded.
 */
export async function getTradedSecurities(): Promise<
  Array<{ symbol: string; stock_id: string }>
> {
  const { supabase } = await getAuthUser();
  try {
    const rows = await fetchAllRows<{ symbol: string; stock_id: string }>(
      (from, to) =>
        supabase
          .from("trades")
          .select("symbol, stock_id")
          .eq("excluded", false)
          .not("stock_id", "is", null)
          .order("symbol", { ascending: true })
          .range(from, to)
    );
    // Deduplicate by stock_id (keep first-seen symbol for each stock_id).
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (!seen.has(r.stock_id)) seen.set(r.stock_id, r.symbol);
    }
    return [...seen.entries()]
      .map(([stock_id, symbol]) => ({ stock_id, symbol }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  } catch (e) {
    log.error("Failed to load traded securities", {
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/** Returns per-lot open lots for a single stock (lazy-loaded on row expand). */
export async function getOpenLotsForStock(
  isin: string,
  accountIds?: string[]
): Promise<OpenLot[]> {
  const { supabase } = await getAuthUser();
  const ca = await loadCorporateActionContext(supabase);

  // Resolve the canonical security for this ISIN, then gather every stock_id
  // that maps to it (old forked rows + the canonical) so lots spanning an ISIN
  // change are all included.
  const { data: stockRow } = await supabase
    .from("indian_stocks")
    .select("id")
    .eq("isin", isin)
    .maybeSingle();
  const canonical = stockRow
    ? resolveCanonical(stockRow.id as string, ca.canonicalMap)
    : null;

  const stockIds = new Set<string>();
  if (canonical) {
    stockIds.add(canonical);
    for (const [oldId, canon] of ca.canonicalMap) {
      if (canon === canonical) stockIds.add(oldId);
    }
  }

  const trades =
    stockIds.size > 0
      ? await loadTradesByStockIds(supabase, [...stockIds], accountIds)
      : await loadTrades(supabase, accountIds, isin);

  const lots = deriveRemainingLots(trades, ca);
  const quotes = await loadQuotes(
    supabase,
    lots.map((l) => l.stock_id).filter((id): id is string => id != null)
  );

  const accountIdList = [...new Set(lots.map((l) => l.account_id))];
  const accounts = new Map<string, { label: string; broker: string }>();
  if (accountIdList.length > 0) {
    const { data } = await supabase
      .from("accounts")
      .select("id, label, broker")
      .in("id", accountIdList);
    for (const a of (data ?? []) as Array<{ id: string; label: string; broker: string }>) {
      accounts.set(a.id, { label: a.label, broker: a.broker });
    }
  }

  return remainingLotsToOpenLots(lots, accounts, quotes);
}
