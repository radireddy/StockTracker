import * as XLSX from "xlsx";
import type { TradebookParseResult, ParsedTrade } from "./tradebook-types";
import { MAX_TRADES_PER_IMPORT } from "./tradebook-types";
import type { ParseError } from "./types";

/**
 * Format-agnostic Zerodha tradebook core, shared by the XLSX and CSV strategies.
 *
 * The two Console exports differ only in (a) which worksheet holds the table and
 * (b) whether a metadata block (Client ID / date range) precedes it. Everything
 * below — header detection, per-row trade building, blank-ISIN recovery, date
 * derivation — is identical, so it lives here and each strategy supplies only
 * what differs.
 */

/** Normalize a header cell so "Trade Date" and "trade_date" both become
 *  "tradedate" — lets one column map serve both Title-Case and snake_case. */
export const norm = (v: unknown): string =>
  String(v ?? "").toLowerCase().replace(/[\s_]+/g, "");

export interface TradebookMeta {
  client_id: string | null;
  date_from: string | null;
  date_to: string | null;
}

/** Read a worksheet as a 2-D array of cells. `null` if the sheet is absent. */
export function readSheetRows(
  buffer: ArrayBuffer,
  sheet: "equity" | "first"
): unknown[][] | null {
  const wb = XLSX.read(buffer, { type: "array" });
  const name =
    sheet === "equity"
      ? wb.SheetNames.find((s) => s.toLowerCase() === "equity")
      : wb.SheetNames[0];
  if (!name) return null;
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
    header: 1,
    defval: null,
  }) as unknown[][];
}

/** True if the file is a holdings statement (not a tradebook). */
export function isHoldingsRows(rows: unknown[][]): boolean {
  return rows.slice(0, 20).some(
    (r) =>
      Array.isArray(r) &&
      typeof r[0] === "string" &&
      r[0].toLowerCase().includes("holdings statement")
  );
}

/** True if any of the first rows is a trade-table header (Symbol + Trade ID). */
export function hasTradeTable(rows: unknown[][]): boolean {
  return rows.slice(0, 20).some(
    (r) =>
      Array.isArray(r) &&
      r.some((c) => norm(c) === "symbol") &&
      r.some((c) => norm(c) === "tradeid")
  );
}

/** Index of the trade-table header row (Symbol + Trade ID), or -1. */
export function findHeaderIndex(rows: unknown[][]): number {
  return rows.findIndex(
    (r) =>
      Array.isArray(r) &&
      r.some((c) => norm(c) === "symbol") &&
      r.some((c) => norm(c) === "tradeid")
  );
}

function deriveDateRange(trades: ParsedTrade[]): { from: string | null; to: string | null } {
  const dates = trades.map((t) => t.trade_date).filter(Boolean).sort();
  return dates.length
    ? { from: dates[0], to: dates[dates.length - 1] }
    : { from: null, to: null };
}

/**
 * Build the parse result from a worksheet's rows and pre-extracted metadata.
 * Handles the trade limit, EQ/qty/type filtering, date & timestamp parsing,
 * blank-ISIN recovery, and fills date_from/date_to from the trades when the
 * metadata lacks them (the CSV export has no date-range block).
 */
