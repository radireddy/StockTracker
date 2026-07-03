import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { zerodhaHoldingsAdapter } from "@/lib/import/zerodha-holdings-parser";

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

type HoldingRow = {
  symbol: string;
  isin: string;
  sector?: string;
  available?: number;
  discrepant?: number;
  longTerm?: number;
  pledgeMargin?: number;
  pledgeLoan?: number;
  avgPrice?: number;
};

function row(h: HoldingRow): unknown[] {
  return [
    h.symbol,
    h.isin,
    h.sector ?? "",
    h.available ?? 0,
    h.discrepant ?? 0,
    h.longTerm ?? 0,
    h.pledgeMargin ?? 0,
    h.pledgeLoan ?? 0,
    h.avgPrice ?? 0,
    0,
    0,
    0,
  ];
}

function createHoldingsWorkbook(options: {
  holdings?: HoldingRow[];
  clientId?: string | null;
  statementLine?: string | null;
  sheetName?: string;
  includeHeader?: boolean;
}): ArrayBuffer {
  const {
    holdings = [],
    clientId = "YY7859",
    statementLine = "Equity Holdings Statement as on 2025-03-31",
    sheetName = "Equity",
    includeHeader = true,
  } = options;

  const rows: unknown[][] = [];
  if (clientId !== null) rows.push(["Client ID", clientId]);
  if (statementLine !== null) rows.push([statementLine]);
  rows.push([]);
  if (includeHeader) rows.push(HEADER);
  for (const h of holdings) rows.push(row(h));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

describe("zerodhaHoldingsAdapter.canParse", () => {
  it("accepts a valid holdings statement", () => {
    const buf = createHoldingsWorkbook({
      holdings: [{ symbol: "RELIANCE", isin: "INE002A01018", available: 10, avgPrice: 2500 }],
    });
    expect(zerodhaHoldingsAdapter.canParse(buf)).toBe(true);
  });

  it("accepts a statement detected by the header row alone", () => {
    const buf = createHoldingsWorkbook({ statementLine: null });
    expect(zerodhaHoldingsAdapter.canParse(buf)).toBe(true);
  });

  it("rejects a workbook without an Equity sheet", () => {
    const buf = createHoldingsWorkbook({ sheetName: "Tradebook" });
    expect(zerodhaHoldingsAdapter.canParse(buf)).toBe(false);
  });

  it("rejects an invalid buffer", () => {
    expect(zerodhaHoldingsAdapter.canParse(new ArrayBuffer(8))).toBe(false);
  });
});

describe("zerodhaHoldingsAdapter.parse — metadata", () => {
  it("extracts client id, account label and statement date", () => {
    const buf = createHoldingsWorkbook({
      holdings: [{ symbol: "RELIANCE", isin: "INE002A01018", available: 10, avgPrice: 2500 }],
    });
    const { metadata } = zerodhaHoldingsAdapter.parse(buf);
    expect(metadata.broker).toBe("zerodha");
    expect(metadata.client_id).toBe("YY7859");
    expect(metadata.account_label).toBe("YY7859 (Zerodha)");
    expect(metadata.statement_date).toBe("2025-03-31");
  });

  it("leaves account_label null when there is no client id", () => {
    const buf = createHoldingsWorkbook({
      clientId: null,
      holdings: [{ symbol: "RELIANCE", isin: "INE002A01018", available: 10, avgPrice: 2500 }],
    });
    const { metadata } = zerodhaHoldingsAdapter.parse(buf);
    expect(metadata.client_id).toBeNull();
    expect(metadata.account_label).toBeNull();
  });
});

describe("zerodhaHoldingsAdapter.parse — holdings", () => {
  it("parses a single holding with its fields", () => {
    const buf = createHoldingsWorkbook({
      holdings: [
        { symbol: "RELIANCE", isin: "INE002A01018", sector: "Energy", available: 10, avgPrice: 2500 },
      ],
    });
    const { holdings, errors } = zerodhaHoldingsAdapter.parse(buf);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toEqual({
      symbol: "RELIANCE",
      isin: "INE002A01018",
      sector: "Energy",
      quantity: 10,
      avg_price: 2500,
    });
    expect(errors).toHaveLength(0);
  });

  it("sums available + pledged (margin) + pledged (loan) for total quantity", () => {
    const buf = createHoldingsWorkbook({
      holdings: [
        {
          symbol: "TCS",
          isin: "INE467B01029",
          available: 5,
          longTerm: 3, // subset of available — must NOT be added
          pledgeMargin: 2,
          pledgeLoan: 1,
          avgPrice: 3500,
        },
      ],
    });
    const { holdings } = zerodhaHoldingsAdapter.parse(buf);
    expect(holdings[0].quantity).toBe(8); // 5 + 2 + 1
  });

  it("skips rows with an invalid/absent ISIN and records a warning", () => {
    const buf = createHoldingsWorkbook({
      holdings: [
        { symbol: "LIQUIDCASE", isin: "", available: 100, avgPrice: 10 }, // e.g. a debt/Others row
        { symbol: "INFY", isin: "INE009A01021", available: 20, avgPrice: 1500 },
      ],
    });
    const { holdings, errors } = zerodhaHoldingsAdapter.parse(buf);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].symbol).toBe("INFY");
    expect(errors.some((e) => e.symbol === "LIQUIDCASE" && e.severity === "warning")).toBe(true);
  });

  it("skips rows with zero total quantity and records a warning", () => {
    const buf = createHoldingsWorkbook({
      holdings: [{ symbol: "WIPRO", isin: "INE075A01022", available: 0, avgPrice: 400 }],
    });
    const { holdings, errors } = zerodhaHoldingsAdapter.parse(buf);
    expect(holdings).toHaveLength(0);
    expect(errors.some((e) => e.symbol === "WIPRO" && e.message.toLowerCase().includes("zero"))).toBe(true);
  });

  it("returns an error when there are no equity holdings", () => {
    const buf = createHoldingsWorkbook({ holdings: [] });
    const { holdings, errors } = zerodhaHoldingsAdapter.parse(buf);
    expect(holdings).toHaveLength(0);
    expect(errors.some((e) => e.severity === "error")).toBe(true);
  });

  it("returns an error when the Equity sheet is missing", () => {
    const buf = createHoldingsWorkbook({ sheetName: "Something" });
    const { holdings, errors } = zerodhaHoldingsAdapter.parse(buf);
    expect(holdings).toHaveLength(0);
    expect(errors[0].message).toMatch(/Equity/i);
  });

  it("returns an error when the header row is absent", () => {
    const buf = createHoldingsWorkbook({ includeHeader: false });
    const { holdings, errors } = zerodhaHoldingsAdapter.parse(buf);
    expect(holdings).toHaveLength(0);
    expect(errors.some((e) => e.message.toLowerCase().includes("header"))).toBe(true);
  });
});
