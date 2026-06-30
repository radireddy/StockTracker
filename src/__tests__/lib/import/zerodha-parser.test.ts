import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
import { zerodhaAdapter } from "@/lib/import/zerodha-parser";

function createZerodhaWorkbook(options: {
  trades?: Array<{
    symbol: string;
    isin: string;
    date: string | number;
    exchange?: string;
    segment?: string;
    series?: string;
    tradeType: string;
    auction?: boolean;
    quantity: number;
    price: number;
    tradeId: string;
    orderId?: string;
    executionTime?: string | number;
  }>;
  clientId?: string | null;
  dateRange?: string | null;
  sheetName?: string;
  includeHeader?: boolean;
}): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const rows: unknown[][] = [];

  // Add Client ID row
  if (options.clientId !== null) {
    rows.push(["Client ID", options.clientId ?? "YY7859"]);
  }

  // Add date range row
  if (options.dateRange !== null) {
    rows.push([options.dateRange ?? "Tradebook for Equity from 01-01-2024 to 31-12-2024"]);
  }

  // Add some blank rows
  rows.push([]);

  // Header row
  if (options.includeHeader !== false) {
    rows.push(["Symbol", "ISIN", "Trade Date", "Exchange", "Segment", "Series", "Trade Type", "Auction", "Quantity", "Price", "Trade ID", "Order ID", "Order Execution Time"]);
  }

  // Data rows
  for (const trade of options.trades ?? []) {
    rows.push([
      trade.symbol,
      trade.isin,
      trade.date,
      trade.exchange ?? "NSE",
      trade.segment ?? "EQ",
      trade.series ?? "EQ",
      trade.tradeType,
      trade.auction ?? false,
      trade.quantity,
      trade.price,
      trade.tradeId,
      trade.orderId ?? "O001",
      trade.executionTime ?? "2024-01-15T10:30:00",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, options.sheetName ?? "Equity");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return buf;
}

describe("zerodhaAdapter", () => {
  describe("metadata", () => {
    it("has correct broker info", () => {
      expect(zerodhaAdapter.broker).toBe("zerodha");
      expect(zerodhaAdapter.displayName).toBe("Zerodha (Kite/Console)");
      expect(zerodhaAdapter.acceptedFileTypes).toBe(".xlsx,.xls");
      expect(zerodhaAdapter.description).toBeTruthy();
    });
  });

  describe("canParse", () => {
    it("returns true for valid Zerodha tradebook", () => {
      const buffer = createZerodhaWorkbook({ trades: [] });
      expect(zerodhaAdapter.canParse(buffer)).toBe(true);
    });

    it("returns false when no Equity sheet", () => {
      const buffer = createZerodhaWorkbook({ sheetName: "F&O", trades: [] });
      expect(zerodhaAdapter.canParse(buffer)).toBe(false);
    });

    it("returns false for invalid buffer", () => {
      const buffer = new ArrayBuffer(8);
      expect(zerodhaAdapter.canParse(buffer)).toBe(false);
    });

    it("returns false for empty buffer", () => {
      const buffer = new ArrayBuffer(0);
      expect(zerodhaAdapter.canParse(buffer)).toBe(false);
    });

    it("returns true when Symbol header found without Client ID", () => {
      const buffer = createZerodhaWorkbook({ clientId: null, trades: [] });
      expect(zerodhaAdapter.canParse(buffer)).toBe(true);
    });
  });

  describe("parse", () => {
    it("parses valid trades", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INE002A01018",
            date: "2024-01-15",
            tradeType: "buy",
            quantity: 10,
            price: 2500,
            tradeId: "T001",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].symbol).toBe("RELIANCE");
      expect(result.trades[0].isin).toBe("INE002A01018");
      expect(result.trades[0].trade_type).toBe("buy");
      expect(result.trades[0].quantity).toBe(10);
      expect(result.trades[0].price).toBe(2500);
      expect(result.errors.filter((e) => e.severity === "error")).toHaveLength(0);
    });

    it("extracts metadata", () => {
      const buffer = createZerodhaWorkbook({ trades: [] });
      const result = zerodhaAdapter.parse(buffer);
      expect(result.metadata.broker).toBe("zerodha");
      expect(result.metadata.client_id).toBe("YY7859");
      expect(result.metadata.account_label).toBe("YY7859 (Zerodha)");
      expect(result.metadata.date_range).toContain("Tradebook for Equity");
    });

    it("returns error when no Equity sheet", () => {
      const buffer = createZerodhaWorkbook({ sheetName: "F&O", trades: [] });
      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("No 'Equity' sheet");
    });

    it("returns error when no header row", () => {
      const buffer = createZerodhaWorkbook({ includeHeader: false, trades: [] });
      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("Could not find header row");
    });

    it("skips auction trades with warning", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INE002A01018",
            date: "2024-01-15",
            tradeType: "buy",
            auction: true,
            quantity: 10,
            price: 2500,
            tradeId: "T001",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(0);
      expect(result.errors.some((e) => e.message.includes("auction"))).toBe(true);
    });

    it("skips non-EQ segment with warning", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "NIFTY",
            isin: "INE002A01018",
            date: "2024-01-15",
            segment: "FO",
            tradeType: "buy",
            quantity: 10,
            price: 2500,
            tradeId: "T001",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(0);
      expect(result.errors.some((e) => e.message.includes("non-equity"))).toBe(true);
    });

    it("errors on invalid ISIN format", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INVALID",
            date: "2024-01-15",
            tradeType: "buy",
            quantity: 10,
            price: 2500,
            tradeId: "T001",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(0);
      expect(result.errors.some((e) => e.message.includes("Invalid ISIN"))).toBe(true);
    });

    it("errors on invalid trade type", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INE002A01018",
            date: "2024-01-15",
            tradeType: "hold",
            quantity: 10,
            price: 2500,
            tradeId: "T001",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(0);
      expect(result.errors.some((e) => e.message.includes("Invalid trade type"))).toBe(true);
    });

    it("errors on invalid quantity", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INE002A01018",
            date: "2024-01-15",
            tradeType: "buy",
            quantity: 0,
            price: 2500,
            tradeId: "T001",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(0);
      expect(result.errors.some((e) => e.message.includes("Invalid quantity"))).toBe(true);
    });

    it("errors on negative price", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INE002A01018",
            date: "2024-01-15",
            tradeType: "buy",
            quantity: 10,
            price: -100,
            tradeId: "T001",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(0);
      expect(result.errors.some((e) => e.message.includes("Invalid price"))).toBe(true);
    });

    it("errors on missing trade ID", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INE002A01018",
            date: "2024-01-15",
            tradeType: "buy",
            quantity: 10,
            price: 2500,
            tradeId: "",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(0);
      expect(result.errors.some((e) => e.message.includes("Missing trade ID"))).toBe(true);
    });

    it("errors on missing symbol or ISIN", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "",
            isin: "",
            date: "2024-01-15",
            tradeType: "buy",
            quantity: 10,
            price: 2500,
            tradeId: "T001",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(0);
    });

    it("handles sell trades", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INE002A01018",
            date: "2024-01-15",
            tradeType: "sell",
            quantity: 10,
            price: 2700,
            tradeId: "T001",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].trade_type).toBe("sell");
    });

    it("parses numeric Excel dates", () => {
      // Excel serial date number for 2024-01-15
      const excelDate = 45306; // Approximate serial for 2024-01-15
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INE002A01018",
            date: excelDate,
            tradeType: "buy",
            quantity: 10,
            price: 2500,
            tradeId: "T001",
            executionTime: excelDate + 0.5,
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].trade_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("handles invalid trade date", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INE002A01018",
            date: "not-a-date" as any,
            tradeType: "buy",
            quantity: 10,
            price: 2500,
            tradeId: "T001",
          },
        ],
      });

      // The date is a string that doesn't match the format, should error
      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(0);
      expect(result.errors.some((e) => e.message.includes("Invalid trade date"))).toBe(true);
    });

    it("handles null client_id gracefully", () => {
      const buffer = createZerodhaWorkbook({ clientId: null, dateRange: null, trades: [] });
      const result = zerodhaAdapter.parse(buffer);
      expect(result.metadata.client_id).toBeNull();
      expect(result.metadata.account_label).toBeNull();
    });

    it("resolves missing ISIN from other rows with same symbol", () => {
      const wb = XLSX.utils.book_new();
      const rows: unknown[][] = [
        ["Client ID", "YY7859"],
        ["Tradebook for Equity from 01-01-2024 to 31-12-2024"],
        [],
        ["Symbol", "ISIN", "Trade Date", "Exchange", "Segment", "Series", "Trade Type", "Auction", "Quantity", "Price", "Trade ID", "Order ID", "Order Execution Time"],
        // First row has ISIN
        ["RELIANCE", "INE002A01018", "2024-01-15", "NSE", "EQ", "EQ", "buy", false, 10, 2500, "T001", "O001", "2024-01-15T10:30:00"],
        // Second row same symbol, missing ISIN
        ["RELIANCE", "", "2024-01-16", "NSE", "EQ", "EQ", "buy", false, 5, 2600, "T002", "O002", "2024-01-16T10:30:00"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Equity");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

      const result = zerodhaAdapter.parse(buf);
      expect(result.trades).toHaveLength(2);
      expect(result.trades[1].isin).toBe("INE002A01018");
    });

    it("parses multiple trades correctly", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INE002A01018",
            date: "2024-01-15",
            tradeType: "buy",
            quantity: 10,
            price: 2500,
            tradeId: "T001",
          },
          {
            symbol: "INFY",
            isin: "INE009A01021",
            date: "2024-01-16",
            tradeType: "sell",
            quantity: 5,
            price: 1800,
            tradeId: "T002",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades).toHaveLength(2);
      expect(result.trades[0].symbol).toBe("RELIANCE");
      expect(result.trades[1].symbol).toBe("INFY");
    });

    it("sets exchange from trade data", () => {
      const buffer = createZerodhaWorkbook({
        trades: [
          {
            symbol: "RELIANCE",
            isin: "INE002A01018",
            date: "2024-01-15",
            exchange: "BSE",
            tradeType: "buy",
            quantity: 10,
            price: 2500,
            tradeId: "T001",
          },
        ],
      });

      const result = zerodhaAdapter.parse(buffer);
      expect(result.trades[0].exchange).toBe("BSE");
    });

    it("uses trade_date as execution_time fallback", () => {
      // When execution time is null/undefined, it falls back to trade_date
      const wb = XLSX.utils.book_new();
      const rows: unknown[][] = [
        ["Client ID", "YY7859"],
        [],
        ["Symbol", "ISIN", "Trade Date", "Exchange", "Segment", "Series", "Trade Type", "Auction", "Quantity", "Price", "Trade ID", "Order ID", "Order Execution Time"],
        ["RELIANCE", "INE002A01018", "2024-01-15", "NSE", "EQ", "EQ", "buy", false, 10, 2500, "T001", "O001", null],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Equity");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

      const result = zerodhaAdapter.parse(buf);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].execution_time).toBe("2024-01-15");
    });

    it("errors on missing symbol with valid ISIN", () => {
      // Empty symbol but has ISIN
      const wb = XLSX.utils.book_new();
      const rows: unknown[][] = [
        ["Client ID", "YY7859"],
        [],
        ["Symbol", "ISIN", "Trade Date", "Exchange", "Segment", "Series", "Trade Type", "Auction", "Quantity", "Price", "Trade ID", "Order ID", "Order Execution Time"],
        ["", "INE002A01018", "2024-01-15", "NSE", "EQ", "EQ", "buy", false, 10, 2500, "T001", "O001", "2024-01-15T10:30:00"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Equity");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const result = zerodhaAdapter.parse(buf);
      // Empty row should be skipped (row[0] is empty string)
      expect(result.trades).toHaveLength(0);
    });

    it("handles row with symbol but missing ISIN and no lookup match", () => {
      const wb = XLSX.utils.book_new();
      const rows: unknown[][] = [
        ["Client ID", "YY7859"],
        [],
        ["Symbol", "ISIN", "Trade Date", "Exchange", "Segment", "Series", "Trade Type", "Auction", "Quantity", "Price", "Trade ID", "Order ID", "Order Execution Time"],
        ["UNKNOWN", "", "2024-01-15", "NSE", "EQ", "EQ", "buy", false, 10, 2500, "T001", "O001", "2024-01-15T10:30:00"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Equity");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const result = zerodhaAdapter.parse(buf);
      expect(result.trades).toHaveLength(0);
      expect(result.errors.some((e) => e.message.includes("Missing symbol or ISIN"))).toBe(true);
    });

    it("canParse detects via Symbol+ISIN header even without Client ID", () => {
      const wb = XLSX.utils.book_new();
      const rows: unknown[][] = [
        ["Some other header"],
        [],
        ["Symbol", "ISIN", "Trade Date"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Equity");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      expect(zerodhaAdapter.canParse(buf)).toBe(true);
    });

    it("handles auction as string 'true'", () => {
      const wb = XLSX.utils.book_new();
      const rows: unknown[][] = [
        ["Client ID", "YY7859"],
        [],
        ["Symbol", "ISIN", "Trade Date", "Exchange", "Segment", "Series", "Trade Type", "Auction", "Quantity", "Price", "Trade ID", "Order ID", "Order Execution Time"],
        ["RELIANCE", "INE002A01018", "2024-01-15", "NSE", "EQ", "EQ", "buy", "true", 10, 2500, "T001", "O001", "2024-01-15T10:30:00"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Equity");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

      const result = zerodhaAdapter.parse(buf);
      expect(result.trades).toHaveLength(0);
      expect(result.errors.some((e) => e.message.includes("auction"))).toBe(true);
    });
  });
});
