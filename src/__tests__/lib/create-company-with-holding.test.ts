import { describe, it, expect, vi, beforeEach } from "vitest";

const USER = { id: "user-1" };
const PID = "550e8400-e29b-41d4-a716-446655440000";
const AID = "550e8400-e29b-41d4-a716-446655440001";
const ISIN = "INE002A01018";

// table -> resolver(op) -> { data?, error? }
type Op = { table: string; select?: unknown; insert?: unknown; eq: Array<[string, unknown]> };
let handlers: Record<string, (op: Op) => { data?: unknown; error?: unknown }>;
const fromCalls: Record<string, number> = {};

function makeClient() {
  return {
    from(table: string) {
      fromCalls[table] = (fromCalls[table] ?? 0) + 1;
      const op: Op = { table, eq: [] };
      const b: Record<string, unknown> = {
        select(c: unknown) { op.select = c; return b; },
        insert(v: unknown) { op.insert = v; return b; },
        eq(c: string, v: unknown) { op.eq.push([c, v]); return b; },
        maybeSingle() { return Promise.resolve(handlers[table]?.(op) ?? { data: null }); },
        single() { return Promise.resolve(handlers[table]?.(op) ?? { data: null }); },
        then(f: (x: unknown) => unknown, r?: (e: unknown) => unknown) {
          return Promise.resolve(handlers[table]?.(op) ?? { data: null, error: null }).then(f, r);
        },
      };
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
vi.mock("@/app/(authenticated)/actions/price-actions", () => ({
  fetchStockPrice: vi.fn(async () => {}),
}));

import { createCompanyWithHolding } from "@/app/(authenticated)/actions/holdings-actions";

function mkForm(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  for (const k of Object.keys(fromCalls)) delete fromCalls[k];
  handlers = {
    // dup-check uses select+maybySingle (no insert) -> return no existing row;
    // company insert uses .insert().single() -> return the new id.
    companies: (op) => (op.insert ? { data: { id: "co-1" }, error: null } : { data: null }),
    accounts: () => ({ data: { id: "acc-new" }, error: null }),
    holdings: () => ({ data: null, error: null }),
  };
});

describe("createCompanyWithHolding", () => {
  it("creates a research-only company (no position, no holding)", async () => {
    const id = await createCompanyWithHolding(mkForm({ portfolio_id: PID, isin: ISIN, star_rating: "3" }));
    expect(id).toBe("co-1");
    expect(fromCalls.holdings ?? 0).toBe(0);
    expect(fromCalls.accounts ?? 0).toBe(0);
  });

  it("creates a company + holding with an existing account", async () => {
    const id = await createCompanyWithHolding(
      mkForm({ portfolio_id: PID, isin: ISIN, account_id: AID, quantity: "10", avg_buy_price: "100" })
    );
    expect(id).toBe("co-1");
    expect(fromCalls.holdings).toBe(1);
    expect(fromCalls.accounts ?? 0).toBe(0);
  });

  it("creates the new account then the company + holding", async () => {
    const id = await createCompanyWithHolding(
      mkForm({ portfolio_id: PID, isin: ISIN, new_account_label: "Dad – Groww", quantity: "5", avg_buy_price: "50" })
    );
    expect(id).toBe("co-1");
    expect(fromCalls.accounts).toBe(1);
    expect(fromCalls.holdings).toBe(1);
  });

  it("rejects a duplicate stock in the portfolio", async () => {
    handlers.companies = (op) => (op.insert ? { data: { id: "co-1" } } : { data: { id: "existing" } });
    await expect(
      createCompanyWithHolding(mkForm({ portfolio_id: PID, isin: ISIN }))
    ).rejects.toThrow(/already in this portfolio/i);
  });

  it("rejects a partial position", async () => {
    await expect(
      createCompanyWithHolding(mkForm({ portfolio_id: PID, isin: ISIN, quantity: "10" }))
    ).rejects.toThrow(/together/i);
  });
});
