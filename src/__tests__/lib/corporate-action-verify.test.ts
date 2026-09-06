import { describe, it, expect } from "vitest";
import { reconcileWithFeed, feedActionsToApply } from "@/lib/import/corporate-action-verify";
import type { CorporateActionCandidate, SecurityTrades } from "@/lib/import/corporate-action-detect";
import type { RefAction } from "@/lib/import/corporate-actions-data";
import type { CorporateActionContext } from "@/lib/import/corporate-actions";
import type { TradeForOpenPositions } from "@/lib/import/open-positions";

const EMPTY_CTX: CorporateActionContext = { canonicalMap: new Map(), actionsBySecurity: new Map() };

function trade(
  o: Partial<TradeForOpenPositions> & Pick<TradeForOpenPositions, "trade_date" | "trade_type" | "quantity" | "price">
): TradeForOpenPositions {
  return {
    id: "t", user_id: "u", account_id: "a", symbol: "SYM", isin: "I1", stock_id: "s1",
    executed_at: null, broker_trade_id: "b", ...o,
  };
}

function sec(o: Partial<SecurityTrades> & Pick<SecurityTrades, "trades">): SecurityTrades {
  return { symbol: "SYM", stock_id: "s1", isin: "I1", account_id: "a", holdingsQty: null, ...o };
}

const oversoldCandidate: CorporateActionCandidate = {
  stock_id: "s1", symbol: "SYM", isin: "I1", account_id: "a",
  action_type: "split", factor: 2, ex_date_window: { from: "2024-06-10", to: "2024-09-01" },
  observed: { buys: 250, sells: 670, fifoOpen: 0, holdings: null }, status: "unexplained",
};

describe("reconcileWithFeed — feed-first, trade-aware", () => {
  it("verifies a straddled split the aggregate ratio can't see (PGEL ×10 shape)", () => {
    // Raw buys 250 vs sells 670 — oversold, ratio 2.68 (not a clean factor).
    // A ×10 split on 2024-07-09 scales the pre-split buy: 50→500, so 700 buys ≥ 670 sells.
    const s = sec({
      trades: [
        trade({ trade_date: "2024-06-10", trade_type: "buy", quantity: 50, price: 1000 }),
        trade({ trade_date: "2024-08-01", trade_type: "buy", quantity: 200, price: 100 }),
        trade({ trade_date: "2024-09-01", trade_type: "sell", quantity: 670, price: 110 }),
      ],
    });
    const feed: RefAction[] = [{ symbol: "SYM", isin: "I1", action_type: "split", ex_date: "2024-07-09", factor: 10 }];
    const v = reconcileWithFeed(oversoldCandidate, s, feed, EMPTY_CTX);
    expect(v.status).toBe("verified");
    expect(v.actions).toEqual([{ stock_id: "s1", action_type: "split", ex_date: "2024-07-09", factor: 10 }]);
  });

  it("verifies a holdings mismatch via the feed (Signal B ×2 shape)", () => {
    const s = sec({
      holdingsQty: 200,
      trades: [trade({ trade_date: "2024-06-10", trade_type: "buy", quantity: 100, price: 100 })],
    });
    const feed: RefAction[] = [{ symbol: "SYM", isin: "I1", action_type: "split", ex_date: "2024-07-09", factor: 2 }];
    expect(reconcileWithFeed(oversoldCandidate, s, feed, EMPTY_CTX).status).toBe("verified");
  });

  it("falls back to the detector status when the feed has no action", () => {
    const s = sec({ trades: [trade({ trade_date: "2024-06-10", trade_type: "buy", quantity: 100, price: 100 })] });
    expect(reconcileWithFeed(oversoldCandidate, s, [], EMPTY_CTX)).toEqual({ status: "unexplained", actions: [] });
  });

  it("ignores a feed action dated on/before the earliest trade (irrelevant)", () => {
    const s = sec({
      trades: [
        trade({ trade_date: "2024-06-10", trade_type: "buy", quantity: 100, price: 100 }),
        trade({ trade_date: "2024-09-01", trade_type: "sell", quantity: 120, price: 110 }),
      ],
    });
    const feed: RefAction[] = [{ symbol: "SYM", isin: "I1", action_type: "split", ex_date: "2024-01-01", factor: 10 }];
    expect(reconcileWithFeed(oversoldCandidate, s, feed, EMPTY_CTX).status).toBe("unexplained");
  });

  it("does NOT verify when known holdings contradict the adjusted result (over-correction guard)", () => {
    // Applying ×10 fixes the oversold, but leaves 880 open vs 500 actually held → not certain.
    const s = sec({
      holdingsQty: 500,
      trades: [
        trade({ trade_date: "2024-06-10", trade_type: "buy", quantity: 100, price: 100 }),
        trade({ trade_date: "2024-09-01", trade_type: "sell", quantity: 120, price: 110 }),
      ],
    });
    const feed: RefAction[] = [{ symbol: "SYM", isin: "I1", action_type: "split", ex_date: "2024-07-09", factor: 10 }];
    expect(reconcileWithFeed(oversoldCandidate, s, feed, EMPTY_CTX).status).toBe("unexplained");
  });

  it("cannot apply without a canonical stock_id", () => {
    const s = sec({ stock_id: null, trades: [trade({ trade_date: "2024-06-10", trade_type: "buy", quantity: 50, price: 1000 })] });
    const feed: RefAction[] = [{ symbol: "SYM", isin: "I1", action_type: "split", ex_date: "2024-07-09", factor: 10 }];
    expect(reconcileWithFeed(oversoldCandidate, s, feed, EMPTY_CTX)).toEqual({ status: "unexplained", actions: [] });
  });
});

