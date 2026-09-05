// OFFLINE ONLY. Do not import from any app/serverless code path.
import { NSE } from "nse-bse-api";
import type { CorporateActionSource, RawCorporateAction } from "./types";

/** "22-Nov-2023" → "2023-11-22". */
function toIso(d: string): string {
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export const nseSource: CorporateActionSource = {
  name: "nse",
  supportsHistory: true,
  async fetchWindow(from, to) {
    const nse = new NSE("./.ca-downloads");
    try {
      const rows = await nse.actions({ from_date: from, to_date: to, segment: "equities" });
      return (rows ?? []).map((r: Record<string, unknown>): RawCorporateAction => ({
        symbol: String(r.symbol ?? "").trim(),
        isin: r.isin ? String(r.isin).trim() : null,
        subject: String(r.subject ?? "").trim(),
        ex_date: toIso(String(r.exDate ?? "")),
      }));
    } finally {
      try { nse.exit(); } catch { /* ignore */ }
    }
  },
};
