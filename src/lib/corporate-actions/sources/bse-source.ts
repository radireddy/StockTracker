// OFFLINE ONLY. Do not import from any app/serverless code path.
import { BSE } from "nse-bse-api";
import type { CorporateActionSource, RawCorporateAction } from "./types";

function toIso(d: string): string {
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export const bseSource: CorporateActionSource = {
  name: "bse",
  supportsHistory: false, // endpoint returns forthcoming actions only
  async fetchWindow(from, to) {
    const bse = new BSE();
    try {
      const rows = await bse.actions({ fromDate: from, toDate: to, segment: "Equity" });
      return (rows ?? []).map((r: Record<string, unknown>): RawCorporateAction => ({
        symbol: String(r.short_name ?? "").trim(), // BSE gives no ISIN
        isin: null,
        subject: String(r.Purpose ?? "").trim(),
        ex_date: toIso(String(r.Ex_date ?? "")),
      }));
    } finally {
      try { bse.close(); } catch { /* ignore */ }
    }
  },
};
