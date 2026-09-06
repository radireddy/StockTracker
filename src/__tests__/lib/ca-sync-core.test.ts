import { describe, it, expect } from "vitest";
import { chunkWindows, toRefRows } from "@/lib/corporate-actions/sync-core";

describe("chunkWindows", () => {
  it("splits a range into <= N-day windows covering the whole span", () => {
    const w = chunkWindows(new Date("2024-01-01"), new Date("2024-03-02"), 30);
    expect(w.length).toBe(3);
    expect(w[0].from.toISOString().slice(0, 10)).toBe("2024-01-01");
    expect(w[w.length - 1].to.toISOString().slice(0, 10)).toBe("2024-03-02");
  });
});

describe("toRefRows", () => {
  it("keeps only equity split/bonus and attaches the parsed factor", () => {
    const rows = toRefRows(
      [
        { symbol: "TDPOWERSYS", isin: "INE419M01019", subject: "Face Value Split (Sub-Division) - From Rs 2/- Per Share To Re 1/- Per Share", ex_date: "2026-08-24" },
        { symbol: "AIAENG", isin: "INE212H01026", subject: "Interim Dividend - Rs 16", ex_date: "2026-09-04" },
        { symbol: "SIYSIL", isin: null, subject: "Scheme Of Arrangement - Bonus Ncrps 4:1", ex_date: "2026-08-21" },
      ],
      "nse"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "nse", symbol: "TDPOWERSYS", action_type: "split", factor: 2 });
  });

  it("keeps merger subjects (factor null when no ratio in subject)", () => {
    const rows = toRefRows(
      [
        { symbol: "EQUITAS", isin: "INE988K01017", subject: "Merger", ex_date: "2024-10-15" },
        { symbol: "HDFCBANK", isin: "INE040A01034", subject: "Amalgamation", ex_date: "2023-07-01" },
      ],
      "nse"
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: "nse", symbol: "EQUITAS", action_type: "merger", factor: null });
    expect(rows[1]).toMatchObject({ action_type: "merger", factor: null });
  });

  it("keeps merger with explicit ratio", () => {
    const rows = toRefRows(
      [{ symbol: "SMALLCO", isin: null, subject: "Merger in ratio 42:25", ex_date: "2025-03-01" }],
      "nse"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action_type: "merger", factor: 42 / 25 });
  });

  it("still skips non-equity Scheme Of Arrangement", () => {
    const rows = toRefRows(
      [{ symbol: "SIYSIL", isin: null, subject: "Scheme Of Arrangement - Bonus Ncrps 4:1", ex_date: "2026-08-21" }],
      "nse"
    );
    expect(rows).toHaveLength(0);
  });
});
