import { describe, it, expect, vi, beforeEach } from "vitest";

const USER = { id: "user-1" };

 
let rls: any;
 
let admin: any;

 
function makeReadClient(tables: Record<string, any[]>) {
   
  const build = (table: string): any => {
     
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      not: () => chain,
      order: () => chain,
      range: (from: number, to: number) =>
        Promise.resolve({ data: (tables[table] ?? []).slice(from, to + 1), error: null }),
      maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
       
      then: (resolve: any) => resolve({ data: tables[table] ?? [], error: null }),
    };
    return chain;
  };
  return { from: build };
}

function makeAdminClient() {
   
  const captured = { inserts: [] as any[], updates: [] as any[], deletes: [] as any[] };
   
  const build = (table: string): any => ({
     
    insert: (vals: any) => {
      captured.inserts.push({ table, vals });
      return Promise.resolve({ error: null });
    },
     
    update: (vals: any) => ({
       
      eq: (col: string, val: any) => {
        captured.updates.push({ table, vals, col, val });
        return Promise.resolve({ error: null });
      },
    }),
    delete: () => ({
       
      eq: (col: string, val: any) => {
        captured.deletes.push({ table, col, val });
        return Promise.resolve({ error: null });
      },
    }),
  });
  return { from: build, _captured: captured };
}

vi.mock("@/lib/supabase/server", () => ({ getAuthUser: async () => ({ user: USER, supabase: rls }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }),
}));
vi.mock("@/lib/import/tradebook-import-engine", () => ({ recomputeFifoForAccount: vi.fn(async () => {}) }));
vi.mock("@/lib/import/corporate-actions-data", () => ({
  loadCorporateActionContext: async () => ({ canonicalMap: new Map(), actionsBySecurity: new Map() }),
}));

import {
  addManualTrade,
  updateTrade,
  deleteTrades,
  resetTradeToOriginal,
  sellPosition,
} from "@/app/(authenticated)/actions/trade-corrections-actions";
import { recomputeFifoForAccount } from "@/lib/import/tradebook-import-engine";

const ACC = { id: "acc-1" };
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  admin = makeAdminClient();
  rls = makeReadClient({ accounts: [ACC], indian_stocks: [{ id: "stk-1" }] });
  vi.mocked(recomputeFifoForAccount).mockClear();
});

describe("addManualTrade", () => {
  const base = {
    accountId: "acc-1", isin: "INE001", symbol: "ABC",
    trade_type: "buy" as const, quantity: 100, price: 50, trade_date: yesterday,
  };

  it("inserts a manual buy with a synthetic broker_trade_id and recomputes", async () => {
    const res = await addManualTrade(base);
    expect(res.ok).toBe(true);
    const ins = admin._captured.inserts.find((i: { table: string }) => i.table === "trades");
    expect(ins.vals.source).toBe("manual");
    expect(ins.vals.broker_trade_id).toMatch(/^manual-/);
    expect(ins.vals.trade_type).toBe("buy");
    expect(ins.vals.stock_id).toBe("stk-1"); // resolved from ISIN
    expect(recomputeFifoForAccount).toHaveBeenCalledWith(admin, "user-1", "acc-1");
  });

  it("rejects a future trade date", async () => {
    const res = await addManualTrade({ ...base, trade_date: tomorrow });
    expect(res.ok).toBe(false);
    expect(admin._captured.inserts).toHaveLength(0);
  });

  it("rejects non-positive quantity", async () => {
    const res = await addManualTrade({ ...base, quantity: 0 });
    expect(res.ok).toBe(false);
  });

  it("rejects an account the user doesn't own", async () => {
    rls = makeReadClient({ accounts: [], indian_stocks: [] });
    const res = await addManualTrade(base);
    expect(res.ok).toBe(false);
    expect(admin._captured.inserts).toHaveLength(0);
  });
});

