import type { TradebookAdapter, TradebookParseResult } from "./tradebook-types";
import {
  readSheetRows,
  isHoldingsRows,
  hasTradeTable,
  parseSheetRows,
  type TradebookMeta,
} from "./zerodha-tradebook-shared";

/** Extract the XLSX-only metadata block (Client ID + date range) that precedes
 *  the trade table in the Console Excel export. */
function extractXlsxMetadata(rows: unknown[][]): TradebookMeta {
  let client_id: string | null = null;
  let date_from: string | null = null;
  let date_to: string | null = null;

  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const c0 = String(row[0] ?? "").trim();
    if (c0 === "Client ID" && row[1] != null) client_id = String(row[1]).trim();
    const m = c0.match(/tradebook for equity from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i);
    if (m) {
      date_from = m[1];
      date_to = m[2];
    }
  }
  return { client_id, date_from, date_to };
}

/** Strategy: Zerodha Console tradebook exported as XLSX (an "Equity" sheet with
 *  a Client ID / date-range metadata block above the trade table). */
export const zerodhaTradebookAdapter: TradebookAdapter = {
  broker: "zerodha",
  displayName: "Zerodha (Kite/Console)",
  acceptedFileTypes: ".xlsx,.xls",
  description:
    "Upload your tradebook from Zerodha Console (Reports → Tradebook → Download as Excel)",

  canParse(buffer: ArrayBuffer): boolean {
    try {
      const rows = readSheetRows(buffer, "equity");
      if (!rows) return false; // no "Equity" sheet → not the XLSX export
      return !isHoldingsRows(rows) && hasTradeTable(rows);
    } catch {
      return false;
    }
  },

  parse(buffer: ArrayBuffer): TradebookParseResult {
    const rows = readSheetRows(buffer, "equity");
    if (!rows) {
      return {
        trades: [],
        metadata: { broker: "zerodha", client_id: null, account_label: null, date_from: null, date_to: null },
        errors: [{ message: "No 'Equity' sheet found.", severity: "error" }],
      };
    }
    return parseSheetRows(rows, extractXlsxMetadata(rows));
  },
};
