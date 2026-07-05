import { describe, it, expect } from "vitest";
import { MAX_HOLDINGS_PER_IMPORT } from "@/lib/import/types";
import type {
  ParsedHolding,
  HoldingsParseResult,
  BrokerMetadata,
  ParseError,
  BrokerType,
  BrokerAdapter,
  ImportResult,
} from "@/lib/import/types";

describe("import types", () => {
  it("ParsedHolding has expected shape", () => {
    const holding: ParsedHolding = {
      symbol: "RELIANCE",
      isin: "INE002A01018",
      sector: "Energy",
      quantity: 10,
      avg_price: 2500,
    };
    expect(holding.symbol).toBe("RELIANCE");
    expect(holding.quantity).toBe(10);
  });

  it("HoldingsParseResult composes holdings, metadata and errors", () => {
    const meta: BrokerMetadata = {
      broker: "zerodha",
      client_id: "AB1234",
      account_label: "AB1234 (Zerodha)",
      statement_date: "2025-03-31",
    };
    const err: ParseError = { row: 5, symbol: "XYZ", message: "bad row", severity: "warning" };
    const result: HoldingsParseResult = {
      holdings: [],
      metadata: meta,
      errors: [err],
    };
    expect(result.metadata.client_id).toBe("AB1234");
    expect(result.errors[0].severity).toBe("warning");
  });

  it("ImportResult has expected fields", () => {
    const result: ImportResult = {
      status: "completed",
      is_reimport: false,
      account_id: "acc-1",
      account_label: "AB1234 (Zerodha)",
      imported_count: 5,
      skipped_count: 2,
      companies_count: 5,
      new_companies_created: ["RELIANCE"],
      symbols_imported: ["RELIANCE"],
      symbols_skipped: ["INFY"],
      statement_date: "2025-03-31",
      client_id: "AB1234",
      errors: [],
    };
    expect(result.status).toBe("completed");
    expect(result.imported_count).toBe(5);
    expect(result.is_reimport).toBe(false);
  });

  it("BrokerType is a valid union", () => {
    const types: BrokerType[] = ["zerodha", "groww", "angelone", "upstox"];
    expect(types).toHaveLength(4);
  });

  it("BrokerAdapter contract shape is satisfiable", () => {
    const adapter: BrokerAdapter = {
      broker: "zerodha",
      displayName: "Zerodha",
      acceptedFileTypes: ".xlsx",
      description: "Holdings statement",
      canParse: () => false,
      parse: () => ({
        holdings: [],
        metadata: { broker: "zerodha", client_id: null, account_label: null, statement_date: null },
        errors: [],
      }),
    };
    expect(adapter.broker).toBe("zerodha");
    expect(adapter.canParse(new ArrayBuffer(0))).toBe(false);
  });

  it("MAX_HOLDINGS_PER_IMPORT is a positive cap", () => {
    expect(MAX_HOLDINGS_PER_IMPORT).toBe(100);
  });
});
