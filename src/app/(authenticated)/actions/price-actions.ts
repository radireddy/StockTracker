"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isIndianTradingHours, ensureMissingStocks, bulkUpdatePrices, type PriceUpdateRow } from "@/lib/services/price-refresh";
import { stockPriceRegistry } from "@/lib/providers/stock-price/registry";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { action, type ActionResult } from "@/lib/action-result";
const log = createLogger({ service: "price-actions" });

const provider = stockPriceRegistry.getActive();

export async function fetchStockPrice(isin: string) {
  const adminClient = createAdminClient();

  const { data: stock } = await adminClient
    .from("indian_stocks")
    .select("isin, nse_symbol, bse_code, price")
    .eq("isin", isin)
    .single();

  if (!stock) {
    log.warn("fetchStockPrice: no indian_stocks entry for ISIN — attempting auto-create", { isin });
    // Try to auto-create from transaction data
    const { created } = await ensureMissingStocks(adminClient);
    if (created === 0) {
      log.error("fetchStockPrice: could not auto-create indian_stocks entry", { isin });
      return;
    }
    // Re-fetch after auto-create
    const { data: retryStock } = await adminClient
      .from("indian_stocks")
      .select("isin, nse_symbol, bse_code, price")
      .eq("isin", isin)
      .single();
    if (!retryStock) {
      log.error("fetchStockPrice: still no indian_stocks entry after auto-create", { isin });
      return;
    }
    return fetchStockPriceForEntry(adminClient, retryStock);
  }

  return fetchStockPriceForEntry(adminClient, stock);
}

async function fetchStockPriceForEntry(
  adminClient: ReturnType<typeof createAdminClient>,
  stock: { isin: string; nse_symbol: string | null; bse_code: string | null; price: number | null }
) {
  // Already has a price — skip
  if (stock.price != null) return;

  const symbol = stock.nse_symbol || stock.bse_code;
  if (!symbol) {
    log.warn("fetchStockPrice: stock has no nse_symbol or bse_code — cannot fetch price", {
      isin: stock.isin,
    });
    return;
  }

  try {
    const quote = await provider.fetchQuote(symbol);
    await adminClient
      .from("indian_stocks")
      .update({
        price: quote.price,
        change: quote.change,
        change_pct: quote.changePct,
        volume: quote.volume ?? null,
        market_cap: quote.marketCap ?? null,
        last_updated: new Date().toISOString(),
      })
      .eq("isin", stock.isin);

    log.info("Fetched initial price for stock", { isin: stock.isin, symbol, price: quote.price });
  } catch (err) {
    log.error("Failed to fetch initial price", {
      isin: stock.isin,
      symbol,
      provider: provider.name,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function manualRefreshPrices() {
  const { supabase, user } = await getAuthUser();

  // Throttle per user: this fans out to the external quote provider for every
  // held symbol, so repeated clicks must not stampede Yahoo Finance.
  const rl = await rateLimit(user.id, RATE_LIMITS.refreshPrices);
  if (!rl.success) {
    throw new Error("Too many refresh requests. Please wait a moment and try again.");
  }

  const start = Date.now();
  log.info("Manual refresh triggered", { userId: user.id });
  const adminClient = createAdminClient();

  // Step 1: Auto-create missing indian_stocks entries
  const { created: autoCreated, unresolved } = await ensureMissingStocks(adminClient);

  // Step 2: Get symbols from user's companies joined with indian_stocks (RLS scoped)
  const { data: companies, error } = await supabase
    .from("companies")
    .select("isin, indian_stocks(isin, nse_symbol, bse_code)");

  if (error) throw new Error(error.message);

  // Build symbol map: yahoo symbol -> isin (prefer NSE symbol)
  const symbolMap = new Map<string, string>();
  const skippedNoEntry: string[] = [];
  const skippedNoSymbol: string[] = [];

  for (const row of companies ?? []) {
    const stock = row.indian_stocks as unknown as { isin: string; nse_symbol: string | null; bse_code: string | null } | null;
    if (!stock) {
      skippedNoEntry.push(row.isin as string);
      continue;
    }
    if (stock.nse_symbol) {
      symbolMap.set(stock.nse_symbol, stock.isin);
    } else if (stock.bse_code) {
      symbolMap.set(stock.bse_code, stock.isin);
    } else {
      skippedNoSymbol.push(stock.isin);
    }
  }

  if (skippedNoEntry.length > 0) {
    log.error("Manual refresh: companies with no indian_stocks entry (skipped)", {
      count: skippedNoEntry.length,
      isins: skippedNoEntry,
    });
  }
  if (skippedNoSymbol.length > 0) {
    log.warn("Manual refresh: stocks missing nse_symbol and bse_code (skipped)", {
      count: skippedNoSymbol.length,
      isins: skippedNoSymbol,
    });
  }

  const symbols = Array.from(symbolMap.keys());

  if (symbols.length === 0) {
    log.warn("Manual refresh: no symbols to fetch prices for");
    return { updated: 0, failed: [], totalSymbols: 0, outsideTradingHours: !isIndianTradingHours() };
  }

  const quotes = await provider.fetchBulkQuotes(symbols);

  const failed: string[] = [];
  const rows: PriceUpdateRow[] = [];
  const attemptedSymbols: string[] = [];
  const now = new Date().toISOString();

  for (const symbol of symbols) {
    const quote = quotes.get(symbol);
    const isin = symbolMap.get(symbol)!;
    if (!quote) {
      log.warn("Manual refresh: provider returned no quote", { symbol, isin, provider: provider.name });
      failed.push(symbol);
      continue;
    }

    attemptedSymbols.push(symbol);
    // market_cap is intentionally omitted so the RPC leaves the existing
    // value untouched (manual refresh has never updated market_cap).
    rows.push({
      isin,
      price: quote.price,
      change: quote.change,
      change_pct: quote.changePct,
      volume: quote.volume ?? null,
      last_updated: now,
    });
  }

  // Single bulk round-trip instead of one UPDATE per stock. On batch failure
  // every attempted symbol is reported as failed.
  const { error: bulkError } = await bulkUpdatePrices(adminClient, rows);
  let updated = rows.length;
  if (bulkError) {
    log.error("Manual refresh: failed to bulk-update stock prices in DB", { count: rows.length, error: bulkError });
    failed.push(...attemptedSymbols);
    updated = 0;
  }

  revalidatePath("/");

  log.info("Manual price refresh completed", {
    updated,
    failed,
    totalSymbols: symbols.length,
    autoCreated,
    unresolvedIsins: unresolved,
    skippedNoEntry: skippedNoEntry.length,
    skippedNoSymbol: skippedNoSymbol.length,
    duration_ms: Date.now() - start,
  });

  return {
    updated,
    failed,
    totalSymbols: symbols.length,
    outsideTradingHours: !isIndianTradingHours(),
  };
}

export async function updateMarketCap(isin: string, marketCapCrores: number | null): Promise<ActionResult> {
  await getAuthUser(); // ensures authenticated
  return action(async () => {
    const adminClient = createAdminClient();
    const rawRupees = marketCapCrores != null ? Math.round(marketCapCrores * 1e7) : null;
    const { error } = await adminClient
      .from("indian_stocks")
      .update({ market_cap: rawRupees })
      .eq("isin", isin);
    if (error) throw new Error(error.message);
    revalidatePath("/");
  });
}
