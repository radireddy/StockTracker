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
      limit: () => chain,
      range: (from: number, to: number) =>
        Promise.resolve({ data: (tables[table] ?? []).slice(from, to + 1), error: null }),
      maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      // Makes the chain thenable so `await supabase.from(...).select(...).eq(...)` resolves.
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: tables[table] ?? [], error: null }),
    };
    return chain;
  };
  return { from: build };
}

function makeAdminClient() {
  const captured = { inserts: [] as any[], updates: [] as any[], upserts: [] as any[], deletes: [] as any[] };
  const build = (table: string): any => ({
    insert: (vals: unknown) => {
      captured.inserts.push({ table, vals });
      return Promise.resolve({ error: null });
    },
    update: (vals: unknown) => ({
      eq: (col: string, val: unknown) => {
        captured.updates.push({ table, vals, col, val });
        return Promise.resolve({ error: null });
      },
    }),
    upsert: (vals: unknown, opts?: unknown) => {
      captured.upserts.push({ table, vals, opts });
      return Promise.resolve({ error: null });
    },
    delete: () => ({
      eq: (col: string, val: unknown) => {
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

import { recordMerger } from "@/app/(authenticated)/actions/tradebook-actions";
import { recomputeFifoForAccount } from "@/lib/import/tradebook-import-engine";

const ACC = { id: "acc-1" };

beforeEach(() => {
  admin = makeAdminClient();
  rls = makeReadClient({
    trades: [{ id: "trade-1" }],
    accounts: [ACC],
  });
  vi.mocked(recomputeFifoForAccount).mockClear();
});

describe("recordMerger", () => {
  it("succeeds: sets canonical_stock_id and upserts merger CA row", async () => {
    const result = await recordMerger({
      fromStockId: "from-id",
      toStockId: "to-id",
      ratio: 2.31,
      exDate: "2023-10-01",
    });
    expect(result.ok).toBe(true);

    // indian_stocks update sets canonical_stock_id
    const upd = admin._captured.updates.find(
      (u: { table: string }) => u.table === "indian_stocks"
    );
    expect(upd).toBeDefined();
    expect(upd.vals).toEqual({ canonical_stock_id: "to-id" });
    expect(upd.col).toBe("id");
    expect(upd.val).toBe("from-id");

    // corporate_actions upsert with merger type
    const ups = admin._captured.upserts.find(
      (u: { table: string }) => u.table === "corporate_actions"
    );
    expect(ups).toBeDefined();
    expect(ups.vals).toMatchObject({
      stock_id: "to-id",
      action_type: "merger",
      ex_date: "2023-10-01",
      factor: 2.31,
      source: "manual",
    });

    // FIFO recompute called
    expect(recomputeFifoForAccount).toHaveBeenCalledWith(admin, "user-1", "acc-1");
  });

  it("returns error when ratio ≤ 0", async () => {
    const result = await recordMerger({
      fromStockId: "from-id",
      toStockId: "to-id",
      ratio: 0,
      exDate: "2023-10-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("ratio");
    }
  });

  it("returns error when exDate is in the future", async () => {
    const result = await recordMerger({
      fromStockId: "from-id",
      toStockId: "to-id",
      ratio: 2.31,
      exDate: "2099-01-01",
    });
    expect(result.ok).toBe(false);
  });

  it("returns error when fromStockId === toStockId", async () => {
    const result = await recordMerger({
      fromStockId: "same-id",
      toStockId: "same-id",
      ratio: 2.31,
      exDate: "2023-10-01",
    });
    expect(result.ok).toBe(false);
  });

  it("returns error when caller has no trades in from-security", async () => {
    // Override rls so trades table is empty (no ownership)
    rls = makeReadClient({ trades: [], accounts: [ACC] });

    const result = await recordMerger({
      fromStockId: "from-id",
      toStockId: "to-id",
      ratio: 2.31,
      exDate: "2023-10-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.toLowerCase()).toContain("trade");
    }
  });
});
