import * as XLSX from "xlsx";
import type { TradebookAdapter, TradebookParseResult, ParsedTrade } from "./tradebook-types";
import { MAX_TRADES_PER_IMPORT } from "./tradebook-types";
import type { ParseError } from "./types";

export const zerodhaTradebookAdapter: TradebookAdapter = {
  broker: "zerodha",
  displayName: "Zerodha (Kite/Console)",
  acceptedFileTypes: ".xlsx,.xls",
  description:
    "Upload your tradebook from Zerodha Console (Reports → Tradebook → Download as Excel)",

  canParse(buffer: ArrayBuffer): boolean {
    try {
      const wb = XLSX.read(buffer, { type: "array" });
      const sheetName = wb.SheetNames.find((s) => s.toLowerCase() === "equity");
      if (!sheetName) return false;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        defval: null,
      }) as unknown[][];
      const head = rows.slice(0, 20);
      // Reject holdings files
      const isHoldings = head.some(
        (r) =>
          Array.isArray(r) &&
          typeof r[0] === "string" &&
          r[0].toLowerCase().includes("holdings statement")
      );
      if (isHoldings) return false;
      const hasTradebook = head.some(
        (r) =>
          Array.isArray(r) &&
          typeof r[0] === "string" &&
          r[0].toLowerCase().includes("tradebook for equity")
      );
      const hasTradeIdCol = head.some(
        (r) => Array.isArray(r) && (r as string[]).includes("Trade ID")
      );
      return hasTradebook || hasTradeIdCol;
    } catch {
      return false;
    }
  },

  parse(buffer: ArrayBuffer): TradebookParseResult {
    const wb = XLSX.read(buffer, { type: "array" });
    const errors: ParseError[] = [];
    const emptyMeta = {
      broker: "zerodha" as const,
      client_id: null,
      account_label: null,
      date_from: null,
      date_to: null,
    };

    const sheetName = wb.SheetNames.find((s) => s.toLowerCase() === "equity");
    if (!sheetName) {
      return {
        trades: [],
        metadata: emptyMeta,
        errors: [{ message: "No 'Equity' sheet found.", severity: "error" }],
      };
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
    }) as unknown[][];

    // Extract metadata from first 20 rows
    let clientId: string | null = null;
    let dateFrom: string | null = null;
    let dateTo: string | null = null;

    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const c0 = String(row[0] ?? "").trim();
      if (c0 === "Client ID" && row[1] != null) {
        clientId = String(row[1]).trim();
      }
      const m = c0.match(
        /tradebook for equity from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i
      );
      if (m) {
        dateFrom = m[1];
        dateTo = m[2];
      }
    }

    const metadata = {
      broker: "zerodha" as const,
      client_id: clientId,
      account_label: clientId ? `${clientId} (Zerodha)` : null,
      date_from: dateFrom,
      date_to: dateTo,
    };

    // Find data header row (has both "Symbol" and "Trade ID")
    const headerIdx = rows.findIndex(
      (r) =>
        Array.isArray(r) &&
        r[0] === "Symbol" &&
        (r as string[]).includes("Trade ID")
    );
    if (headerIdx < 0) {
      return {
        trades: [],
        metadata,
        errors: [
          { message: "Could not find the trade table header row.", severity: "error" },
        ],
      };
    }

    const header = (rows[headerIdx] as string[]).map((c) => String(c ?? "").trim());
    const col = (name: string) => header.indexOf(name);

    const iSymbol   = col("Symbol");
    const iIsin     = col("ISIN");
    const iDate     = col("Trade Date");
    const iExchange = col("Exchange");
    const iSegment  = col("Segment");
    const iSeries   = col("Series");
    const iType     = col("Trade Type");
    const iAuction  = col("Auction");
    const iQty      = col("Quantity");
    const iPrice    = col("Price");
    const iTradeId  = col("Trade ID");
    const iOrderId  = col("Order ID");
    const iExecTime = col("Order Execution Time");

    const toNum = (v: unknown): number => {
      if (typeof v === "number") return v;
      const n = parseFloat(String(v ?? "").replace(/,/g, ""));
      return isNaN(n) ? 0 : n;
    };

    // Count data rows first for the limit check
    const dataRows = rows.slice(headerIdx + 1).filter(
      (r) => Array.isArray(r) && r[iSymbol] != null && String(r[iSymbol]).trim() !== ""
    );
    if (dataRows.length > MAX_TRADES_PER_IMPORT) {
      return {
        trades: [],
        metadata,
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

      const symbol  = String(row[iSymbol]).trim();
      const segment = String(row[iSegment] ?? "").trim().toUpperCase();
      const qty     = toNum(row[iQty]);

      if (segment !== "EQ") {
        errors.push({
          row: i + 1,
          symbol,
          message: `Skipping non-equity segment '${segment}'`,
          severity: "warning",
        });
        continue;
      }
      if (qty <= 0) {
        errors.push({
          row: i + 1,
          symbol,
          message: "Skipping row with zero quantity",
          severity: "warning",
        });
        continue;
      }

      // Parse date — xlsx stores dates as Excel serial numbers or ISO strings
      const rawDate = row[iDate];
      let tradeDate: string;
      if (typeof rawDate === "number") {
        tradeDate = XLSX.SSF.format("yyyy-mm-dd", rawDate);
      } else {
        tradeDate = String(rawDate ?? "").slice(0, 10);
      }

      // Parse execution timestamp
      const rawExecTime = row[iExecTime];
      let executedAt: string | null = null;
      if (rawExecTime != null) {
        if (typeof rawExecTime === "number") {
          // Excel serial → JS Date → ISO string
          executedAt = new Date((rawExecTime - 25569) * 86400 * 1000).toISOString();
        } else {
          executedAt = String(rawExecTime);
        }
      }

      const tradeType = String(row[iType] ?? "").toLowerCase().trim();
      if (tradeType !== "buy" && tradeType !== "sell") {
        errors.push({
          row: i + 1,
          symbol,
          message: `Unknown trade type '${row[iType]}'`,
          severity: "warning",
        });
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
        is_auction:
          row[iAuction] === true ||
          String(row[iAuction] ?? "").toLowerCase() === "true",
        quantity: qty,
        price: toNum(row[iPrice]),
        broker_trade_id: String(row[iTradeId] ?? "").trim(),
        broker_order_id: row[iOrderId] != null ? String(row[iOrderId]).trim() : null,
        executed_at: executedAt,
      });
    }

    return { trades, metadata, errors };
  },
};
