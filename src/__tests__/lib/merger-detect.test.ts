import { describe, it, expect } from "vitest";
import { detectOrphanPairs, matchOrphanPairsWithFeed } from "@/lib/import/merger-detect";
import type { SecurityTrades } from "@/lib/import/corporate-action-detect";
import type { TradeForOpenPositions } from "@/lib/import/open-positions";
import type { OrphanPairSuggestion } from "@/lib/import/tradebook-types";
import type { RefAction } from "@/lib/import/corporate-actions-data";

const EMPTY_CTX = { canonicalMap: new Map(), actionsBySecurity: new Map() };
const EMPTY_REF = new Map<string, RefAction[]>();
const ACC = "acc-1";

function buy(sym: string, isin: string, stockId: string | null, date: string, qty: number): TradeForOpenPositions {
  return { id: "t1", user_id: "u", account_id: ACC, symbol: sym, isin, stock_id: stockId,
    trade_date: date, trade_type: "buy", quantity: qty, price: 100,
    executed_at: null, broker_trade_id: "b" };
}

function sell(sym: string, isin: string, stockId: string | null, date: string, qty: number): TradeForOpenPositions {
  return { id: "t2", user_id: "u", account_id: ACC, symbol: sym, isin, stock_id: stockId,
    trade_date: date, trade_type: "sell", quantity: qty, price: 200,
    executed_at: null, broker_trade_id: "s" };
}

function sec(sym: string, isin: string, stockId: string | null, trades: TradeForOpenPositions[]): SecurityTrades {
  return { symbol: sym, stock_id: stockId, isin, account_id: ACC, trades, holdingsQty: null };
}

function refAction(symbol: string, ex_date: string, acquirer_symbol: string | null = null): RefAction {
  return { symbol, isin: null, action_type: "merger", ex_date, factor: null, acquirer_symbol };
}

