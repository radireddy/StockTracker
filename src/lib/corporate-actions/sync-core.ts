import { parseCorporateAction } from "@/lib/import/corporate-action-factor";
import type { RawCorporateAction } from "@/lib/corporate-actions/sources/types";

export interface RefRow {
  source: string;
  symbol: string;
  isin: string | null;
  action_type: "split" | "bonus";
  ex_date: string;
  factor: number;
  raw_subject: string;
}

export function chunkWindows(from: Date, to: Date, days: number): Array<{ from: Date; to: Date }> {
  const out: Array<{ from: Date; to: Date }> = [];
  let cursor = new Date(from);
  while (cursor < to) {
    const next = new Date(cursor);
    next.setDate(next.getDate() + days);
    out.push({ from: new Date(cursor), to: next < to ? next : new Date(to) });
    cursor = next;
  }
  return out;
}

export function toRefRows(raw: RawCorporateAction[], source: string): RefRow[] {
  const out: RefRow[] = [];
  for (const r of raw) {
    if (!r.symbol || !r.ex_date) continue;
    const parsed = parseCorporateAction(r.subject);
    if (!parsed) continue;
    out.push({
      source,
      symbol: r.symbol,
      isin: r.isin,
      action_type: parsed.action_type,
      ex_date: r.ex_date,
      factor: parsed.factor,
      raw_subject: r.subject,
    });
  }
  return out;
}