export function parseSheetRows(rows: unknown[][], meta: TradebookMeta): TradebookParseResult {
  const errors: ParseError[] = [];

  const buildMeta = (date_from: string | null, date_to: string | null) => ({
    broker: "zerodha" as const,
    client_id: meta.client_id,
    account_label: meta.client_id ? `${meta.client_id} (Zerodha)` : null,
    date_from,
    date_to,
  });

  const headerIdx = findHeaderIndex(rows);
  if (headerIdx < 0) {
    return {
      trades: [],
      metadata: buildMeta(meta.date_from, meta.date_to),
      errors: [{ message: "Could not find the trade table header row.", severity: "error" }],
    };
  }

  const header = (rows[headerIdx] as unknown[]).map(norm);
  const col = (name: string) => header.indexOf(norm(name));

  const iSymbol = col("Symbol");
  const iIsin = col("ISIN");
  const iDate = col("Trade Date");
  const iExchange = col("Exchange");
  const iSegment = col("Segment");
  const iSeries = col("Series");
  const iType = col("Trade Type");
  const iAuction = col("Auction");
  const iQty = col("Quantity");
  const iPrice = col("Price");
  const iTradeId = col("Trade ID");
  const iOrderId = col("Order ID");
  const iExecTime = col("Order Execution Time");

  const toNum = (v: unknown): number => {
    if (typeof v === "number") return v;
    const n = parseFloat(String(v ?? "").replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  };

  const dataRows = rows.slice(headerIdx + 1).filter(
    (r) => Array.isArray(r) && r[iSymbol] != null && String(r[iSymbol]).trim() !== ""
  );
  if (dataRows.length > MAX_TRADES_PER_IMPORT) {
    return {
      trades: [],
      metadata: buildMeta(meta.date_from, meta.date_to),
      errors: [
        {
          message: `File contains ${dataRows.length.toLocaleString()} trades, exceeding the limit of 10,000 per import. Split into smaller date ranges.`,
          severity: "error",
        },
      ],
    };
  }

  const trades: ParsedTrade[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row[iSymbol] == null || String(row[iSymbol]).trim() === "") {
      continue;
    }

    const symbol = String(row[iSymbol]).trim();
    const segment = String(row[iSegment] ?? "").trim().toUpperCase();
    const qty = toNum(row[iQty]);

    if (segment !== "EQ") {
      errors.push({ row: i + 1, symbol, message: `Skipping non-equity segment '${segment}'`, severity: "warning" });
      continue;
    }
    if (qty <= 0) {
      errors.push({ row: i + 1, symbol, message: "Skipping row with zero quantity", severity: "warning" });
      continue;
    }

    // Date — xlsx yields an Excel serial (numeric) or an ISO-ish string.
    const rawDate = row[iDate];
    const tradeDate =
      typeof rawDate === "number"
        ? XLSX.SSF.format("yyyy-mm-dd", rawDate)
        : String(rawDate ?? "").slice(0, 10);

    // Execution timestamp — serial or string.
    const rawExecTime = row[iExecTime];
    let executedAt: string | null = null;
    if (rawExecTime != null) {
      executedAt =
        typeof rawExecTime === "number"
          ? new Date((rawExecTime - 25569) * 86400 * 1000).toISOString()
          : String(rawExecTime);
    }

    const tradeType = String(row[iType] ?? "").toLowerCase().trim();
    if (tradeType !== "buy" && tradeType !== "sell") {
      errors.push({ row: i + 1, symbol, message: `Unknown trade type '${row[iType]}'`, severity: "warning" });
      continue;
    }

    trades.push({
      symbol,
      isin: String(row[iIsin] ?? "").trim(),
      trade_date: tradeDate,
      exchange: String(row[iExchange] ?? "NSE").trim(),
      segment,
      series: row[iSeries] != null ? String(row[iSeries]).trim() : null,
      trade_type: tradeType as "buy" | "sell",
      is_auction: row[iAuction] === true || String(row[iAuction] ?? "").toLowerCase() === "true",
      quantity: qty,
      price: toNum(row[iPrice]),
      broker_trade_id: String(row[iTradeId] ?? "").trim(),
      broker_order_id: row[iOrderId] != null ? String(row[iOrderId]).trim() : null,
      executed_at: executedAt,
    });
  }

  // Zerodha leaves a blank ISIN on some BSE / Series 'A' rows. Recover it from
  // another trade of the same symbol so FIFO can match buy↔sell (an unmatched
  // leg would otherwise show as a phantom open position forever).
  const isinBySymbol = new Map<string, string>();
  for (const t of trades) if (t.isin) isinBySymbol.set(t.symbol, t.isin);
  let backfilled = 0;
  for (const t of trades) {
    if (!t.isin) {
      const resolved = isinBySymbol.get(t.symbol);
      if (resolved) {
        t.isin = resolved;
        backfilled++;
      }
    }
  }
  if (backfilled > 0) {
    errors.push({
      message: `Recovered a missing ISIN for ${backfilled} row${backfilled !== 1 ? "s" : ""} from other trades of the same symbol.`,
      severity: "warning",
    });
  }

  // Fill the date range from the trades when the export has no date block (CSV).
  const derived = deriveDateRange(trades);
  return {
    trades,
    metadata: buildMeta(meta.date_from ?? derived.from, meta.date_to ?? derived.to),
    errors,
  };
}
