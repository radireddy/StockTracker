import { describe, it, expect, vi, beforeEach } from "vitest";

const USER = { id: "user-1" };
const SRC_CO = "co-src";
const TARGET_PID = "550e8400-e29b-41d4-a716-446655440000";
const AID = "550e8400-e29b-41d4-a716-446655440001";
const ISIN = "INE002A01018";

type Op = {
  table: string;
  insert?: Record<string, unknown>;
  update?: Record<string, unknown>;
  delete?: boolean;
  eq: Array<[string, unknown]>;
};

let targetType: "holdings" | "watchlist";
let existingHoldings: number;
let captured: { holdingInserts: Op[]; holdingDeletes: Op[]; holdingUpdates: Op[]; accountInserts: Op[] };

function makeClient() {
  return {
    from(table: string) {
      const op: Op = { table, eq: [] };
      const b: Record<string, unknown> = {
        select() { return b; },
        insert(v: Record<string, unknown>) { op.insert = v; return b; },
        update(v: Record<string, unknown>) { op.update = v; return b; },
        delete() { op.delete = true; return b; },
        eq(c: string, v: unknown) { op.eq.push([c, v]); return b; },
        maybeSingle() { return resolve(); },
        single() { return resolve(); },
        then(f: (x: unknown) => unknown, r?: (e: unknown) => unknown) {
          return Promise.resolve(resolve()).then(f, r);
        },
      };
      function resolve(): { data?: unknown; error?: unknown } {
        if (table === "companies") {
          // source fetch (.single after select.eq), duplicate check (.maybeSingle),
          // and target insert (.single) all land here.
          if (op.insert) return { data: { id: "co-new" }, error: null };
          const isDup = op.eq.some(([c]) => c === "portfolio_id");
          if (isDup) return { data: null }; // no duplicate in target
          return { data: { id: SRC_CO, isin: ISIN, buy_price: null, star_rating: 2 } };
        }
        if (table === "portfolios") return { data: { type: targetType } };
        if (table === "holdings") {
          if (op.insert) { captured.holdingInserts.push(op); return { error: null }; }
          if (op.delete) { captured.holdingDeletes.push(op); return { error: null }; }
          if (op.update) { captured.holdingUpdates.push(op); return { error: null }; }
          // select of source holdings
          return { data: Array.from({ length: existingHoldings }, (_, i) => ({ id: `h${i}` })) };
        }
        if (table === "accounts") { captured.accountInserts.push(op); return { data: { id: "new-acc" }, error: null }; }
        // research child tables copied by moveCompany
        return { data: [] };
      }
      return b;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getAuthUser: async () => ({ supabase: makeClient(), user: USER }),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { moveCompany } from "@/app/(authenticated)/actions/company-actions";

beforeEach(() => {
  targetType = "holdings";
  existingHoldings = 0;
  captured = { holdingInserts: [], holdingDeletes: [], holdingUpdates: [], accountInserts: [] };
});

describe("moveCompany — into holdings", () => {
  it("creates a zero-qty holding under the chosen account when none carry over", async () => {
    await moveCompany(SRC_CO, TARGET_PID, { position: { account_id: AID } });
    expect(captured.holdingInserts).toHaveLength(1);
    const row = captured.holdingInserts[0].insert!;
    expect(row.account_id).toBe(AID);
    expect(row.company_id).toBe("co-new");
    expect(row.quantity).toBe(0);
    expect(row.avg_buy_price).toBe(0);
    expect(row.source).toBe("manual");
  });

  it("creates a holding with the provided qty and price", async () => {
    await moveCompany(SRC_CO, TARGET_PID, { position: { account_id: AID, quantity: 10, avg_buy_price: 245.5 } });
    const row = captured.holdingInserts[0].insert!;
    expect(row.quantity).toBe(10);
    expect(row.avg_buy_price).toBe(245.5);
  });

  it("rejects when no account is supplied and nothing carries over", async () => {
    await expect(moveCompany(SRC_CO, TARGET_PID, {})).rejects.toThrow(
      "Select an account to move this stock into holdings."
    );
    expect(captured.holdingInserts).toHaveLength(0);
  });

  it("carries existing positions over without prompting for an account", async () => {
    existingHoldings = 2;
    await moveCompany(SRC_CO, TARGET_PID, {});
    expect(captured.holdingUpdates).toHaveLength(1);
    expect(captured.holdingUpdates[0].update).toMatchObject({ company_id: "co-new", portfolio_id: TARGET_PID });
    expect(captured.holdingInserts).toHaveLength(0);
  });
});

describe("moveCompany — out of holdings", () => {
  it("deletes holdings (unlinks the account) when target is a watchlist", async () => {
    targetType = "watchlist";
    existingHoldings = 3;
    await moveCompany(SRC_CO, TARGET_PID, {});
    expect(captured.holdingDeletes).toHaveLength(1);
    expect(captured.holdingDeletes[0].eq).toContainEqual(["company_id", SRC_CO]);
    expect(captured.holdingInserts).toHaveLength(0);
  });
});
