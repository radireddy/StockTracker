import { describe, it, expect } from "vitest";
import {
  deriveRemainingLots,
  aggregateOpenPositions,
  summarizeOpenPositions,
  remainingLotsToOpenLots,
  type RemainingLot,
  type TradeForOpenPositions,
  type StockQuote,
  type AccountMeta,
} from "@/lib/import/open-positions";

const USER = "user-1";

function trade(
  overrides: Partial<TradeForOpenPositions> &
    Pick<TradeForOpenPositions, "id" | "trade_type" | "quantity" | "price">
): TradeForOpenPositions {
  return {
    user_id: USER,
    account_id: "acc-1",
    isin: "INE001",
    stock_id: "stk-1",
    symbol: "ABC",
    trade_date: "2024-01-01",
    executed_at: null,
    broker_trade_id: overrides.id,
    ...overrides,
  };
}

const quote: StockQuote = {
  name: "Abc Ltd",
  sector: "Metals",
  nse_symbol: "ABC",
  price: 30,
};

describe("deriveRemainingLots — sold quantity must not stay open", () => {
  it("drops a buy that was fully sold (no open position)", () => {
    const trades = [
      trade({ id: "b1", trade_type: "buy", quantity: 100, price: 10, trade_date: "2024-01-01" }),
      trade({ id: "s1", trade_type: "sell", quantity: 100, price: 15, trade_date: "2024-06-01" }),
    ];
    expect(deriveRemainingLots(trades)).toHaveLength(0);
  });

  it("keeps only unsold quantity after a partial sell", () => {
    const trades = [
      trade({ id: "b1", trade_type: "buy", quantity: 100, price: 10, trade_date: "2024-01-01" }),
      trade({ id: "s1", trade_type: "sell", quantity: 40, price: 15, trade_date: "2024-06-01" }),
    ];
    const lots = deriveRemainingLots(trades);
    expect(lots).toHaveLength(1);
    expect(lots[0].remaining_qty).toBe(60);
    expect(lots[0].original_qty).toBe(100);
    expect(lots[0].buy_price).toBe(10);
  });

  it("FIFO: selling the older lot leaves the later buy open", () => {
    const trades = [
      trade({ id: "b1", trade_type: "buy", quantity: 50, price: 10, trade_date: "2024-01-01" }),
      trade({ id: "b2", trade_type: "buy", quantity: 50, price: 20, trade_date: "2024-03-01" }),
      trade({ id: "s1", trade_type: "sell", quantity: 50, price: 25, trade_date: "2024-06-01" }),
    ];
    const lots = deriveRemainingLots(trades);
    expect(lots).toHaveLength(1);
    expect(lots[0].id).toBe("b2");
    expect(lots[0].remaining_qty).toBe(50);
    expect(lots[0].buy_price).toBe(20);
  });
});

