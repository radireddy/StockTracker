import { describe, it, expect } from "vitest";
import { groupTrades } from "@/lib/import/import-engine";
import type { ParsedTrade } from "@/lib/import/types";

function makeTrade(overrides: Partial<ParsedTrade> = {}): ParsedTrade {
  return {
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
    ...overrides,
  };
}

describe("groupTrades", () => {
  it("groups trades by isin+date+price+type", () => {
    const trades: ParsedTrade[] = [
      makeTrade({ trade_id: "T001", quantity: 10 }),
      makeTrade({ trade_id: "T002", quantity: 5 }),
    ];

    const groups = groupTrades(trades);
    expect(groups).toHaveLength(1);
    expect(groups[0].total_quantity).toBe(15);
    expect(groups[0].trade_ids).toEqual(["T001", "T002"]);
    expect(groups[0].trade_type).toBe("BUY");
  });

  it("keeps trades at different prices separate", () => {
    const trades: ParsedTrade[] = [
      makeTrade({ trade_id: "T001", price: 2500 }),
      makeTrade({ trade_id: "T002", price: 2600 }),
    ];

    const groups = groupTrades(trades);
    expect(groups).toHaveLength(2);
  });

  it("keeps different trade types separate", () => {
    const trades: ParsedTrade[] = [
      makeTrade({ trade_id: "T001", trade_type: "buy" }),
      makeTrade({ trade_id: "T002", trade_type: "sell" }),
    ];

    const groups = groupTrades(trades);
    expect(groups).toHaveLength(2);
  });

  it("keeps different dates separate", () => {
    const trades: ParsedTrade[] = [
      makeTrade({ trade_id: "T001", trade_date: "2024-01-15" }),
      makeTrade({ trade_id: "T002", trade_date: "2024-01-16" }),
    ];

    const groups = groupTrades(trades);
    expect(groups).toHaveLength(2);
  });

  it("keeps different ISINs separate", () => {
    const trades: ParsedTrade[] = [
      makeTrade({ trade_id: "T001", isin: "INE002A01018", symbol: "RELIANCE" }),
      makeTrade({ trade_id: "T002", isin: "INE009A01021", symbol: "INFY" }),
    ];

    const groups = groupTrades(trades);
    expect(groups).toHaveLength(2);
  });

  it("calculates weighted average price", () => {
    const trades: ParsedTrade[] = [
      makeTrade({ trade_id: "T001", quantity: 10, price: 100 }),
      makeTrade({ trade_id: "T002", quantity: 10, price: 100 }),
    ];

    const groups = groupTrades(trades);
    expect(groups[0].avg_price).toBe(100);
  });

  it("calculates correct avg_price for unequal quantities at same price", () => {
    const trades: ParsedTrade[] = [
      makeTrade({ trade_id: "T001", quantity: 20, price: 100 }),
      makeTrade({ trade_id: "T002", quantity: 30, price: 100 }),
    ];

    const groups = groupTrades(trades);
    expect(groups[0].total_quantity).toBe(50);
    expect(groups[0].avg_price).toBe(100);
  });

  it("sorts groups chronologically", () => {
    const trades: ParsedTrade[] = [
      makeTrade({ trade_id: "T002", trade_date: "2024-01-20", execution_time: "2024-01-20T10:00:00" }),
      makeTrade({ trade_id: "T001", trade_date: "2024-01-15", execution_time: "2024-01-15T10:00:00" }),
    ];

    const groups = groupTrades(trades);
    expect(groups[0].trade_date).toBe("2024-01-15");
    expect(groups[1].trade_date).toBe("2024-01-20");
  });

  it("sorts by execution time when dates match", () => {
    const trades: ParsedTrade[] = [
      makeTrade({ trade_id: "T001", trade_type: "sell", execution_time: "2024-01-15T14:00:00" }),
      makeTrade({ trade_id: "T002", trade_type: "buy", execution_time: "2024-01-15T10:00:00", price: 2600 }),
    ];

    const groups = groupTrades(trades);
    expect(groups[0].trade_type).toBe("BUY");
    expect(groups[1].trade_type).toBe("SELL");
  });

  it("deduplicates order_ids", () => {
    const trades: ParsedTrade[] = [
      makeTrade({ trade_id: "T001", order_id: "O001" }),
      makeTrade({ trade_id: "T002", order_id: "O001" }),
    ];

    const groups = groupTrades(trades);
    expect(groups[0].order_ids).toEqual(["O001"]);
  });

  it("handles empty input", () => {
    expect(groupTrades([])).toEqual([]);
  });

  it("uses earliest execution time in group", () => {
    const trades: ParsedTrade[] = [
      makeTrade({ trade_id: "T001", execution_time: "2024-01-15T14:00:00" }),
      makeTrade({ trade_id: "T002", execution_time: "2024-01-15T10:00:00" }),
    ];

    const groups = groupTrades(trades);
    expect(groups[0].earliest_execution_time).toBe("2024-01-15T10:00:00");
  });

  it("uppercases trade_type to BUY/SELL", () => {
    const buyTrades = [makeTrade({ trade_id: "T001", trade_type: "buy" })];
    const sellTrades = [makeTrade({ trade_id: "T002", trade_type: "sell" })];

    expect(groupTrades(buyTrades)[0].trade_type).toBe("BUY");
    expect(groupTrades(sellTrades)[0].trade_type).toBe("SELL");
  });
});