describe("updateTrade", () => {
  it("snapshots original on the first edit of a broker trade", async () => {
    rls = makeReadClient({
      trades: [{
        id: "t1", account_id: "acc-1", isin: "INE001", stock_id: "stk-1", symbol: "ABC",
        trade_date: "2024-01-01", trade_type: "buy", quantity: 100, price: 50,
        source: "zerodha", original: null,
      }],
    });
    const res = await updateTrade({ tradeId: "t1", quantity: 120 });
    expect(res.ok).toBe(true);
    const upd = admin._captured.updates.find((u: { table: string }) => u.table === "trades");
    expect(upd.vals.quantity).toBe(120);
    expect(upd.vals.original).toEqual({ quantity: 100, price: 50, trade_date: "2024-01-01", trade_type: "buy" });
  });

  it("does not snapshot a manual trade", async () => {
    rls = makeReadClient({
      trades: [{
        id: "m1", account_id: "acc-1", isin: "INE001", stock_id: "stk-1", symbol: "ABC",
        trade_date: "2024-01-01", trade_type: "buy", quantity: 10, price: 5,
        source: "manual", original: null,
      }],
    });
    const res = await updateTrade({ tradeId: "m1", price: 6 });
    expect(res.ok).toBe(true);
    const upd = admin._captured.updates.find((u: { table: string }) => u.table === "trades");
    expect(upd.vals.original).toBeUndefined();
  });
});

describe("deleteTrades", () => {
  it("soft-excludes a broker trade (row persists)", async () => {
    rls = makeReadClient({ trades: [{ id: "t1", account_id: "acc-1", source: "zerodha", original: null }] });
    const res = await deleteTrades({ tradeIds: ["t1"] });
    expect(res.ok).toBe(true);
    expect(admin._captured.updates).toEqual([{ table: "trades", vals: { excluded: true }, col: "id", val: "t1" }]);
    expect(admin._captured.deletes).toHaveLength(0);
  });

  it("hard-deletes a manual trade", async () => {
    rls = makeReadClient({ trades: [{ id: "m1", account_id: "acc-1", source: "manual", original: null }] });
    const res = await deleteTrades({ tradeIds: ["m1"] });
    expect(res.ok).toBe(true);
    expect(admin._captured.deletes).toEqual([{ table: "trades", col: "id", val: "m1" }]);
  });
});

describe("resetTradeToOriginal", () => {
  it("restores original values and clears the snapshot", async () => {
    rls = makeReadClient({
      trades: [{
        id: "t1", account_id: "acc-1", source: "zerodha",
        trade_date: "2024-05-05", trade_type: "buy", quantity: 999, price: 9,
        original: { quantity: 100, price: 50, trade_date: "2024-01-01", trade_type: "buy" },
      }],
    });
    const res = await resetTradeToOriginal("t1");
    expect(res.ok).toBe(true);
    const upd = admin._captured.updates[0];
    expect(upd.vals).toEqual({ quantity: 100, price: 50, trade_date: "2024-01-01", trade_type: "buy", original: null });
  });

  it("errors when the trade was never edited", async () => {
    rls = makeReadClient({ trades: [{ id: "t1", account_id: "acc-1", source: "zerodha", original: null }] });
    const res = await resetTradeToOriginal("t1");
    expect(res.ok).toBe(false);
  });
});

describe("sellPosition", () => {
  const openBuys = [
    { id: "b1", user_id: "user-1", account_id: "acc-1", isin: "INE001", stock_id: "stk-1", symbol: "ABC",
      trade_date: "2024-01-01", trade_type: "buy", quantity: 100, price: 50, executed_at: null, broker_trade_id: "b1" },
  ];

  it("records a manual sell within the open quantity", async () => {
    rls = makeReadClient({ accounts: [ACC], trades: openBuys });
    const res = await sellPosition({ isin: "INE001", accountId: "acc-1", quantity: 40, price: 70, trade_date: yesterday });
    expect(res.ok).toBe(true);
    const ins = admin._captured.inserts.find((i: { table: string }) => i.table === "trades");
    expect(ins.vals.trade_type).toBe("sell");
    expect(ins.vals.quantity).toBe(40);
    expect(ins.vals.source).toBe("manual");
  });

  it("rejects selling more than the open position", async () => {
    rls = makeReadClient({ accounts: [ACC], trades: openBuys });
    const res = await sellPosition({ isin: "INE001", accountId: "acc-1", quantity: 500, price: 70, trade_date: yesterday });
    expect(res.ok).toBe(false);
    expect(admin._captured.inserts).toHaveLength(0);
  });
});
