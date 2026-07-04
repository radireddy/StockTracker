import { SupabaseClient } from "@supabase/supabase-js";
import { stockPriceRegistry } from "@/lib/providers/stock-price/registry";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "price-refresh" });

const provider = stockPriceRegistry.getActive();

export interface PriceUpdateRow {
  isin: string;
  price: number;
  change: number;
  change_pct: number;
  volume: number | null;
  /** Omit the key entirely to leave the existing market_cap untouched. */
  market_cap?: number | null;
  last_updated: string;
}

/**
 * Bulk-updates stock prices in a single DB round-trip via the
 * `bulk_update_stock_prices` RPC (see migration 005). Replaces the previous
 * per-row UPDATE loop, which serialized one round-trip per stock.
 */
export async function bulkUpdatePrices(
  adminClient: SupabaseClient,
  rows: PriceUpdateRow[]
): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await adminClient.rpc("bulk_update_stock_prices", { p_rows: rows });
  return { error: error ? error.message : null };
}

export function isIndianTradingHours(): boolean {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);

  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const hour = ist.getHours();
  return hour >= 9 && hour < 16;
}

/**
 * Finds companies whose ISIN has no matching row in indian_stocks,
 * attempts to resolve the symbol from transaction data, and inserts
 * missing entries so future price refreshes can fetch quotes.
 *
 * Returns the number of stocks auto-created.
 */
export async function ensureMissingStocks(
  adminClient: SupabaseClient
): Promise<{ created: number; unresolved: string[] }> {
  // Find companies with no matching indian_stocks row
  const { data: orphans, error } = await adminClient
    .from("companies")
    .select("isin")
    .is("indian_stocks", null);

  if (error) {
    log.error("ensureMissingStocks: failed to query orphan companies", { error: error.message });
    return { created: 0, unresolved: [] };
  }

  const orphanIsins = [...new Set((orphans ?? []).map((r) => r.isin as string))];
  if (orphanIsins.length === 0) return { created: 0, unresolved: [] };

  log.warn("Companies missing from indian_stocks catalog", {
    count: orphanIsins.length,
    isins: orphanIsins,
  });

  // Holdings import always registers the stock (with symbol) in `indian_stocks`,
  // and manual "Add Company" only allows picking existing catalog stocks — so
  // orphan companies are not expected. We can no longer derive a symbol for a
  // truly orphaned ISIN (there is no trade history), so just report them.
  const unresolved = orphanIsins;
  if (unresolved.length > 0) {
    log.warn("Orphan companies with no indian_stocks entry", {
      count: unresolved.length,
      isins: unresolved,
    });
  }

  return { created: 0, unresolved };
}

export async function refreshPrices(
  adminClient: SupabaseClient
): Promise<{ updated: number; failed: string[]; totalSymbols: number; autoCreated: number; unresolved: string[] }> {
  // Step 1: Auto-create missing indian_stocks entries
  const { created: autoCreated, unresolved } = await ensureMissingStocks(adminClient);

  // Step 2: Get all companies joined with indian_stocks to get symbols
  const { data: companies, error } = await adminClient
    .from("companies")
    .select("isin, indian_stocks(isin, nse_symbol, bse_code)");

  if (error) throw new Error(`Failed to fetch companies: ${error.message}`);

  // Build symbol map: yahoo symbol -> isin (prefer NSE with .NS suffix)
  const symbolMap = new Map<string, string>();
  const noSymbol: string[] = []; // ISINs in indian_stocks but missing nse_symbol AND bse_code
  const noStockEntry: string[] = []; // ISINs with no indian_stocks row at all

  for (const row of companies ?? []) {
    const stock = row.indian_stocks as unknown as { isin: string; nse_symbol: string | null; bse_code: string | null } | null;
    if (!stock) {
      noStockEntry.push(row.isin as string);
      continue;
    }
    if (stock.nse_symbol) {
      symbolMap.set(stock.nse_symbol, stock.isin);
    } else if (stock.bse_code) {
      symbolMap.set(stock.bse_code, stock.isin);
    } else {
      noSymbol.push(stock.isin);
    }
  }

  if (noStockEntry.length > 0) {
    log.error("Companies with no indian_stocks entry (price fetch skipped)", {
      count: noStockEntry.length,
      isins: noStockEntry,
    });
  }

  if (noSymbol.length > 0) {
    log.warn("Stocks in indian_stocks but missing both nse_symbol and bse_code (price fetch skipped)", {
      count: noSymbol.length,
      isins: noSymbol,
    });
  }

  const uniqueSymbols = Array.from(symbolMap.keys());
  if (uniqueSymbols.length === 0) {
    log.warn("No symbols to refresh prices for");
    return { updated: 0, failed: [], totalSymbols: 0, autoCreated, unresolved };
  }

  log.info("Price refresh started", {
    totalSymbols: uniqueSymbols.length,
    symbols: uniqueSymbols,
    skippedNoEntry: noStockEntry.length,
    skippedNoSymbol: noSymbol.length,
  });

  const quotes = await provider.fetchBulkQuotes(uniqueSymbols);

  const failed: string[] = [];
  const rows: PriceUpdateRow[] = [];
  const attemptedSymbols: string[] = [];
  const now = new Date().toISOString();

  for (const symbol of uniqueSymbols) {
    const quote = quotes.get(symbol);
    const isin = symbolMap.get(symbol)!;
    if (!quote) {
      log.warn("Provider returned no quote", { symbol, isin, provider: provider.name });
      failed.push(symbol);
      continue;
    }

    attemptedSymbols.push(symbol);
    rows.push({
      isin,
      price: quote.price,
      change: quote.change,
      change_pct: quote.changePct,
      volume: quote.volume ?? null,
      market_cap: quote.marketCap ?? null,
      last_updated: now,
    });
  }

  // Single bulk round-trip instead of one UPDATE per stock. If the batch
  // fails, every symbol in it is reported as failed (per-row attribution is
  // not available for a batch write).
  const { error: bulkError } = await bulkUpdatePrices(adminClient, rows);
  let updated = rows.length;
  if (bulkError) {
    log.error("Failed to bulk-update stock prices in DB", { count: rows.length, error: bulkError });
    failed.push(...attemptedSymbols);
    updated = 0;
  }

  if (failed.length > 0) {
    log.error("Price refresh: symbols that failed to fetch/update", {
      count: failed.length,
      symbols: failed,
    });
  }

  log.info("Price refresh completed", {
    updated,
    failed: failed.length,
    totalSymbols: uniqueSymbols.length,
    autoCreated,
    unresolvedIsins: unresolved,
  });

  return { updated, failed, totalSymbols: uniqueSymbols.length, autoCreated, unresolved };
}
