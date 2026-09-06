import type { TradebookAdapter, TradebookParseResult } from "./tradebook-types";
import {
  readSheetRows,
  isHoldingsRows,
  hasTradeTable,
  parseSheetRows,
} from "./zerodha-tradebook-shared";

/**
 * Strategy: Zerodha Console tradebook exported as CSV.
 *
 * Differs from the XLSX export only in shape: a single (unnamed) sheet, the
 * trade-table header on the first row, and NO Client ID / date-range metadata
 * block. Account resolution recovers the client_id from the filename, and the
 * date range is derived from the trades — both handled by the shared core and
 * the import action. Everything else reuses zerodha-tradebook-shared.
 */
export const zerodhaCsvTradebookAdapter: TradebookAdapter = {
  broker: "zerodha",
  displayName: "Zerodha (CSV)",
  acceptedFileTypes: ".csv",
  description:
    "Upload your tradebook from Zerodha Console (Reports → Tradebook → Download as CSV)",

  canParse(buffer: ArrayBuffer): boolean {
    try {
      // CSV has no named "Equity" sheet — that's the XLSX strategy's signature.
      if (readSheetRows(buffer, "equity")) return false;
      const rows = readSheetRows(buffer, "first");
      if (!rows) return false;
      return !isHoldingsRows(rows) && hasTradeTable(rows);
    } catch {
      return false;
    }
  },

  parse(buffer: ArrayBuffer): TradebookParseResult {
    const rows = readSheetRows(buffer, "first");
    if (!rows) {
      return {
        trades: [],
        metadata: { broker: "zerodha", client_id: null, account_label: null, date_from: null, date_to: null },
        errors: [{ message: "Empty or unreadable CSV file.", severity: "error" }],
      };
    }
    // No metadata block in the CSV — client_id comes from the filename (caller).
    return parseSheetRows(rows, { client_id: null, date_from: null, date_to: null });
  },
};
