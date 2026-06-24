import * as XLSX from "xlsx";
import type {
  BrokerAdapter,
  BrokerParseResult,
  ParsedTrade,
  ParseError,
} from "./types";

/**
 * Zerodha Tradebook Parser
 *
 * Supports: tradebook-*.xlsx files downloaded from Zerodha Console
 * Format: Excel with "Equity" sheet, header rows before data table
 * Columns: Symbol, ISIN, Trade Date, Exchange, Segment, Series,
 *          Trade Type, Auction, Quantity, Price, Trade ID, Order ID,
 *          Order Execution Time
 */
export const zerodhaAdapter: BrokerAdapter = {
  broker: "zerodha",
  displayName: "Zerodha (Kite/Console)",
  acceptedFileTypes: ".xlsx,.xls",
  description:
    "Upload your tradebook from Zerodha Console (Reports > Tradebook > Download as Excel)",

  canParse(buffer: ArrayBuffer): boolean {
    try {
      const wb = XLSX.read(buffer, { type: "array" });
      // Zerodha tradebooks have an "Equity" sheet
      if (!wb.SheetNames.some((s) => s.toLowerCase() === "equity"))
        return false;

      const ws = wb.Sheets[wb.SheetNames.find((s) => s.toLowerCase() === "equity")!];
      const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
      // Look for "Client ID" in early rows and "Symbol" header
      const hasClientId = data
        .slice(0, 20)
        .some((r) => Array.isArray(r) && r[0] === "Client ID");
      const hasSymbolHeader = data
        .slice(0, 20)
        .some((r) => Array.isArray(r) && r[0] === "Symbol" && r[1] === "ISIN");
      return hasClientId || hasSymbolHeader;
    } catch {
      return false;
    }
  },

  parse(buffer: ArrayBuffer): BrokerParseResult {
    const workbook = XLSX.read(buffer, { type: "array" });
    const errors: ParseError[] = [];

    const sheetName = workbook.SheetNames.find(
      (s) => s.toLowerCase() === "equity"
    );
    if (!sheetName) {
      return {
        trades: [],
        metadata: {
          broker: "zerodha",
          client_id: null,
          account_label: null,
          date_range: null,
        },
        errors: [
          {
            message:
              "No 'Equity' sheet found. Is this a Zerodha tradebook?",
            severity: "error",
          },
        ],
      };
    }

    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

    // Extract metadata
    let clientId: string | null = null;
    let dateRange: string | null = null;

    for (let i = 0; i < Math.min(20, rawData.length); i++) {
      const row = rawData[i] as unknown[];
      if (!row || !row[0]) continue;
      const cell0 = String(row[0]);

      if (cell0 === "Client ID" && row[1]) {
        clientId = String(row[1]);
      }
      if (cell0.startsWith("Tradebook for Equity from")) {
        dateRange = cell0;
      }
    }

    // Find header row
    const headerIdx = rawData.findIndex(
      (r) => Array.isArray(r) && r[0] === "Symbol"
    );
    if (headerIdx < 0) {
      return {
        trades: [],
        metadata: {
          broker: "zerodha",
          client_id: clientId,
          account_label: clientId
            ? `${clientId} (Zerodha)`
            : null,
          date_range: dateRange,
        },
        errors: [
          {
            message:
              "Could not find header row. Is this a valid Zerodha tradebook?",
            severity: "error",
          },
        ],
      };
    }

    // Parse trades
    const trades: ParsedTrade[] = [];
    for (let i = headerIdx + 1; i < rawData.length; i++) {
      const row = rawData[i] as unknown[];
      if (!row || !row[0] || String(row[0]).trim() === "") continue;

      const symbol = String(row[0]).trim();
      const isin = String(row[1] ?? "").trim();
      const tradeDateRaw = row[2];
      const exchange = String(row[3] ?? "").trim();
      const segment = String(row[4] ?? "").trim();
      const tradeTypeRaw = String(row[6] ?? "").trim().toLowerCase();
      const auction =
        row[7] === true || String(row[7]).toLowerCase() === "true";
      const quantity = Number(row[8]);
      const price = Number(row[9]);
      const tradeId = String(row[10] ?? "").trim();
      const orderId = String(row[11] ?? "").trim();
      const executionTimeRaw = row[12];

      // Validate
      if (!symbol || !isin) {
        errors.push({
          row: i + 1,
          symbol,
          message: "Missing symbol or ISIN",
          severity: "error",
        });
        continue;
      }

      if (!isin.match(/^INE[A-Z0-9]{9}$/)) {
        errors.push({
          row: i + 1,
          symbol,
          message: `Invalid ISIN format '${isin}'`,
          severity: "error",
        });
        continue;
      }

      if (tradeTypeRaw !== "buy" && tradeTypeRaw !== "sell") {
        errors.push({
          row: i + 1,
          symbol,
          message: `Invalid trade type '${tradeTypeRaw}'`,
          severity: "error",
        });
        continue;
      }

      if (isNaN(quantity) || quantity <= 0) {
        errors.push({
          row: i + 1,
          symbol,
          message: `Invalid quantity '${row[8]}'`,
          severity: "error",
        });
        continue;
      }

      if (isNaN(price) || price < 0) {
        errors.push({
          row: i + 1,
          symbol,
          message: `Invalid price '${row[9]}'`,
          severity: "error",
        });
        continue;
      }

      if (!tradeId) {
        errors.push({
          row: i + 1,
          symbol,
          message: "Missing trade ID",
          severity: "error",
        });
        continue;
      }

      // Skip auction trades
      if (auction) {
        errors.push({
          row: i + 1,
          symbol,
          message: "Skipping auction trade",
          severity: "warning",
        });
        continue;
      }

      // Only process EQ segment
      if (segment !== "EQ") {
        errors.push({
          row: i + 1,
          symbol,
          message: `Skipping non-equity segment '${segment}'`,
          severity: "warning",
        });
        continue;
      }

      // Parse trade date
      const tradeDate = parseDate(tradeDateRaw);
      if (!tradeDate) {
        errors.push({
          row: i + 1,
          symbol,
          message: `Invalid trade date '${tradeDateRaw}'`,
          severity: "error",
        });
        continue;
      }

      // Parse execution time
      const executionTime = parseDateTime(executionTimeRaw) ?? tradeDate;

      trades.push({
        symbol,
        isin,
        trade_date: tradeDate,
        exchange,
        trade_type: tradeTypeRaw as "buy" | "sell",
        quantity,
        price,
        trade_id: tradeId,
        order_id: orderId,
        execution_time: executionTime,
      });
    }

    return {
      trades,
      metadata: {
        broker: "zerodha",
        client_id: clientId,
        account_label: clientId ? `${clientId} (Zerodha)` : null,
        date_range: dateRange,
      },
      errors,
    };
  },
};

function parseDate(raw: unknown): string | null {
  if (typeof raw === "string" && raw.match(/^\d{4}-\d{2}-\d{2}/)) {
    return raw.slice(0, 10);
  }
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return null;
}

function parseDateTime(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}T${String(d.H).padStart(2, "0")}:${String(d.M).padStart(2, "0")}:${String(d.S).padStart(2, "0")}`;
  }
  return null;
}
