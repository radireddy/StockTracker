import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseStatementBuffer } from "@/lib/import/parse-statement";
import { MAX_HOLDINGS_PER_IMPORT } from "@/lib/import/types";

const HEADER = [
  "Symbol",
  "ISIN",
  "Sector",
  "Quantity Available",
  "Quantity Discrepant",
  "Quantity Long Term",
  "Quantity Pledged (Margin)",
  "Quantity Pledged (Loan)",
  "Average Price",
  "Previous Closing Price",
  "Unrealized P&L",
  "Unrealized P&L Pct.",
];

function holdingRow(symbol: string, isin: string, qty = 10, avg = 100): unknown[] {
  return [symbol, isin, "IT", qty, 0, 0, 0, 0, avg, 0, 0, 0];
}

function workbook(holdings: unknown[][], sheetName = "Equity", clientId: string | null = "YY7859"): ArrayBuffer {
  const rows: unknown[][] = [];
  if (clientId !== null) rows.push(["Client ID", clientId]);
  rows.push(["Equity Holdings Statement as on 2025-03-31"]);
  rows.push([]);
  rows.push(HEADER);
  rows.push(...holdings);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

describe("parseStatementBuffer", () => {
  it("parses a valid statement", () => {
    const buf = workbook([holdingRow("RELIANCE", "INE002A01018")]);
    const res = parseStatementBuffer(buf, "zerodha");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.adapter.broker).toBe("zerodha");
      expect(res.parseResult.holdings).toHaveLength(1);
      expect(res.parseResult.metadata.client_id).toBe("YY7859");
    }
  });

  it("auto-detects the broker when no hint is given", () => {
    const buf = workbook([holdingRow("TCS", "INE467B01029")]);
    const res = parseStatementBuffer(buf, null);
    expect(res.ok).toBe(true);
  });

  it("rejects a non-zip buffer", () => {
    const res = parseStatementBuffer(new ArrayBuffer(8), "zerodha");
    expect(res).toEqual({ ok: false, status: 400, error: "Invalid file format. Please upload a valid .xlsx file." });
  });

  it("rejects a file over the size cap", () => {
    // Valid zip magic bytes, but padded past the 5MB limit.
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set([0x50, 0x4b, 0x03, 0x04]);
    const res = parseStatementBuffer(big.buffer, "zerodha");
    expect(res).toEqual({ ok: false, status: 400, error: "File too large. Maximum import file size is 5MB." });
  });

  it("rejects when the broker format is unidentifiable (auto-detect)", () => {
    // Zip header + garbage → detectBroker finds no adapter.
    const bogus = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    const res = parseStatementBuffer(bogus.buffer, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Could not identify the broker/);
  });

  it("surfaces a parse failure with a friendly message", () => {
    // Valid zip header but not a real workbook → adapter.parse throws.
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
    const res = parseStatementBuffer(corrupt.buffer, "zerodha");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Failed to parse/);
  });

  it("rejects a statement with no equity holdings", () => {
    const buf = workbook([]);
    const res = parseStatementBuffer(buf, "zerodha");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("rejects a statement exceeding the per-import stock limit", () => {
    const many = Array.from({ length: MAX_HOLDINGS_PER_IMPORT + 1 }, (_, i) =>
      holdingRow(`S${i}`, `INE${String(i).padStart(9, "0")}`)
    );
    const res = parseStatementBuffer(workbook(many), "zerodha");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/exceeds the current limit/);
  });
});
