import { SupabaseClient } from "@supabase/supabase-js";
import { YahooFinanceProvider } from "@/lib/providers/stock-price/yahoo-finance-provider";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "price-refresh" });

const provider = new YahooFinanceProvider();

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

  let created = 0;
  const unresolved: string[] = [];

  for (const isin of orphanIsins) {
    // Try to resolve symbol from the most recent transaction for any company with this ISIN
    const { data: txn } = await adminClient
      .from("transactions")
      .select("trade_id, exchange, company_id")
      .eq("company_id", (
        await adminClient
          .from("companies")
          .select("id")
          .eq("isin", isin)
          .limit(1)
          .single()
      ).data?.id ?? "")
      .order("traded_at", { ascending: false })
      .limit(1)
      .single();

    // Extract symbol from trade_id (Zerodha format: "{symbol}-{date}-{index}")
    // or from the company's known NSE symbol patterns
    let symbol: string | null = null;
    let exchange: string = "NSE";

    if (txn?.trade_id) {
      // Zerodha trade_id format: "SYMBOL-YYYYMMDD-N"
      const parts = txn.trade_id.split("-");
      if (parts.length >= 2) {
        symbol = parts[0];
      }
      if (txn.exchange) {
        exchange = txn.exchange;
      }
    }

    if (!symbol) {
      log.warn("Cannot resolve symbol for orphan ISIN — no transaction data", { isin });
      unresolved.push(isin);
      continue;
    }

    const stockRow = {
      isin,
      name: symbol, // Best we have; will be overwritten if stock is later found in catalog
      nse_symbol: exchange === "NSE" || exchange === "BOTH" ? symbol : null,
      bse_code: exchange === "BSE" ? symbol : null,
      exchange: exchange === "BSE" ? ("BSE" as const) : ("NSE" as const),
    };

    let { error: insertErr } = await adminClient
      .from("indian_stocks")
      .upsert(stockRow, { onConflict: "isin", ignoreDuplicates: true });

    if (insertErr) {
      // Retry without symbol columns in case of unique constraint conflict
      log.warn("Stock insert failed, retrying without symbol columns", {
        isin, symbol, error: insertErr.message,
      });
      const { error: retryErr } = await adminClient
        .from("indian_stocks")
        .upsert(
          { isin, name: symbol, exchange: stockRow.exchange },
          { onConflict: "isin", ignoreDuplicates: true }
        );
      insertErr = retryErr;
    }

    if (insertErr) {
      log.error("Failed to auto-create missing stock in indian_stocks", {
        isin, symbol, error: insertErr.message,
      });
      unresolved.push(isin);
    } else {
      log.info("Auto-created missing stock in indian_stocks", { isin, symbol, exchange });
      created++;
    }
  }

  if (unresolved.length > 0) {
    log.error("Stocks still missing from indian_stocks after auto-create attempt", {
      count: unresolved.length,
      isins: unresolved,
    });
  }

  return { created, unresolved };
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

  let updated = 0;
  const failed: string[] = [];

  for (const symbol of uniqueSymbols) {
    const quote = quotes.get(symbol);
    const isin = symbolMap.get(symbol)!;
    if (!quote) {
      log.warn("Yahoo Finance returned no quote", { symbol, isin });
      failed.push(symbol);
      continue;
    }

    const { error: updateError } = await adminClient
      .from("indian_stocks")
      .update({
        price: quote.price,
        change: quote.change,
        change_pct: quote.changePct,
        volume: quote.volume ?? null,
        market_cap: quote.marketCap ?? null,
        last_updated: new Date().toISOString(),
      })
      .eq("isin", isin);

    if (updateError) {
      log.error("Failed to update stock price in DB", { symbol, isin, error: updateError.message });
      failed.push(symbol);
    } else {
      updated++;
    }
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