describe("remainingLotsToOpenLots — groups same-day fills into one row", () => {
  function makeLot(
    overrides: Partial<RemainingLot> & Pick<RemainingLot, "id" | "trade_date" | "original_qty" | "remaining_qty" | "buy_price">
  ): RemainingLot {
    return {
      user_id: USER,
      account_id: "acc-1",
      isin: "INE001",
      stock_id: "stk-1",
      symbol: "ABC",
      executed_at: null,
      broker_trade_id: overrides.id,
      ...overrides,
    };
  }

  const accounts = new Map<string, AccountMeta>([["acc-1", { label: "XD6134 (Zerodha)", broker: "zerodha" }]]);
  const noQuotes = new Map<string, StockQuote>();
  const fixedDate = new Date("2024-12-31T00:00:00Z");

  it("collapses fills with the same date, account, AND price into one row", () => {
    const lots = [
      makeLot({ id: "l1", trade_date: "2024-07-01", original_qty: 100, remaining_qty: 100, buy_price: 1056.00 }),
      makeLot({ id: "l2", trade_date: "2024-07-01", original_qty: 12, remaining_qty: 12, buy_price: 1056.00 }),
      makeLot({ id: "l3", trade_date: "2024-07-01", original_qty: 1, remaining_qty: 1, buy_price: 1056.00 }),
    ];
    const result = remainingLotsToOpenLots(lots, accounts, noQuotes, fixedDate);
    expect(result).toHaveLength(1);
    expect(result[0].original_qty).toBe(113);
    expect(result[0].remaining_qty).toBe(113);
    expect(result[0].buy_price).toBeCloseTo(1056.00, 4);
  });

  it("keeps lots with different prices on the same day as separate rows", () => {
    const lots = [
      makeLot({ id: "l1", trade_date: "2024-07-01", original_qty: 100, remaining_qty: 100, buy_price: 1056.00 }),
      makeLot({ id: "l2", trade_date: "2024-07-01", original_qty: 13, remaining_qty: 13, buy_price: 1056.30 }),
      makeLot({ id: "l3", trade_date: "2024-07-01", original_qty: 1, remaining_qty: 1, buy_price: 1055.90 }),
    ];
    const result = remainingLotsToOpenLots(lots, accounts, noQuotes, fixedDate);
    expect(result).toHaveLength(3);
    const prices = result.map((r) => r.buy_price).sort((a, b) => a - b);
    expect(prices).toEqual([1055.90, 1056.00, 1056.30]);
  });

  it("keeps different dates as separate rows, latest first", () => {
    const lots = [
      makeLot({ id: "l1", trade_date: "2024-07-01", original_qty: 50, remaining_qty: 50, buy_price: 100 }),
      makeLot({ id: "l2", trade_date: "2024-08-01", original_qty: 50, remaining_qty: 50, buy_price: 110 }),
    ];
    const result = remainingLotsToOpenLots(lots, accounts, noQuotes, fixedDate);
    expect(result).toHaveLength(2);
    expect(result[0].trade_date).toBe("2024-08-01");
    expect(result[1].trade_date).toBe("2024-07-01");
  });

  it("keeps different accounts as separate rows even on the same date", () => {
    const twoAccounts = new Map<string, AccountMeta>([
      ["acc-1", { label: "Account 1", broker: "zerodha" }],
      ["acc-2", { label: "Account 2", broker: "zerodha" }],
    ]);
    const lots = [
      makeLot({ id: "l1", trade_date: "2024-07-01", account_id: "acc-1", original_qty: 50, remaining_qty: 50, buy_price: 100 }),
      makeLot({ id: "l2", trade_date: "2024-07-01", account_id: "acc-2", original_qty: 30, remaining_qty: 30, buy_price: 100 }),
    ];
    const result = remainingLotsToOpenLots(lots, twoAccounts, noQuotes, fixedDate);
    expect(result).toHaveLength(2);
    const acctIds = result.map((r) => r.account_id).sort();
    expect(acctIds).toEqual(["acc-1", "acc-2"]);
  });

  it("correctly sums remaining_qty across partially-sold lots in the same group", () => {
    const lots = [
      makeLot({ id: "l1", trade_date: "2024-07-01", original_qty: 100, remaining_qty: 60, buy_price: 100 }),
      makeLot({ id: "l2", trade_date: "2024-07-01", original_qty: 50, remaining_qty: 50, buy_price: 100 }),
    ];
    const result = remainingLotsToOpenLots(lots, accounts, noQuotes, fixedDate);
    expect(result).toHaveLength(1);
    expect(result[0].original_qty).toBe(150);
    expect(result[0].remaining_qty).toBe(110);
  });

  it("sorts grouped rows by trade_date descending (latest first)", () => {
    const lots = [
      makeLot({ id: "l3", trade_date: "2024-09-01", original_qty: 10, remaining_qty: 10, buy_price: 100 }),
      makeLot({ id: "l1", trade_date: "2024-07-01", original_qty: 10, remaining_qty: 10, buy_price: 100 }),
      makeLot({ id: "l2", trade_date: "2024-08-01", original_qty: 10, remaining_qty: 10, buy_price: 100 }),
    ];
    const result = remainingLotsToOpenLots(lots, accounts, noQuotes, fixedDate);
    expect(result.map((r) => r.trade_date)).toEqual(["2024-09-01", "2024-08-01", "2024-07-01"]);
  });
});

describe("summarizeOpenPositions — invested/current use unsold qty only", () => {
  it("excludes fully sold stock from invested and current value", () => {
    const trades = [
      trade({
        id: "b-sold",
        isin: "INE_SOLD",
        stock_id: "stk-sold",
        symbol: "SOLD",
        trade_type: "buy",
        quantity: 1000,
        price: 100,
        trade_date: "2024-01-01",
      }),
      trade({
        id: "s-sold",
        isin: "INE_SOLD",
        stock_id: "stk-sold",
        symbol: "SOLD",
        trade_type: "sell",
        quantity: 1000,
        price: 110,
        trade_date: "2024-02-01",
      }),
      trade({
        id: "b-open",
        isin: "INE_OPEN",
        stock_id: "stk-open",
        symbol: "OPEN",
        trade_type: "buy",
        quantity: 10,
        price: 50,
        trade_date: "2024-03-01",
      }),
    ];
    const quotes = new Map<string, StockQuote>([
      ["stk-sold", { ...quote, nse_symbol: "SOLD", price: 200 }],
      ["stk-open", { ...quote, nse_symbol: "OPEN", price: 60 }],
    ]);
    const positions = aggregateOpenPositions(deriveRemainingLots(trades), quotes);
    expect(positions.map((p) => p.symbol)).toEqual(["OPEN"]);
    const summary = summarizeOpenPositions(positions);
    expect(summary.invested).toBe(10 * 50);
    expect(summary.current).toBe(10 * 60);
    expect(summary.openCount).toBe(1);
  });

  it("invested is remaining qty × lot buy price, not original buy notional", () => {
    const trades = [
      trade({ id: "b1", trade_type: "buy", quantity: 100, price: 10, trade_date: "2024-01-01" }),
      trade({ id: "s1", trade_type: "sell", quantity: 60, price: 12, trade_date: "2024-06-01" }),
    ];
    const positions = aggregateOpenPositions(
      deriveRemainingLots(trades),
      new Map([["stk-1", quote]])
    );
    const summary = summarizeOpenPositions(positions);
    // 40 shares left at cost 10, LTP 30
    expect(summary.invested).toBe(400);
    expect(summary.current).toBe(40 * 30);
  });
});

