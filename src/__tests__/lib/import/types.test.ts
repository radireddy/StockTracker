import { describe, it, expect } from "vitest";
import type {
  ParsedTrade,
  GroupedTrade,
  BrokerParseResult,
  BrokerMetadata,
  ParseError,
  BrokerType,
  BrokerAdapter,
  ImportProgress,
  ImportResult,
} from "@/lib/import/types";

describe("import types", () => {
  it("ParsedTrade has expected shape", () => {
    const trade: ParsedTrade = {
      symbol: "RELIANCE",
      isin: "INE002A01018",
      trade_date: "2024-01-15",
      exchange: "NSE",
      trade_type: "buy",
      quantity: 10,
      price: 2500,
      trade_id: "T001",
      order_id: "O001",
      execution_time: "2024-01-15T10:30:00",
    };
    expect(trade.symbol).toBe("RELIANCE");
    expect(trade.trade_type).toBe("buy");
  });

  it("GroupedTrade has uppercased trade type", () => {
    const group: GroupedTrade = {
      symbol: "RELIANCE",
      isin: "INE002A01018",
      trade_date: "2024-01-15",
      exchange: "NSE",
      trade_type: "BUY",
      total_quantity: 10,
      avg_price: 2500,
      trade_ids: ["T001"],
      order_ids: ["O001"],
      earliest_execution_time: "2024-01-15T10:30:00",
    };
    expect(group.trade_type).toBe("BUY");
  });

  it("ImportResult has expected fields", () => {
    const result: ImportResult = {
      status: "completed",
      imported_count: 5,
      skipped_count: 2,
      failed_count: 0,
      new_companies_created: ["RELIANCE"],
      symbols_imported: ["RELIANCE"],
      symbols_skipped: ["INFY"],
      symbols_failed: [],
      symbols_incomplete_history: [],
      errors: [],
    };
    expect(result.status).toBe("completed");
    expect(result.imported_count).toBe(5);
  });

  it("BrokerType is a valid union", () => {
    const types: BrokerType[] = ["zerodha", "groww", "angelone", "upstox"];
    expect(types).toHaveLength(4);
  });
});
