import { createLogger } from "@/lib/logger";
import type { ParsedTrade } from "./types";

const log = createLogger({ service: "corporate-action-detector" });

/**
 * Types of corporate actions we can detect from tradebook data.
 */
export type CorporateActionType =
  | "STOCK_SPLIT"
  | "BONUS"
  | "DEMERGER"
  | "MERGER"
  | "SYMBOL_RENAME";

/**
 * A detected corporate action anomaly.
 * These are surfaced to the user for confirmation before adjusting holdings.
 */
export interface DetectedAnomaly {
  type: CorporateActionType;
  symbol: string;
  isin: string;
  confidence: "high" | "medium" | "low";
  description: string;
  details: string;

  // For splits/bonuses: detected ratio
  suggested_ratio_from?: number;
  suggested_ratio_to?: number;

  // For demergers
  new_symbol?: string;
  new_isin?: string;

  // For renames
  old_symbol?: string;
  new_symbol_rename?: string;

  // Date range where the action likely occurred
  estimated_date_from?: string;
  estimated_date_to?: string;
}


/**
 * Detect corporate action anomalies from:
 * 1. The current batch of parsed trades (new import)
 * 2. Existing transactions already in the DB for this owner
 *
 * Detection signals:
 * - ISIN change for same symbol (split — face value change alters ISIN)
 * - Same ISIN across different symbols (rename)
 * - Price discontinuity > 40% between consecutive trades (split/bonus)
 * - Sell qty > buy qty after combining new + existing trades
 * - Sell-only symbol with no buys anywhere (demerger credit or pre-tradebook holding)
 */
