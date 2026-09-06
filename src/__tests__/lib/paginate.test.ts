import { describe, it, expect } from "vitest";
import { fetchAllRows } from "@/lib/supabase/paginate";

/**
 * PostgREST silently caps every response at `db-max-rows` (1000 on Supabase),
 * regardless of the client `.limit()`. fetchAllRows must page with `.range()`
 * until a short page proves the table is exhausted.
 */
describe("fetchAllRows — pages past the PostgREST 1000-row cap", () => {
  it("returns ALL rows when the total exceeds one page", async () => {
    const total = 2500;
    const all = Array.from({ length: total }, (_, i) => ({ id: i }));
    const PAGE = 1000;
    // Simulate the server cap: never hand back more than PAGE rows per request.
    const makeQuery = (from: number, to: number) => {
      const end = Math.min(to, from + PAGE - 1);
      return Promise.resolve({ data: all.slice(from, end + 1), error: null });
    };
    const rows = await fetchAllRows<{ id: number }>(makeQuery, PAGE);
    expect(rows).toHaveLength(total);
    expect(rows[0].id).toBe(0);
    expect(rows[total - 1].id).toBe(total - 1);
  });

  it("stops after a single request when the total is under the page size", async () => {
    const all = Array.from({ length: 42 }, (_, i) => ({ id: i }));
    let calls = 0;
    const makeQuery = (from: number, to: number) => {
      calls++;
      return Promise.resolve({ data: all.slice(from, to + 1), error: null });
    };
    const rows = await fetchAllRows<{ id: number }>(makeQuery, 1000);
    expect(rows).toHaveLength(42);
    expect(calls).toBe(1);
  });

  it("throws when a page returns an error", async () => {
    const makeQuery = () =>
      Promise.resolve({ data: null, error: { message: "boom" } });
    await expect(fetchAllRows(makeQuery, 1000)).rejects.toThrow("boom");
  });
});
