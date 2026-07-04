import * as XLSX from "xlsx";
import type {
  BrokerAdapter,
  HoldingsParseResult,
  ParsedHolding,
  ParseError,
} from "./types";

/**
 * Zerodha Holdings Statement Parser
 *
 * Supports: holdings-*.xlsx downloaded from Zerodha Console
 *   (Reports > Holdings > Download).
 * Format: Excel with an "Equity" sheet. Header rows carry the Client ID and
 * "Equity Holdings Statement as on YYYY-MM-DD", followed by a table:
 *   Symbol | ISIN | Sector | Quantity Available | Quantity Discrepant |
 *   Quantity Long Term | Quantity Pledged (Margin) | Quantity Pledged (Loan) |
 *   Average Price | Previous Closing Price | Unrealized P&L | Unrealized P&L Pct.
 *
 * Total owned quantity = Available + Pledged (Margin) + Pledged (Loan).
 * (Long Term is a subset of Available; Discrepant is unsettled and excluded.)
 */
const ISIN_RE = /^INE[A-Z0-9]{9}$/;

export const zerodhaHoldingsAdapter: BrokerAdapter = {
  broker: "zerodha",
  displayName: "Zerodha (Kite/Console)",
  acceptedFileTypes: ".xlsx,.xls",
  description:
    "Upload your holdings statement from Zerodha Console (Reports > Holdings > Download as Excel)",

  canParse(buffer: ArrayBuffer): boolean {
    try {
      const wb = XLSX.read(buffer, { type: "array" });
      const equityName = wb.SheetNames.find((s) => s.toLowerCase() === "equity");
      if (!equityName) return false;
      const ws = wb.Sheets[equityName];
      const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
      const head = data.slice(0, 20);
      const hasHoldingsTitle = head.some(
        (r) =>
          Array.isArray(r) &&
          typeof r[0] === "string" &&
          r[0].toLowerCase().includes("holdings statement")
      );
      const hasHoldingsHeader = head.some(
        (r) =>
          Array.isArray(r) &&
          r[0] === "Symbol" &&
          r[1] === "ISIN" &&
          r.some((c) => c === "Quantity Available")
      );
      return hasHoldingsTitle || hasHoldingsHeader;
    } catch {
      return false;
    }
  },

  parse(buffer: ArrayBuffer): HoldingsParseResult {
    const workbook = XLSX.read(buffer, { type: "array" });
    const errors: ParseError[] = [];

    const sheetName = workbook.SheetNames.find((s) => s.toLowerCase() === "equity");
    const emptyMeta = {
      broker: "zerodha" as const,
      client_id: null,
      account_label: null,
      statement_date: null,
    };
    if (!sheetName) {
      return {
        holdings: [],
        metadata: emptyMeta,
        errors: [
          { message: "No 'Equity' sheet found. Is this a Zerodha holdings statement?", severity: "error" },
        ],
      };
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

    // Metadata
    let clientId: string | null = null;
    let statementDate: string | null = null;
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i] as unknown[];
      if (!row || row[0] == null) continue;
      const c0 = String(row[0]).trim();
      if (c0 === "Client ID" && row[1] != null) clientId = String(row[1]).trim();
      const m = c0.match(/holdings statement as on\s+(\d{4}-\d{2}-\d{2})/i);
      if (m) statementDate = m[1];
    }
    const metadata = {
      broker: "zerodha" as const,
      client_id: clientId,
      account_label: clientId ? `${clientId} (Zerodha)` : null,
      statement_date: statementDate,
    };

    // Locate header row and build a column-name → index map (robust to layout shifts).
    const headerIdx = rows.findIndex(
      (r) => Array.isArray(r) && r[0] === "Symbol" && r[1] === "ISIN"
    );
    if (headerIdx < 0) {
      return {
        holdings: [],
        metadata,
        errors: [
          { message: "Could not find the holdings table header. Is this a valid Zerodha holdings statement?", severity: "error" },
        ],
      };
    }
    const header = (rows[headerIdx] as unknown[]).map((c) => String(c ?? "").trim());
    const col = (name: string) => header.findIndex((h) => h === name);
    const iSymbol = col("Symbol");
    const iIsin = col("ISIN");
    const iSector = col("Sector");
    const iAvail = col("Quantity Available");
    const iPledgeMargin = col("Quantity Pledged (Margin)");
    const iPledgeLoan = col("Quantity Pledged (Loan)");
    const iAvgPrice = col("Average Price");

    const num = (v: unknown): number => {
      const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, ""));
      return isNaN(n) ? 0 : n;
    };

    const holdings: ParsedHolding[] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      if (!row || row[iSymbol] == null || String(row[iSymbol]).trim() === "") continue;

      const symbol = String(row[iSymbol]).trim();
      const isin = String(row[iIsin] ?? "").trim();
      const sector = iSector >= 0 ? String(row[iSector] ?? "").trim() || null : null;
      const quantity =
        num(row[iAvail]) +
        (iPledgeMargin >= 0 ? num(row[iPledgeMargin]) : 0) +
        (iPledgeLoan >= 0 ? num(row[iPledgeLoan]) : 0);
      const avgPrice = num(row[iAvgPrice]);

      // Skip non-equity rows: debt (T-bills), "Others", discrepant-only, zero qty.
      if (!ISIN_RE.test(isin)) {
        errors.push({
          row: i + 1,
          symbol,
          message: `Skipping non-equity row (invalid/absent ISIN '${isin}')`,
          severity: "warning",
        });
        continue;
      }
      if (quantity <= 0) {
        errors.push({
          row: i + 1,
          symbol,
          message: "Skipping row with zero holding quantity",
          severity: "warning",
        });
        continue;
      }

      holdings.push({ symbol, isin, sector, quantity, avg_price: avgPrice });
    }

    if (holdings.length === 0) {
      errors.push({ message: "No equity holdings found in the statement.", severity: "error" });
    }

    return { holdings, metadata, errors };
  },
};