describe("source / edited / trade_ids threading", () => {
  const accounts = new Map<string, AccountMeta>([["acc-1", { label: "A", broker: "zerodha" }]]);
  const noQuotes = new Map<string, StockQuote>();
  const fixedDate = new Date("2024-12-31T00:00:00Z");

  function makeLot(
    overrides: Partial<RemainingLot> & Pick<RemainingLot, "id" | "trade_date" | "original_qty" | "remaining_qty" | "buy_price">
  ): RemainingLot {
    return {
      user_id: USER, account_id: "acc-1", isin: "INE001", stock_id: "stk-1",
      symbol: "ABC", executed_at: null, broker_trade_id: overrides.id, ...overrides,
    };
  }

  it("carries source and edited from trade to remaining lot", () => {
    const lots = deriveRemainingLots([
      trade({ id: "m1", trade_type: "buy", quantity: 10, price: 5, source: "manual" }),
    ]);
    expect(lots[0].source).toBe("manual");
    expect(lots[0].edited).toBeUndefined();
  });

  it("single manual lot → source 'manual', its own trade id, not edited", () => {
    const [row] = remainingLotsToOpenLots(
      [makeLot({ id: "m1", trade_date: "2024-07-01", original_qty: 10, remaining_qty: 10, buy_price: 5, source: "manual" })],
      accounts, noQuotes, fixedDate
    );
    expect(row.source).toBe("manual");
    expect(row.trade_ids).toEqual(["m1"]);
    expect(row.edited).toBe(false);
  });

  it("collapsed broker fills → source 'zerodha', all trade ids, edited if any member edited", () => {
    const [row] = remainingLotsToOpenLots(
      [
        makeLot({ id: "l1", trade_date: "2024-07-01", original_qty: 100, remaining_qty: 100, buy_price: 1056, source: "zerodha" }),
        makeLot({ id: "l2", trade_date: "2024-07-01", original_qty: 12, remaining_qty: 12, buy_price: 1056, source: "zerodha", edited: true }),
      ],
      accounts, noQuotes, fixedDate
    );
    expect(row.source).toBe("zerodha");
    expect(row.trade_ids.sort()).toEqual(["l1", "l2"]);
    expect(row.edited).toBe(true);
  });

  it("mixed sources in one group → source 'mixed'", () => {
    const [row] = remainingLotsToOpenLots(
      [
        makeLot({ id: "l1", trade_date: "2024-07-01", original_qty: 100, remaining_qty: 100, buy_price: 100, source: "zerodha" }),
        makeLot({ id: "m1", trade_date: "2024-07-01", original_qty: 50, remaining_qty: 50, buy_price: 100, source: "manual" }),
      ],
      accounts, noQuotes, fixedDate
    );
    expect(row.source).toBe("mixed");
  });
});

describe("deriveRemainingLots — corporate actions", () => {
  const ca = {
    canonicalMap: new Map([["old", "new"]]),
    actionsBySecurity: new Map([
      ["new", [{ stock_id: "new", action_type: "split" as const, ex_date: "2025-06-01", factor: 5 }]],
    ]),
  };

  it("nets a pre-split buy fully sold post-split to zero open (1:5)", () => {
    const trades = [
      trade({ id: "b", isin: "OLD", stock_id: "old", trade_type: "buy", quantity: 270, price: 100, trade_date: "2025-01-01" }),
      trade({ id: "s", isin: "NEW", stock_id: "new", trade_type: "sell", quantity: 1350, price: 30, trade_date: "2025-08-01" }),
    ];
    expect(deriveRemainingLots(trades, ca)).toHaveLength(0);
  });

  it("keeps the partial remainder in current (post-split) units and adjusted cost", () => {
    const trades = [
      trade({ id: "b", isin: "OLD", stock_id: "old", trade_type: "buy", quantity: 270, price: 100, trade_date: "2025-01-01" }),
      trade({ id: "s", isin: "NEW", stock_id: "new", trade_type: "sell", quantity: 350, price: 30, trade_date: "2025-08-01" }),
    ];
    const lots = deriveRemainingLots(trades, ca);
    expect(lots).toHaveLength(1);
    expect(lots[0].remaining_qty).toBe(1000); // 1350 adjusted - 350 sold
    expect(lots[0].buy_price).toBe(20); // 100 / 5
    expect(lots[0].stock_id).toBe("new"); // canonical
  });
});