describe("feedActionsToApply — held-through-split (no mismatch needed)", () => {
  const TODAY = "2026-12-31";

  it("applies a split for a position still held at the ex_date (TDPOWERSYS shape)", () => {
    // Bought 2820, sold 1470 → 1350 still open, no oversell, no holdings gap.
    const s = sec({
      trades: [
        trade({ trade_date: "2025-02-07", trade_type: "buy", quantity: 2820, price: 390 }),
        trade({ trade_date: "2026-06-23", trade_type: "sell", quantity: 1470, price: 1357 }),
      ],
    });
    const feed: RefAction[] = [{ symbol: "SYM", isin: "I1", action_type: "split", ex_date: "2026-08-23", factor: 2 }];
    expect(feedActionsToApply(s, feed, EMPTY_CTX, TODAY)).toEqual([
      { stock_id: "s1", action_type: "split", ex_date: "2026-08-23", factor: 2 },
    ]);
  });

  it("skips an action dated after the position was fully exited", () => {
    const s = sec({
      trades: [
        trade({ trade_date: "2024-01-01", trade_type: "buy", quantity: 100, price: 10 }),
        trade({ trade_date: "2024-03-01", trade_type: "sell", quantity: 100, price: 12 }),
      ],
    });
    const feed: RefAction[] = [{ symbol: "SYM", isin: "I1", action_type: "bonus", ex_date: "2024-06-01", factor: 2 }];
    expect(feedActionsToApply(s, feed, EMPTY_CTX, TODAY)).toEqual([]);
  });

  it("skips an action already applied", () => {
    const ca = {
      canonicalMap: new Map<string, string>(),
      actionsBySecurity: new Map([["s1", [{ stock_id: "s1", action_type: "split" as const, ex_date: "2026-08-23", factor: 2 }]]]),
    };
    const s = sec({ trades: [trade({ trade_date: "2025-02-07", trade_type: "buy", quantity: 100, price: 390 })] });
    const feed: RefAction[] = [{ symbol: "SYM", isin: "I1", action_type: "split", ex_date: "2026-08-23", factor: 2 }];
    expect(feedActionsToApply(s, feed, ca, TODAY)).toEqual([]);
  });

  it("skips a future-dated action", () => {
    const s = sec({ trades: [trade({ trade_date: "2025-02-07", trade_type: "buy", quantity: 100, price: 390 })] });
    const feed: RefAction[] = [{ symbol: "SYM", isin: "I1", action_type: "split", ex_date: "2027-01-01", factor: 2 }];
    expect(feedActionsToApply(s, feed, EMPTY_CTX, TODAY)).toEqual([]);
  });

  it("returns nothing without a canonical stock_id", () => {
    const s = sec({ stock_id: null, trades: [trade({ trade_date: "2025-02-07", trade_type: "buy", quantity: 100, price: 390 })] });
    const feed: RefAction[] = [{ symbol: "SYM", isin: "I1", action_type: "split", ex_date: "2026-08-23", factor: 2 }];
    expect(feedActionsToApply(s, feed, EMPTY_CTX, TODAY)).toEqual([]);
  });
});