describe("detectOrphanPairs", () => {
  it("detects Equitas→EquitasBnk shape (×2.31) when feed confirms EQUITAS as merger target", () => {
    const securities: SecurityTrades[] = [
      sec("EQUITAS", "INE988K01017", "from-id", [
        buy("EQUITAS", "INE988K01017", "from-id", "2022-01-01", 1020),
      ]),
      sec("EQUITASBNK", "INE063P01018", "to-id", [
        sell("EQUITASBNK", "INE063P01018", "to-id", "2024-04-15", 2356),
      ]),
    ];
    const refBySymbol = new Map([["EQUITAS", [refAction("EQUITAS", "2024-10-15")]]]);
    const suggestions = detectOrphanPairs(securities, EMPTY_CTX, refBySymbol);
    expect(suggestions).toHaveLength(1);
    const s = suggestions[0];
    expect(s.fromSymbol).toBe("EQUITAS");
    expect(s.toSymbol).toBe("EQUITASBNK");
    expect(s.impliedRatio).toBeCloseTo(2356 / 1020, 4);
    expect(s.fromQty).toBe(1020);
    expect(s.toQty).toBe(2356);
  });

  it("produces no suggestion when the absorbed company is not in the merger ref", () => {
    // HBLPOWER has no merger entry in corporate_action_ref → never a candidate,
    // regardless of how many sell-only stocks exist in the same account.
    const securities: SecurityTrades[] = [
      sec("HBLPOWER", "INE292B01021", "id-a", [buy("HBLPOWER", "INE292B01021", "id-a", "2021-01-01", 450)]),
      sec("OLECTRA",  "INE260H01012", "id-b", [sell("OLECTRA",  "INE260H01012", "id-b", "2024-01-01", 2356)]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX, EMPTY_REF)).toHaveLength(0);
  });

  it("produces no suggestion when absorbed company's position fully reconciles (netOpen = 0)", () => {
    // If all shares were sold normally, netOpen = 0 → no merger needed.
    const securities: SecurityTrades[] = [
      sec("EQUITAS", "INE988K01017", "from-id", [
        buy("EQUITAS", "INE988K01017", "from-id", "2022-01-01", 1020),
        sell("EQUITAS", "INE988K01017", "from-id", "2023-01-01", 1020), // fully sold
      ]),
      sec("EQUITASBNK", "INE063P01018", "to-id", [
        sell("EQUITASBNK", "INE063P01018", "to-id", "2024-04-15", 2356),
      ]),
    ];
    const refBySymbol = new Map([["EQUITAS", [refAction("EQUITAS", "2024-10-15")]]]);
    expect(detectOrphanPairs(securities, EMPTY_CTX, refBySymbol)).toHaveLength(0);
  });

  it("detects pair when absorbed company has both buys and sells but still has open shares", () => {
    // Partial sell before merger: bought 600, sold 100, remaining 500 absorbed.
    // 500 → 1000 gives ratio 2.0, GCD(500,1000)=500, denom=1 — clean.
    const securities: SecurityTrades[] = [
      sec("EQUITAS", "INE988K01017", "from-id", [
        buy("EQUITAS",  "INE988K01017", "from-id", "2022-01-01", 600),
        sell("EQUITAS", "INE988K01017", "from-id", "2023-06-01", 100),
      ]),
      sec("EQUITASBNK", "INE063P01018", "to-id", [
        sell("EQUITASBNK", "INE063P01018", "to-id", "2024-04-15", 1000),
      ]),
    ];
    const refBySymbol = new Map([["EQUITAS", [refAction("EQUITAS", "2024-10-15")]]]);
    const suggestions = detectOrphanPairs(securities, EMPTY_CTX, refBySymbol);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].fromQty).toBe(500);
    expect(suggestions[0].toQty).toBe(1000);
  });

  it("detects pair when surviving company has independent buys but is oversold (GRUH→BANDHANBNK pattern)", () => {
    // GRUH: buy-only 350 shares → absorbed.
    // BANDHANBNK: 173 independent buys + 371 sells → netOpen = -198 (oversold by 198).
    // 198 / 350 = 0.566 (GRUH-Bandhan merger ratio). unexplainedSells = 198.
    const refBySymbol = new Map([["GRUH", [refAction("GRUH", "2019-01-01")]]]);
    const securities: SecurityTrades[] = [
      sec("GRUH",      "INE415G01027", "gruh-id",   [buy("GRUH", "INE415G01027", "gruh-id", "2019-01-01", 350)]),
      sec("BANDHANBNK","INE545U01014", "bandha-id", [
        buy("BANDHANBNK",  "INE545U01014", "bandha-id", "2018-01-01", 173),
        sell("BANDHANBNK", "INE545U01014", "bandha-id", "2020-01-01", 371),
      ]),
    ];
    const suggestions = detectOrphanPairs(securities, EMPTY_CTX, refBySymbol);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].fromSymbol).toBe("GRUH");
    expect(suggestions[0].toSymbol).toBe("BANDHANBNK");
    // unexplainedSells = 173-371 = -198 → toQty = 198
    expect(suggestions[0].fromQty).toBe(350);
    expect(suggestions[0].toQty).toBe(198);
    expect(suggestions[0].impliedRatio).toBeCloseTo(198 / 350, 4);
  });

  it("does NOT suggest a pair when to-security has more buys than sells (net positive — not oversold)", () => {
    // BSTOCK has 50 buys and 30 sells → netOpen = +20 (normal open position, not oversold).
    // Not a merger candidate for the surviving side.
    const refBySymbol = new Map([["ASTOCK", [refAction("ASTOCK", "2024-01-01")]]]);
    const securities: SecurityTrades[] = [
      sec("ASTOCK", "INE001", "id-a", [buy("ASTOCK", "INE001", "id-a", "2021-01-01", 100)]),
      sec("BSTOCK", "INE002", "id-b", [
        buy("BSTOCK",  "INE002", "id-b", "2020-01-01", 50),
        sell("BSTOCK", "INE002", "id-b", "2023-06-01", 30),
      ]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX, refBySymbol)).toHaveLength(0);
  });

  it("skips a pair with a noisy ratio (denom > 500 in lowest terms)", () => {
    // from=503 (prime), to=701 (prime); gcd=1, denom=503 > 500 → skipped
    const refBySymbol = new Map([["FROM", [refAction("FROM", "2024-01-01")]]]);
    const securities: SecurityTrades[] = [
      sec("FROM", "INE001", "id-a", [buy("FROM", "INE001", "id-a", "2021-01-01", 503)]),
      sec("TO",   "INE002", "id-b", [sell("TO", "INE002", "id-b", "2023-01-01", 701)]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX, refBySymbol)).toHaveLength(0);
  });

  it("skips a pair where the unexplained oversell is fewer than 10 shares", () => {
    const refBySymbol = new Map([["FROM", [refAction("FROM", "2024-01-01")]]]);
    const securities: SecurityTrades[] = [
      sec("FROM", "INE001", "id-a", [buy("FROM", "INE001", "id-a", "2021-01-01", 450)]),
      sec("TO",   "INE002", "id-b", [sell("TO", "INE002", "id-b", "2024-01-01", 1)]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX, refBySymbol)).toHaveLength(0);
  });

  it("skips a pair whose implied ratio is below 0.1", () => {
    const refBySymbol = new Map([["FROM", [refAction("FROM", "2024-01-01")]]]);
    const securities: SecurityTrades[] = [
      sec("FROM", "INE001", "id-a", [buy("FROM", "INE001", "id-a", "2021-01-01", 450)]),
      sec("TO",   "INE002", "id-b", [sell("TO", "INE002", "id-b", "2024-01-01", 40)]),
    ];
    // 40/450 ≈ 0.089 < 0.1 → rejected
    expect(detectOrphanPairs(securities, EMPTY_CTX, refBySymbol)).toHaveLength(0);
  });

  it("skips a pair whose implied ratio is above 20", () => {
    const refBySymbol = new Map([["FROM", [refAction("FROM", "2024-01-01")]]]);
    const securities: SecurityTrades[] = [
      sec("FROM", "INE001", "id-a", [buy("FROM", "INE001", "id-a", "2021-01-01", 10)]),
      sec("TO",   "INE002", "id-b", [sell("TO", "INE002", "id-b", "2024-01-01", 250)]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX, refBySymbol)).toHaveLength(0);
  });

  it("does not pair securities from different accounts", () => {
    const refBySymbol = new Map([["FROM", [refAction("FROM", "2024-01-01")]]]);
    const securities: SecurityTrades[] = [
      { symbol: "FROM", stock_id: "id-a", isin: "INE001", account_id: "acc-1", holdingsQty: null,
        trades: [buy("FROM", "INE001", "id-a", "2021-01-01", 1020)] },
      { symbol: "TO", stock_id: "id-b", isin: "INE002", account_id: "acc-2", holdingsQty: null,
        trades: [sell("TO", "INE002", "id-b", "2024-01-01", 2356)] },
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX, refBySymbol)).toHaveLength(0);
  });

  it("skips from-security with no stock_id", () => {
    const refBySymbol = new Map([["FROM", [refAction("FROM", "2024-01-01")]]]);
    const securities: SecurityTrades[] = [
      sec("FROM", "INE001", null, [buy("FROM", "INE001", null, "2021-01-01", 1020)]),
      sec("TO",   "INE002", "id-b", [sell("TO", "INE002", "id-b", "2024-01-01", 2356)]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX, refBySymbol)).toHaveLength(0);
  });

  // ── Path 1: feed knows the surviving company (acquirer_symbol set) ──────────

  it("(Path 1) detects pair when user still holds surviving company — no sells of B required", () => {
    // Bought EQUITAS (absorbed), merged into EQUITASBNK, still holding EQUITASBNK.
    // Feed provides the surviving company name AND the swap factor.
    const securities: SecurityTrades[] = [
      sec("EQUITAS",    "INE988K01017", "from-id", [buy("EQUITAS",    "INE988K01017", "from-id", "2022-01-01", 1020)]),
      sec("EQUITASBNK", "INE063P01018", "to-id",   [buy("EQUITASBNK", "INE063P01018", "to-id",   "2022-12-01", 2356)]),
    ];
    const refBySymbol = new Map([
      ["EQUITAS", [{ ...refAction("EQUITAS", "2024-10-15", "EQUITASBNK"), factor: 2.31 }]],
    ]);
    const suggestions = detectOrphanPairs(securities, EMPTY_CTX, refBySymbol);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].fromSymbol).toBe("EQUITAS");
    expect(suggestions[0].toSymbol).toBe("EQUITASBNK");
    expect(suggestions[0].impliedRatio).toBeCloseTo(2.31, 4);
    expect(suggestions[0].fromQty).toBe(1020);
    expect(suggestions[0].toQty).toBe(Math.round(1020 * 2.31));
  });

  it("(Path 1) uses trade-derived netOpen when feed factor is null and surviving is hold-only", () => {
    const securities: SecurityTrades[] = [
      sec("EQUITAS",    "INE988K01017", "from-id", [buy("EQUITAS",    "INE988K01017", "from-id", "2022-01-01", 1000)]),
      sec("EQUITASBNK", "INE063P01018", "to-id",   [buy("EQUITASBNK", "INE063P01018", "to-id",   "2022-12-01", 2000)]),
    ];
    // No factor in feed — ratio inferred from EQUITASBNK's trade-derived open position
    const refBySymbol = new Map([
      ["EQUITAS", [refAction("EQUITAS", "2024-10-15", "EQUITASBNK")]],
    ]);
    const suggestions = detectOrphanPairs(securities, EMPTY_CTX, refBySymbol);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].impliedRatio).toBeCloseTo(2000 / 1000, 4);
    expect(suggestions[0].toQty).toBe(2000);
  });

  it("(Path 1) skips when surviving company has zero tradebook entries", () => {
    // EQUITASBNK has no trades at all — cannot derive stock_id from trade data.
    const securities: SecurityTrades[] = [
      sec("EQUITAS", "INE988K01017", "from-id", [buy("EQUITAS", "INE988K01017", "from-id", "2022-01-01", 1020)]),
      // No EQUITASBNK entry in securities
    ];
    const refBySymbol = new Map([
      ["EQUITAS", [refAction("EQUITAS", "2024-10-15", "EQUITASBNK")]],
    ]);
    const suggestions = detectOrphanPairs(securities, EMPTY_CTX, refBySymbol);
    expect(suggestions).toHaveLength(0);
  });

  it("(Path 1) prefers feed-acquirer path over orphan-pair heuristic when acquirer is known", () => {
    // Both EQUITASBNK (named by feed) and SOMEOTHERSELL (sell-only candidate) are present.
    // Path 1 fires for EQUITASBNK and the function skips Path 2 for EQUITAS.
    const securities: SecurityTrades[] = [
      sec("EQUITAS",       "INE988K01017", "from-id", [buy("EQUITAS", "INE988K01017", "from-id", "2022-01-01", 1000)]),
      sec("EQUITASBNK",    "INE063P01018", "to-id",   [buy("EQUITASBNK", "INE063P01018", "to-id", "2022-12-01", 2000)]),
      sec("SOMEOTHERSELL", "INE999",       "other-id", [sell("SOMEOTHERSELL", "INE999", "other-id", "2023-01-01", 2000)]),
    ];
    const refBySymbol = new Map([
      ["EQUITAS", [refAction("EQUITAS", "2024-10-15", "EQUITASBNK")]],
    ]);
    const suggestions = detectOrphanPairs(securities, EMPTY_CTX, refBySymbol);
    // Only one suggestion (Path 1 result), not two.
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].toSymbol).toBe("EQUITASBNK");
  });
});

