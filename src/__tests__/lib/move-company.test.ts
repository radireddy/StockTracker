import { describe, it, expect, vi, beforeEach } from "vitest";

const USER = { id: "user-1" };
const SRC_CO = "co-src";
const TARGET_PID = "550e8400-e29b-41d4-a716-446655440000";
const AID = "550e8400-e29b-41d4-a716-446655440001";

type RpcCall = { fn: string; params: Record<string, unknown> };

let rpcResult: { data?: unknown; error?: unknown };
let captured: { rpcCalls: RpcCall[] };

function makeClient() {
  return {
    rpc(fn: string, params: Record<string, unknown>) {
      captured.rpcCalls.push({ fn, params });
      return Promise.resolve(rpcResult);
    },
    // moveCompany must not touch tables directly anymore — the whole move is one
    // atomic RPC. If it does, surface it loudly.
    from(table: string): never {
      throw new Error(`moveCompany must not call .from(${table}); use the move_company RPC`);
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
  rpcResult = { data: "co-new", error: null };
  captured = { rpcCalls: [] };
});

describe("moveCompany — atomic RPC", () => {
  it("performs the whole move through a single move_company RPC call", async () => {
    await moveCompany(SRC_CO, TARGET_PID);
    expect(captured.rpcCalls).toHaveLength(1);
    expect(captured.rpcCalls[0].fn).toBe("move_company");
    expect(captured.rpcCalls[0].params).toMatchObject({
      p_company_id: SRC_CO,
      p_target_portfolio_id: TARGET_PID,
    });
  });

  it("forwards notes and a null position when no position is supplied", async () => {
    await moveCompany(SRC_CO, TARGET_PID, { notes: "moved from watchlist" });
    expect(captured.rpcCalls[0].params).toMatchObject({
      p_notes: "moved from watchlist",
      p_account_id: null,
      p_new_account_label: null,
      p_quantity: null,
      p_avg_buy_price: null,
    });
  });

  it("forwards a manual position with the chosen account, qty and price", async () => {
    await moveCompany(SRC_CO, TARGET_PID, {
      position: { account_id: AID, quantity: 10, avg_buy_price: 245.5 },
    });
    expect(captured.rpcCalls[0].params).toMatchObject({
      p_account_id: AID,
      p_new_account_label: null,
      p_quantity: 10,
      p_avg_buy_price: 245.5,
    });
  });

  it("forwards a new account label for account creation", async () => {
    await moveCompany(SRC_CO, TARGET_PID, {
      position: { new_account_label: "Wife – Groww" },
    });
    expect(captured.rpcCalls[0].params).toMatchObject({
      p_account_id: null,
      p_new_account_label: "Wife – Groww",
    });
  });

  it("returns the new company id from the RPC", async () => {
    const res = await moveCompany(SRC_CO, TARGET_PID);
    expect(res).toEqual({ ok: true, data: "co-new" });
  });

  it("surfaces the RPC error message (e.g. duplicate in target)", async () => {
    rpcResult = { data: null, error: { message: "This stock already exists in the target portfolio." } };
    const res = await moveCompany(SRC_CO, TARGET_PID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("This stock already exists in the target portfolio.");
  });

  it("surfaces the account-required error raised by the RPC", async () => {
    rpcResult = { data: null, error: { message: "Select an account to move this stock into holdings." } };
    const res = await moveCompany(SRC_CO, TARGET_PID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Select an account to move this stock into holdings.");
  });
});