export function detectAnomalies(
  newTrades: ParsedTrade[],
  existingTransactions: Array<{
    symbol: string;
    isin: string;
    type: string;
    quantity: number;
    price: number;
    date: string;
  }>
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  // Build combined trade list
  const allTrades: Array<{
    symbol: string;
    isin: string;
    type: "buy" | "sell";
    qty: number;
    price: number;
    date: string;
    source: "new" | "existing";
  }> = [];

  for (const t of existingTransactions) {
    allTrades.push({
      symbol: t.symbol,
      isin: t.isin,
      type: t.type.toLowerCase() as "buy" | "sell",
      qty: t.quantity,
      price: t.price,
      date: t.date,
      source: "existing",
    });
  }

  for (const t of newTrades) {
    allTrades.push({
      symbol: t.symbol,
      isin: t.isin,
      type: t.trade_type,
      qty: t.quantity,
      price: t.price,
      date: t.trade_date,
      source: "new",
    });
  }

  // Sort chronologically
  allTrades.sort((a, b) => a.date.localeCompare(b.date));

  // Group by symbol
  const bySymbol = new Map<string, typeof allTrades>();
  for (const t of allTrades) {
    const existing = bySymbol.get(t.symbol);
    if (existing) existing.push(t);
    else bySymbol.set(t.symbol, [t]);
  }

  // Track ISIN → symbols and symbol → ISINs
  const isinToSymbols = new Map<string, Set<string>>();
  const symbolToIsins = new Map<string, Set<string>>();

  for (const t of allTrades) {
    if (!isinToSymbols.has(t.isin)) isinToSymbols.set(t.isin, new Set());
    isinToSymbols.get(t.isin)!.add(t.symbol);

    if (!symbolToIsins.has(t.symbol)) symbolToIsins.set(t.symbol, new Set());
    symbolToIsins.get(t.symbol)!.add(t.isin);
  }

  // Detection 1: Symbol renames (same ISIN, different symbols)
  for (const [isin, symbols] of isinToSymbols) {
    if (symbols.size > 1) {
      const symArr = [...symbols].sort();
      // Find the chronological order
      const firstTrades = symArr.map((s) => {
        const trades = bySymbol.get(s) ?? [];
        return { symbol: s, firstDate: trades[0]?.date ?? "" };
      });
      firstTrades.sort((a, b) => a.firstDate.localeCompare(b.firstDate));

      const oldSym = firstTrades[0].symbol;
      const newSym = firstTrades[firstTrades.length - 1].symbol;

      anomalies.push({
        type: "SYMBOL_RENAME",
        symbol: oldSym,
        isin,
        confidence: "high",
        description: `Symbol renamed: ${oldSym} → ${newSym}`,
        details: `Both ${oldSym} and ${newSym} share ISIN ${isin}. This is a symbol rename — the stock is the same entity. Trades under both symbols will be linked.`,
        old_symbol: oldSym,
        new_symbol_rename: newSym,
      });
    }
  }

  // Detection 2: ISIN change for same symbol (indicates stock split — face value change)
  for (const [symbol, isins] of symbolToIsins) {
    if (isins.size > 1) {
      const trades = bySymbol.get(symbol) ?? [];
      // Find the transition point
      let oldIsin = "";
      let newIsin = "";
      let transitionDate = "";

      for (let i = 1; i < trades.length; i++) {
        if (trades[i].isin !== trades[i - 1].isin) {
          oldIsin = trades[i - 1].isin;
          newIsin = trades[i].isin;
          transitionDate = trades[i].date;
          break;
        }
      }

      if (oldIsin && newIsin) {
        // Look at price ratio to estimate split
        const preBefore = trades.filter(
          (t) => t.isin === oldIsin && t.type === "buy"
        );
        const postAfter = trades.filter(
          (t) => t.isin === newIsin && t.type === "buy"
        );

        let ratio = 0;
        if (preBefore.length > 0 && postAfter.length > 0) {
          const avgPre =
            preBefore.reduce((s, t) => s + t.price, 0) / preBefore.length;
          const avgPost =
            postAfter.reduce((s, t) => s + t.price, 0) / postAfter.length;
          if (avgPost > 0) ratio = Math.round(avgPre / avgPost);
        }

        anomalies.push({
          type: "STOCK_SPLIT",
          symbol,
          isin: oldIsin,
          confidence: "high",
          description: `${symbol}: ISIN changed ${oldIsin} → ${newIsin}${ratio > 1 ? ` (likely 1:${ratio} split)` : ""}`,
          details: `${symbol}'s ISIN changed from ${oldIsin} to ${newIsin} around ${transitionDate}. This typically indicates a stock split (face value change). ${ratio > 1 ? `Price ratio suggests a 1:${ratio} split.` : "Please check the split ratio."}`,
          suggested_ratio_from: ratio > 1 ? 1 : undefined,
          suggested_ratio_to: ratio > 1 ? ratio : undefined,
          estimated_date_from: trades
            .filter((t) => t.isin === oldIsin)
            .at(-1)?.date,
          estimated_date_to: transitionDate,
          new_isin: newIsin,
        });
      }
    }
  }

  // Detection 3: Price discontinuity within same symbol (split/bonus without ISIN change)
  for (const [symbol, trades] of bySymbol) {
    // Skip if already detected via ISIN change
    const isins = symbolToIsins.get(symbol);
    if (isins && isins.size > 1) continue;

    const buyTrades = trades
      .filter((t) => t.type === "buy" || t.type === "sell")
      .sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 1; i < buyTrades.length; i++) {
      const prev = buyTrades[i - 1];
      const curr = buyTrades[i];

      // Skip if same day (normal price variation)
      if (prev.date === curr.date) continue;

      const priceRatio = prev.price / curr.price;

      // Detect significant price drop (> 1.8x) suggesting split or bonus
      if (priceRatio >= 1.8 && prev.price > 50) {
        const roundedRatio = Math.round(priceRatio);

        // Check it's a clean-ish ratio (within 20% of a whole number)
        const deviation = Math.abs(priceRatio - roundedRatio) / roundedRatio;
        if (deviation > 0.2) continue;

        // Check this isn't already detected
        const alreadyDetected = anomalies.some(
          (a) => a.symbol === symbol && a.type === "STOCK_SPLIT"
        );
        if (alreadyDetected) continue;

        anomalies.push({
          type: "STOCK_SPLIT",
          symbol,
          isin: prev.isin,
          confidence: "medium",
          description: `Price dropped ${roundedRatio}x: ${symbol} ₹${prev.price.toFixed(0)} → ₹${curr.price.toFixed(0)}`,
          details: `${symbol} price dropped from ₹${prev.price.toFixed(2)} (${prev.date}) to ₹${curr.price.toFixed(2)} (${curr.date}), a ~${roundedRatio}x decrease. This likely indicates a 1:${roundedRatio} stock split or bonus issue.`,
          suggested_ratio_from: 1,
          suggested_ratio_to: roundedRatio,
          estimated_date_from: prev.date,
          estimated_date_to: curr.date,
        });
      }
    }
  }

  // Detection 4: Sell-only symbols (no buys at all — demerger credit or pre-tradebook)
  for (const [symbol, trades] of bySymbol) {
    const buys = trades.filter((t) => t.type === "buy");
    const sells = trades.filter((t) => t.type === "sell");

    if (buys.length === 0 && sells.length > 0) {
      const totalSellQty = sells.reduce((s, t) => s + t.qty, 0);

      // Check if this ISIN was involved in a rename (already handled)
      const isin = sells[0].isin;
      const symsForIsin = isinToSymbols.get(isin);
      if (symsForIsin && symsForIsin.size > 1) continue;

      anomalies.push({
        type: "DEMERGER",
        symbol,
        isin,
        confidence: "low",
        description: `${symbol}: ${totalSellQty} shares sold but never bought`,
        details: `${symbol} has ${sells.length} sell transaction(s) totaling ${totalSellQty} shares, but no buy transactions found. This could be: (1) shares received from a demerger of another company, (2) shares purchased before the earliest tradebook import, or (3) an off-market transfer. If this is a demerger, specify the parent company.`,
        new_symbol: symbol,
        new_isin: isin,
      });
    }
  }

  // Detection 5: Net negative holdings (sell > buy — incomplete history or corporate action)
  for (const [symbol, trades] of bySymbol) {
    const buys = trades.filter((t) => t.type === "buy");
    const sells = trades.filter((t) => t.type === "sell");

    // Skip sell-only (already handled in Detection 4)
    if (buys.length === 0) continue;

    const totalBuyQty = buys.reduce((s, t) => s + t.qty, 0);
    const totalSellQty = sells.reduce((s, t) => s + t.qty, 0);

    if (totalSellQty > totalBuyQty) {
      const deficit = totalSellQty - totalBuyQty;

      // Check if already detected as split/bonus
      const alreadyDetected = anomalies.some(
        (a) => a.symbol === symbol && (a.type === "STOCK_SPLIT" || a.type === "BONUS")
      );
      if (alreadyDetected) continue;

      // Try to determine if it's a bonus/split by looking at ratios
      const ratio = totalSellQty / totalBuyQty;
      const roundedRatio = Math.round(ratio);
      const isCleanRatio =
        roundedRatio >= 2 &&
        Math.abs(ratio - roundedRatio) / roundedRatio < 0.15;

      const isin = trades[0].isin;

      if (isCleanRatio) {
        // Likely a bonus or split
        const lastBuyPrice = [...buys].reverse()[0]?.price ?? 0;
        const firstSellAfterBuys = sells.find(
          (s) => s.date > (buys.at(-1)?.date ?? "")
        );
        const sellPrice = firstSellAfterBuys?.price ?? sells[0]?.price ?? 0;

        const priceRatio =
          sellPrice > 0 && lastBuyPrice > 0 ? lastBuyPrice / sellPrice : 0;

        if (priceRatio >= 1.5) {
          anomalies.push({
            type: "STOCK_SPLIT",
            symbol,
            isin,
            confidence: "medium",
            description: `${symbol}: sold ${totalSellQty} but only bought ${totalBuyQty} (${roundedRatio}x more sold)`,
            details: `${symbol} has ${totalSellQty} total sells vs ${totalBuyQty} total buys, a ${roundedRatio}x difference. Combined with a significant price decrease, this likely indicates a stock split or bonus issue. The additional ${deficit} shares were likely created by the corporate action.`,
            suggested_ratio_from: 1,
            suggested_ratio_to: roundedRatio,
          });
        } else {
          anomalies.push({
            type: "BONUS",
            symbol,
            isin,
            confidence: "medium",
            description: `${symbol}: sold ${totalSellQty} but only bought ${totalBuyQty} (possible bonus ${roundedRatio - 1}:1)`,
            details: `${symbol} has ${totalSellQty} total sells vs ${totalBuyQty} total buys. Price didn't drop proportionally, suggesting a bonus issue of ${roundedRatio - 1}:1 (${roundedRatio - 1} free shares for every 1 held). Or this could be incomplete trade history — import older tradebooks if available.`,
            suggested_ratio_from: roundedRatio - 1,
            suggested_ratio_to: 1,
          });
        }
      } else {
        // Not a clean ratio — likely just missing older tradebooks
        anomalies.push({
          type: "BONUS",
          symbol,
          isin,
          confidence: "low",
          description: `${symbol}: sold ${totalSellQty} but only bought ${totalBuyQty} (deficit: ${deficit})`,
          details: `${symbol} has more sells (${totalSellQty}) than buys (${totalBuyQty}) across all imported tradebooks. This is most likely due to: (1) older tradebooks not yet imported, (2) a bonus/split corporate action, or (3) off-market transfers. Import older tradebooks first, then check for corporate actions if the gap persists.`,
        });
      }
    }
  }

  log.info("Corporate action detection complete", {
    total_anomalies: anomalies.length,
    by_type: {
      splits: anomalies.filter((a) => a.type === "STOCK_SPLIT").length,
      bonus: anomalies.filter((a) => a.type === "BONUS").length,
      demerger: anomalies.filter((a) => a.type === "DEMERGER").length,
      rename: anomalies.filter((a) => a.type === "SYMBOL_RENAME").length,
    },
  });

  return anomalies;
}