function pair(fromSymbol: string, fromStockId: string, toSymbol: string, toStockId: string | null): OrphanPairSuggestion {
  return { fromSymbol, fromStockId, toSymbol, toStockId, impliedRatio: 2.31, fromQty: 1020, toQty: 2356 };
}

// Convention: fromSymbol=absorbed (EQUITAS), toSymbol=surviving (EQUITASBNK).
// The feed records the merger event under the absorbed company's symbol.
describe("matchOrphanPairsWithFeed", () => {
  it("confirms a pair when feed has a merger record for the absorbed company (fromSymbol)", () => {
    // fromSymbol=EQUITAS (absorbed), toSymbol=EQUITASBNK (surviving)
    const pairs = [pair("EQUITAS", "absorbed-id", "EQUITASBNK", "survives-id")];
    const refBySymbol = new Map<string, RefAction[]>([
      ["EQUITAS", [refAction("EQUITAS", "2024-10-15")]],
    ]);
    const { confirmed, unconfirmed } = matchOrphanPairsWithFeed(pairs, refBySymbol);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].ex_date).toBe("2024-10-15");
    expect(confirmed[0].fromSymbol).toBe("EQUITAS");    // absorbed
    expect(confirmed[0].toSymbol).toBe("EQUITASBNK");  // surviving
    expect(unconfirmed).toHaveLength(0);
  });

  it("leaves pair unconfirmed when feed has no merger record for the absorbed company", () => {
    const pairs = [pair("EQUITAS", "absorbed-id", "EQUITASBNK", "survives-id")];
    const refBySymbol = new Map<string, RefAction[]>();
    const { confirmed, unconfirmed } = matchOrphanPairsWithFeed(pairs, refBySymbol);
    expect(confirmed).toHaveLength(0);
    expect(unconfirmed).toHaveLength(1);
  });

  it("leaves pair unconfirmed when feed acquirer_symbol does not match surviving (toSymbol)", () => {
    // Feed says EQUITAS was acquired by SOMEBANK, but pair says EQUITASBNK — mismatch.
    const pairs = [pair("EQUITAS", "absorbed-id", "EQUITASBNK", "survives-id")];
    const refBySymbol = new Map<string, RefAction[]>([
      ["EQUITAS", [refAction("EQUITAS", "2024-10-15", "SOMEBANK")]],
    ]);
    const { confirmed, unconfirmed } = matchOrphanPairsWithFeed(pairs, refBySymbol);
    expect(confirmed).toHaveLength(0);
    expect(unconfirmed).toHaveLength(1);
  });

  it("skips pair when toStockId is null (cannot write canonical pointer on absorbed)", () => {
    const pairWithNullTo = pair("EQUITAS", "absorbed-id", "EQUITASBNK", null);
    const refBySymbol = new Map<string, RefAction[]>([
      ["EQUITAS", [refAction("EQUITAS", "2024-10-15")]],
    ]);
    const { confirmed, unconfirmed } = matchOrphanPairsWithFeed([pairWithNullTo], refBySymbol);
    expect(confirmed).toHaveLength(0);
    expect(unconfirmed).toHaveLength(1);
  });

  it("confirms pair when feed acquirer_symbol is null (acquirer not named in feed)", () => {
    const pairs = [pair("EQUITAS", "absorbed-id", "EQUITASBNK", "survives-id")];
    const refBySymbol = new Map<string, RefAction[]>([
      ["EQUITAS", [refAction("EQUITAS", "2024-10-15", null)]],
    ]);
    const { confirmed } = matchOrphanPairsWithFeed(pairs, refBySymbol);
    expect(confirmed).toHaveLength(1);
  });
});
