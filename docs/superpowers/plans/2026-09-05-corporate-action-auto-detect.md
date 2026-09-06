# Corporate-Action Auto-Detection & Apply on Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During tradebook import, detect stocks with a likely split/bonus, auto-apply the ones a market-wide reference feed confirms, and surface the rest with plain-English math for the user to confirm.

**Architecture:** An **offline** market-wide sync (`nse-bse-api`, run on a non-blocked IP) fills a decoupled `corporate_action_ref` feed table. The **network-free import path** detects quantity mismatches in the user's own trades (pure engine), verifies candidates against the feed by **symbol** (stable across ISIN changes), auto-applies verified ones to `corporate_actions`, and returns inferred ones for confirmation in the import dialog.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Supabase (Postgres + RLS), Vitest, `nse-bse-api` (dev/ops only — never bundled into the Vercel app), `xlsx`.

**Spec:** `docs/superpowers/specs/2026-09-05-corporate-action-auto-detect-design.md`

## Global Constraints

- **Migrations are applied manually** via the Supabase Dashboard SQL editor (project convention). Code must degrade gracefully if a migration isn't applied yet (wrap new-table reads in try/catch → empty).
- **`nse-bse-api` is offline-only.** Only `scripts/sync-corporate-actions.ts` and files under `src/lib/corporate-actions/sources/**` may import it. **No app/serverless code path may import those files** (keeps the library out of the Vercel bundle; it also requires Node 22.x while the app runs newer).
- **Never auto-apply an inferred action** — only reference-verified ones. Every applied action must pass the reconciliation guard (the user's own trades reconcile under the factor).
- **Match the feed to a security by SYMBOL first**, ISIN secondary. ISIN is NOT stable across splits.
- **Equity-only** split/bonus. Reject subjects containing `ncrps|preference|warrant|debenture|scheme of arrangement`. Ignore dividends/rights/buybacks.
- **Mutations return `ActionResult`; reads throw** (project convention, `src/lib/action-result.ts`).
- Existing patterns to follow: `CorporateActionContext` and `adjustQtyPrice`/`securityKey` in `src/lib/import/corporate-actions.ts`; `deriveRemainingLots` in `src/lib/import/open-positions.ts`; `fetchAllRows` in `src/lib/supabase/paginate.ts`; `recomputeFifoForAccount` in `src/lib/import/tradebook-import-engine.ts`.

---

## File Structure

- Create `supabase/migrations/007_corporate_action_source.sql` — feed table, watermark, `source` column, indexes.
- Create `src/lib/import/corporate-action-factor.ts` — pure `parseCorporateAction(subject)` → `{action_type, factor}|null`.
- Create `src/lib/corporate-actions/sources/types.ts` — `CorporateActionSource`, `RawCorporateAction`.
- Create `src/lib/corporate-actions/sources/nse-source.ts` — NSE adapter (offline).
- Create `src/lib/corporate-actions/sources/bse-source.ts` — BSE adapter (offline).
- Create `src/lib/corporate-actions/sources/registry.ts` — source list.
- Create `scripts/sync-corporate-actions.ts` — offline market-wide sync.
- Create `src/lib/import/corporate-action-detect.ts` — pure detection engine → candidates.
- Modify `src/lib/import/corporate-actions-data.ts` — add `loadRefBySymbols`; scope `loadCorporateActionContext` to stock_ids.
- Create `src/lib/import/corporate-action-verify.ts` — classify candidates verified/inferred via the feed.
- Modify `src/lib/import/tradebook-types.ts` — `CorporateActionCandidate`, extend result types.
- Modify `src/lib/import/tradebook-import-engine.ts` — run detect+verify, auto-apply verified, return candidates.
- Modify `src/app/(authenticated)/actions/tradebook-actions.ts` — thread candidates; add `applyCorporateAction`.
- Modify `src/components/trades/trade-import-dialog.tsx` — Corporate actions section.

---

## Task 1: Migration 007 — feed table, watermark, source column, indexes

**Files:**
- Create: `supabase/migrations/007_corporate_action_source.sql`

**Interfaces:**
- Produces: tables `corporate_action_ref`, `corporate_action_sync_state`; column `corporate_actions.source`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- 007_corporate_action_source.sql — CA reference feed + sync watermark.
-- Apply manually via Supabase Dashboard SQL editor.

ALTER TABLE corporate_actions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('nse', 'manual', 'inferred'));

CREATE TABLE IF NOT EXISTS corporate_action_ref (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  isin        TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('split','bonus')),
  ex_date     DATE NOT NULL,
  factor      NUMERIC(20,8) NOT NULL CHECK (factor > 0),
  raw_subject TEXT,
  fetched_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, symbol, action_type, ex_date)
);
CREATE INDEX IF NOT EXISTS idx_ca_ref_symbol_exdate ON corporate_action_ref (symbol, ex_date);
CREATE INDEX IF NOT EXISTS idx_ca_ref_isin_exdate ON corporate_action_ref (isin, ex_date) WHERE isin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ca_ref_exdate ON corporate_action_ref (ex_date);

ALTER TABLE corporate_action_ref ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read corporate_action_ref" ON corporate_action_ref;
CREATE POLICY "Authenticated can read corporate_action_ref"
  ON corporate_action_ref FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS corporate_action_sync_state (
  source          TEXT PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ NOT NULL
);
```

- [ ] **Step 2: Commit** (migration is applied by the operator via Dashboard; code degrades gracefully until then)

```bash
git add supabase/migrations/007_corporate_action_source.sql
git commit -m "feat(db): 007 corporate-action feed + sync watermark"
```

---

## Task 2: Factor parser (pure, TDD)

**Files:**
- Create: `src/lib/import/corporate-action-factor.ts`
- Test: `src/__tests__/lib/corporate-action-factor.test.ts`

**Interfaces:**
- Produces: `parseCorporateAction(subject: string): { action_type: "split" | "bonus"; factor: number } | null`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { parseCorporateAction } from "@/lib/import/corporate-action-factor";

describe("parseCorporateAction", () => {
  it("parses a face-value split into a share multiplier", () => {
    expect(parseCorporateAction("Face Value Split (Sub-Division) - From Rs 2/- Per Share To Re 1/- Per Share"))
      .toEqual({ action_type: "split", factor: 2 });
    expect(parseCorporateAction("Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share"))
      .toEqual({ action_type: "split", factor: 5 });
  });

  it("parses an equity bonus a:b into (a+b)/b", () => {
    expect(parseCorporateAction("Bonus 1:1")).toEqual({ action_type: "bonus", factor: 2 });
    expect(parseCorporateAction("Bonus 2:1")).toEqual({ action_type: "bonus", factor: 3 });
    expect(parseCorporateAction("Bonus 1:2")).toEqual({ action_type: "bonus", factor: 1.5 });
  });

  it("rejects non-equity bonuses (NCRPS / scheme of arrangement)", () => {
    expect(parseCorporateAction("Scheme Of Arrangement - Bonus Ncrps 4:1")).toBeNull();
    expect(parseCorporateAction("Bonus Preference 1:1")).toBeNull();
  });

  it("returns null for dividends, rights, buybacks", () => {
    expect(parseCorporateAction("Interim Dividend - Re 0.50 Per Share")).toBeNull();
    expect(parseCorporateAction("Rights 1:5")).toBeNull();
    expect(parseCorporateAction("Buy Back of Shares")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/corporate-action-factor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
/** Parse an NSE/BSE corporate-action subject into an equity share-multiplier.
 *  Returns null for anything that isn't an equity split or equity bonus. */
export function parseCorporateAction(
  subject: string
): { action_type: "split" | "bonus"; factor: number } | null {
  const s = subject.toLowerCase();

  // Exclude non-equity instruments outright.
  if (/ncrps|preference|warrant|debenture|scheme of arrangement/.test(s)) return null;

  // Split: face-value sub-division "From Rs X ... To (Rs|Re) Y".
  if (/split|sub-division|subdivision/.test(s)) {
    const m = s.match(/from\s*rs?\.?\s*([\d.]+).*?to\s*rs?e?\.?\s*([\d.]+)/);
    if (m) {
      const oldFv = parseFloat(m[1]);
      const newFv = parseFloat(m[2]);
      if (oldFv > 0 && newFv > 0 && oldFv !== newFv) {
        return { action_type: "split", factor: oldFv / newFv };
      }
    }
    return null;
  }

  // Bonus a:b → (a + b) / b.
  if (/\bbonus\b/.test(s)) {
    const m = s.match(/bonus\s*(\d+)\s*:\s*(\d+)/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (a > 0 && b > 0) return { action_type: "bonus", factor: (a + b) / b };
    }
    return null;
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/corporate-action-factor.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/corporate-action-factor.ts src/__tests__/lib/corporate-action-factor.test.ts
git commit -m "feat(import): equity split/bonus factor parser"
```

---

## Task 3: Corporate-action source adapters (offline)

**Files:**
- Create: `src/lib/corporate-actions/sources/types.ts`
- Create: `src/lib/corporate-actions/sources/nse-source.ts`
- Create: `src/lib/corporate-actions/sources/bse-source.ts`
- Create: `src/lib/corporate-actions/sources/registry.ts`

**Interfaces:**
- Produces:
  - `interface RawCorporateAction { symbol: string; isin: string | null; subject: string; ex_date: string; /* YYYY-MM-DD */ }`
  - `interface CorporateActionSource { readonly name: string; readonly supportsHistory: boolean; fetchWindow(from: Date, to: Date): Promise<RawCorporateAction[]> }`
  - `corporateActionSources: CorporateActionSource[]`
- Note: these files import `nse-bse-api`; they are consumed ONLY by Task 4's script. No test here (network/offline library) — covered by the parser (Task 2) and the sync's pure parts.

- [ ] **Step 1: Write `types.ts`**

```typescript
export interface RawCorporateAction {
  symbol: string;
  isin: string | null;
  subject: string;
  ex_date: string; // YYYY-MM-DD
}

export interface CorporateActionSource {
  readonly name: string;          // 'nse' | 'bse'
  readonly supportsHistory: boolean;
  /** Market-wide actions in [from, to] (BSE ignores the range → forthcoming). */
  fetchWindow(from: Date, to: Date): Promise<RawCorporateAction[]>;
}
```

- [ ] **Step 2: Write `nse-source.ts`**

```typescript
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
```

- [ ] **Step 3: Write `bse-source.ts`**

```typescript
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
```

- [ ] **Step 4: Write `registry.ts`**

```typescript
import type { CorporateActionSource } from "./types";
import { nseSource } from "./nse-source";
import { bseSource } from "./bse-source";

// NSE first (historical); BSE second (forthcoming-only).
export const corporateActionSources: CorporateActionSource[] = [nseSource, bseSource];
```

- [ ] **Step 5: Typecheck & commit** (no unit test — offline library)

Run: `npx tsc --noEmit`
Expected: no errors from these files.

```bash
git add src/lib/corporate-actions/sources
git commit -m "feat(ca): offline NSE/BSE corporate-action source adapters"
```

---

## Task 4: Offline sync script (watermark, chunked backfill)

**Files:**
- Create: `scripts/sync-corporate-actions.ts`
- Create: `src/lib/corporate-actions/sync-core.ts` (pure helpers, testable)
- Test: `src/__tests__/lib/ca-sync-core.test.ts`

**Interfaces:**
- Consumes: `parseCorporateAction` (Task 2), `corporateActionSources` (Task 3).
- Produces (pure, testable):
  - `chunkWindows(from: Date, to: Date, days: number): Array<{from: Date; to: Date}>`
  - `toRefRows(raw: RawCorporateAction[], source: string): RefRow[]` where `RefRow = { source; symbol; isin; action_type; ex_date; factor; raw_subject }`

- [ ] **Step 1: Write the failing test for the pure helpers**

```typescript
import { describe, it, expect } from "vitest";
import { chunkWindows, toRefRows } from "@/lib/corporate-actions/sync-core";

describe("chunkWindows", () => {
  it("splits a range into <= N-day windows covering the whole span", () => {
    const w = chunkWindows(new Date("2024-01-01"), new Date("2024-03-01"), 30);
    expect(w.length).toBe(3);
    expect(w[0].from.toISOString().slice(0, 10)).toBe("2024-01-01");
    expect(w[w.length - 1].to.toISOString().slice(0, 10)).toBe("2024-03-01");
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/ca-sync-core.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `sync-core.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/ca-sync-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the sync script (orchestration, no unit test — I/O)**

```typescript
/**
 * Offline market-wide corporate-action sync. Run on a non-blocked IP (Node 22).
 *   npx tsx scripts/sync-corporate-actions.ts [--from YYYY-MM-DD]
 * Populates corporate_action_ref; advances corporate_action_sync_state per source
 * only on success. NEVER run on Vercel.
 */
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { corporateActionSources } from "../src/lib/corporate-actions/sources/registry";
import { chunkWindows, toRefRows } from "../src/lib/corporate-actions/sync-core";

config({ path: path.resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const OVERLAP_DAYS = 7;
const CHUNK_DAYS = 90;

function argFrom(): Date | null {
  const i = process.argv.indexOf("--from");
  return i >= 0 && process.argv[i + 1] ? new Date(process.argv[i + 1]) : null;
}

async function main() {
  const now = new Date();
  for (const source of corporateActionSources) {
    const { data: state } = await admin
      .from("corporate_action_sync_state").select("last_synced_at").eq("source", source.name).maybeSingle();

    let from: Date;
    if (!source.supportsHistory) {
      from = new Date(now); from.setDate(from.getDate() - 30); // forthcoming-only; short lookback
    } else if (state?.last_synced_at) {
      from = new Date(state.last_synced_at); from.setDate(from.getDate() - OVERLAP_DAYS);
    } else {
      from = argFrom() ?? new Date(now.getFullYear() - 15, now.getMonth(), now.getDate());
    }

    try {
      let total = 0;
      for (const win of chunkWindows(from, now, CHUNK_DAYS)) {
        const raw = await source.fetchWindow(win.from, win.to);
        const rows = toRefRows(raw, source.name);
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await admin.from("corporate_action_ref")
            .upsert(chunk, { onConflict: "source,symbol,action_type,ex_date", ignoreDuplicates: false });
          if (error) throw new Error(error.message);
        }
        total += rows.length;
        await new Promise((r) => setTimeout(r, 800)); // throttle
      }
      await admin.from("corporate_action_sync_state")
        .upsert({ source: source.name, last_synced_at: now.toISOString() }, { onConflict: "source" });
      console.log(`${source.name}: upserted ${total} split/bonus rows; watermark → ${now.toISOString()}`);
    } catch (e) {
      console.error(`${source.name}: FAILED, watermark not advanced —`, e instanceof Error ? e.message : e);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/corporate-actions/sync-core.ts src/__tests__/lib/ca-sync-core.test.ts scripts/sync-corporate-actions.ts
git commit -m "feat(ca): offline market-wide sync with watermark + chunked backfill"
```

---

## Task 5: Data layer — feed lookup + scoped context load

**Files:**
- Modify: `src/lib/import/corporate-actions-data.ts`
- Test: `src/__tests__/lib/corporate-actions-data.test.ts`

**Interfaces:**
- Produces:
  - `loadRefBySymbols(client, symbols: string[]): Promise<Map<string, RefAction[]>>` where `RefAction = { symbol; isin: string|null; action_type: "split"|"bonus"; ex_date: string; factor: number }`, keyed by symbol.
  - `loadCorporateActionContext(client, stockIds?: string[])` — now accepts an optional stock_id filter (backward compatible; omitted = all).

- [ ] **Step 1: Write the failing test (mock supabase, verify batched symbol query + graceful empty)**

```typescript
import { describe, it, expect } from "vitest";
import { loadRefBySymbols } from "@/lib/import/corporate-actions-data";

function clientReturning(rows: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          // fetchAllRows calls .order().range()
          order: () => ({ range: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      }),
    }),
  };
}

describe("loadRefBySymbols", () => {
  it("groups feed rows by symbol", async () => {
    const client = clientReturning([
      { symbol: "TDPOWERSYS", isin: "INE419M01019", action_type: "split", ex_date: "2026-08-24", factor: 2 },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = await loadRefBySymbols(client as any, ["TDPOWERSYS"]);
    expect(map.get("TDPOWERSYS")).toHaveLength(1);
    expect(map.get("TDPOWERSYS")![0].factor).toBe(2);
  });

  it("returns an empty map for no symbols", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await loadRefBySymbols({} as any, [])).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/corporate-actions-data.test.ts`
Expected: FAIL — `loadRefBySymbols` not exported.

- [ ] **Step 3: Add `loadRefBySymbols` and scope `loadCorporateActionContext`**

Add to `src/lib/import/corporate-actions-data.ts`:

```typescript
import { fetchAllRows } from "@/lib/supabase/paginate";

export interface RefAction {
  symbol: string;
  isin: string | null;
  action_type: "split" | "bonus";
  ex_date: string;
  factor: number;
}

/** Feed rows for the given symbols, grouped by symbol. Empty on missing table. */
export async function loadRefBySymbols(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  symbols: string[]
): Promise<Map<string, RefAction[]>> {
  const out = new Map<string, RefAction[]>();
  const unique = [...new Set(symbols.filter(Boolean))];
  if (unique.length === 0) return out;
  try {
    const rows = await fetchAllRows<RefAction>((from, to) =>
      client
        .from("corporate_action_ref")
        .select("symbol, isin, action_type, ex_date, factor")
        .in("symbol", unique)
        .order("ex_date", { ascending: true })
        .range(from, to)
    );
    for (const r of rows) {
      const list = out.get(r.symbol) ?? [];
      list.push({ ...r, factor: Number(r.factor) });
      out.set(r.symbol, list);
    }
  } catch {
    return out; // table not present yet → no verification, all candidates inferred
  }
  return out;
}
```

Then modify the existing `loadCorporateActionContext` signature to `(client, stockIds?: string[])` and, when `stockIds` is provided and non-empty, add `.in("stock_id", stockIds)` to the `corporate_actions` query (leave the `indian_stocks` canonical query unchanged). Backward compatible: existing callers pass no `stockIds`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/corporate-actions-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/corporate-actions-data.ts src/__tests__/lib/corporate-actions-data.test.ts
git commit -m "feat(ca): feed lookup by symbol + scoped context load"
```

---

## Task 6: Detection engine — types + Signal A (oversold)

**Files:**
- Create: `src/lib/import/corporate-action-detect.ts`
- Test: `src/__tests__/lib/corporate-action-detect.test.ts`

**Interfaces:**
- Consumes: `computeFifoMatches` (fifo-engine), `securityKey`/`adjustQtyPrice` + `CorporateActionContext` (corporate-actions).
- Produces:
  - `interface SecurityTrades { symbol: string; stock_id: string | null; isin: string; account_id: string; trades: TradeForOpenPositions[]; holdingsQty: number | null }`
  - `interface CorporateActionCandidate { stock_id: string | null; symbol: string; isin: string; account_id: string; action_type: "split" | "bonus"; factor: number; ex_date_window: { from: string; to: string }; observed: { buys: number; sells: number; fifoOpen: number; holdings: number | null }; status: "inferred" | "unexplained"; matched_stock_ids?: string[] }`
  - `detectCorporateActions(securities: SecurityTrades[], ca: CorporateActionContext): CorporateActionCandidate[]`
- Snapping helper: `snapFactor(raw: number): number | null` (nearest of `[1.5,2,2.5,3,4,5,10]` within 3% tolerance, else null).

- [ ] **Step 1: Write the failing test (Signal A + snapping + guard)**

```typescript
import { describe, it, expect } from "vitest";
import { detectCorporateActions, snapFactor, type SecurityTrades } from "@/lib/import/corporate-action-detect";
import type { TradeForOpenPositions } from "@/lib/import/open-positions";

const EMPTY_CA = { canonicalMap: new Map<string, string>(), actionsBySecurity: new Map() };

function t(o: Partial<TradeForOpenPositions> & Pick<TradeForOpenPositions, "id" | "trade_type" | "quantity" | "price" | "trade_date">): TradeForOpenPositions {
  return { user_id: "u", account_id: "a", isin: "INE1", stock_id: "s1", symbol: "SYM", executed_at: null, broker_trade_id: o.id, ...o };
}

describe("snapFactor", () => {
  it("snaps near-2 to exactly 2", () => expect(snapFactor(2.02)).toBe(2));
  it("returns null for an implausible ratio", () => expect(snapFactor(7.3)).toBeNull());
});

describe("detectCorporateActions — Signal A (oversold)", () => {
  it("flags a 1:1 bonus (bought 100, sold 200) as an inferred split/bonus factor 2", () => {
    const sec: SecurityTrades = {
      symbol: "SYM", stock_id: "s1", isin: "INE1", account_id: "a", holdingsQty: 0,
      trades: [
        t({ id: "b", trade_type: "buy", quantity: 100, price: 1000, trade_date: "2024-01-01" }),
        t({ id: "s", trade_type: "sell", quantity: 200, price: 600, trade_date: "2024-09-01" }),
      ],
    };
    const [c] = detectCorporateActions([sec], EMPTY_CA);
    expect(c.status).toBe("inferred");
    expect(c.factor).toBe(2);
    expect(c.observed).toMatchObject({ buys: 100, sells: 200 });
  });

  it("does NOT flag a normal reconciled book", () => {
    const sec: SecurityTrades = {
      symbol: "SYM", stock_id: "s1", isin: "INE1", account_id: "a", holdingsQty: 0,
      trades: [
        t({ id: "b", trade_type: "buy", quantity: 100, price: 1000, trade_date: "2024-01-01" }),
        t({ id: "s", trade_type: "sell", quantity: 100, price: 1200, trade_date: "2024-09-01" }),
      ],
    };
    expect(detectCorporateActions([sec], EMPTY_CA)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/corporate-action-detect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `snapFactor`, types, and Signal A**

```typescript
import { computeFifoMatches } from "./fifo-engine";
import { securityKey, adjustQtyPrice, type CorporateActionContext } from "./corporate-actions";
import type { TradeForOpenPositions } from "./open-positions";

const PLAUSIBLE = [1.5, 2, 2.5, 3, 4, 5, 10];
const TOL = 0.03;

export function snapFactor(raw: number): number | null {
  let best: number | null = null;
  let bestErr = Infinity;
  for (const f of PLAUSIBLE) {
    const err = Math.abs(raw - f) / f;
    if (err <= TOL && err < bestErr) { best = f; bestErr = err; }
  }
  return best;
}

export interface SecurityTrades {
  symbol: string;
  stock_id: string | null;
  isin: string;
  account_id: string;
  trades: TradeForOpenPositions[];
  holdingsQty: number | null;
}

export interface CorporateActionCandidate {
  stock_id: string | null;
  symbol: string;
  isin: string;
  account_id: string;
  action_type: "split" | "bonus";
  factor: number;
  ex_date_window: { from: string; to: string };
  observed: { buys: number; sells: number; fifoOpen: number; holdings: number | null };
  status: "inferred" | "unexplained";
  matched_stock_ids?: string[];
}

const num = (v: number) => (typeof v === "number" ? v : Number(v));

/** Adjusted buy/sell totals under the currently-known CA context. */
function totals(sec: SecurityTrades, ca: CorporateActionContext) {
  let buys = 0, sells = 0;
  for (const t of sec.trades) {
    const key = securityKey(t.stock_id, t.isin, ca.canonicalMap);
    const { qty } = adjustQtyPrice(num(t.quantity), num(t.price), t.trade_date, ca.actionsBySecurity.get(key) ?? []);
    if (t.trade_type === "buy") buys += qty; else sells += qty;
  }
  return { buys, sells };
}

export function detectCorporateActions(
  securities: SecurityTrades[],
  ca: CorporateActionContext
): CorporateActionCandidate[] {
  const out: CorporateActionCandidate[] = [];
  for (const sec of securities) {
    const { buys, sells } = totals(sec, ca);
    const fifoOpen = Math.max(0, buys - sells);

    // Signal A — oversold: sold more than bought ⇒ a multiplier is missing.
    if (sells > buys + 1e-6 && buys > 0) {
      const snapped = snapFactor(sells / buys);
      const dates = sec.trades.map((t) => t.trade_date).sort();
      const candidate: CorporateActionCandidate = {
        stock_id: sec.stock_id, symbol: sec.symbol, isin: sec.isin, account_id: sec.account_id,
        action_type: "split", factor: snapped ?? sells / buys,
        ex_date_window: { from: dates[0], to: dates[dates.length - 1] },
        observed: { buys, sells, fifoOpen, holdings: sec.holdingsQty },
        status: snapped != null && Math.abs(buys * snapped - sells) < Math.max(1, buys * 0.01) ? "inferred" : "unexplained",
      };
      out.push(candidate);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/corporate-action-detect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/corporate-action-detect.ts src/__tests__/lib/corporate-action-detect.test.ts
git commit -m "feat(ca): detection engine — Signal A (oversold) + factor snapping"
```

---

## Task 7: Detection — Signal B (holdings mismatch) & Signal C (cross-ISIN)

**Files:**
- Modify: `src/lib/import/corporate-action-detect.ts`
- Test: `src/__tests__/lib/corporate-action-detect.test.ts` (append)

**Interfaces:**
- Produces: extends `detectCorporateActions` to also emit candidates from Signal B and Signal C; adds `matched_stock_ids` when a symbol spans multiple stock_ids (Signal C).

- [ ] **Step 1: Append failing tests**

```typescript
describe("detectCorporateActions — Signal B (holdings mismatch)", () => {
  it("flags factor 2 when FIFO-open is half the broker holdings", () => {
    const sec: SecurityTrades = {
      symbol: "SYM", stock_id: "s1", isin: "INE1", account_id: "a", holdingsQty: 200,
      trades: [ t({ id: "b", trade_type: "buy", quantity: 100, price: 1000, trade_date: "2024-01-01" }) ],
    };
    const [c] = detectCorporateActions([sec], EMPTY_CA);
    expect(c.factor).toBe(2);
    expect(c.status).toBe("inferred");
  });
});

describe("detectCorporateActions — Signal C (cross-ISIN, same symbol)", () => {
  it("links old→new stock_ids and proposes the factor (270 old, 1350 sold new)", () => {
    const sec: SecurityTrades = {
      symbol: "SYM", stock_id: "new", isin: "NEW", account_id: "a", holdingsQty: 0,
      trades: [
        t({ id: "b", stock_id: "old", isin: "OLD", trade_type: "buy", quantity: 270, price: 100, trade_date: "2025-01-01" }),
        t({ id: "s", stock_id: "new", isin: "NEW", trade_type: "sell", quantity: 1350, price: 30, trade_date: "2025-08-01" }),
      ],
    };
    const [c] = detectCorporateActions([sec], EMPTY_CA);
    expect(c.factor).toBe(5);
    expect(c.matched_stock_ids?.sort()).toEqual(["new", "old"]);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/__tests__/lib/corporate-action-detect.test.ts`
Expected: FAIL (Signal B/C not yet implemented — Signal C test finds no candidate or wrong factor; Signal B finds none).

- [ ] **Step 3: Extend `detectCorporateActions`**

Inside the loop, after Signal A, add Signal B (only when no Signal-A candidate was emitted for this security and holdings exists):

```typescript
    // Signal B — holdings mismatch (still-held): FIFO-open != holdings by a clean ratio.
    else if (sec.holdingsQty != null && sec.holdingsQty > 0 && fifoOpen > 0) {
      const ratio = sec.holdingsQty / fifoOpen;
      const snapped = snapFactor(ratio);
      if (snapped != null && Math.abs(fifoOpen * snapped - sec.holdingsQty) < Math.max(1, fifoOpen * 0.01)) {
        const dates = sec.trades.map((tt) => tt.trade_date).sort();
        out.push({
          stock_id: sec.stock_id, symbol: sec.symbol, isin: sec.isin, account_id: sec.account_id,
          action_type: "split", factor: snapped,
          ex_date_window: { from: dates[0], to: dates[dates.length - 1] },
          observed: { buys, sells, fifoOpen, holdings: sec.holdingsQty },
          status: "inferred",
        });
      }
    }
```

For **Signal C**, set `matched_stock_ids` on any candidate whenever the security's trades span more than one distinct `stock_id` (the symbol changed ISIN). Add just before pushing each candidate:

```typescript
    const distinctStockIds = [...new Set(sec.trades.map((tt) => tt.stock_id).filter((v): v is string => v != null))];
    // ...when building `candidate` / Signal B push, include:
    //   matched_stock_ids: distinctStockIds.length > 1 ? distinctStockIds : undefined,
```

Apply `matched_stock_ids: distinctStockIds.length > 1 ? distinctStockIds : undefined` to both the Signal A `candidate` object and the Signal B push. (The Signal C test exercises Signal A + cross-ISIN together: 270 buy under `old`, 1350 sell under `new`, factor 5, two stock_ids.)

- [ ] **Step 4: Run to verify all detection tests pass**

Run: `npx vitest run src/__tests__/lib/corporate-action-detect.test.ts`
Expected: PASS (Signal A, B, C, snapping, no-false-positive).

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/corporate-action-detect.ts src/__tests__/lib/corporate-action-detect.test.ts
git commit -m "feat(ca): detection Signals B (holdings) + C (cross-ISIN)"
```

---

## Task 8: Verification — classify candidates against the feed

**Files:**
- Create: `src/lib/import/corporate-action-verify.ts`
- Test: `src/__tests__/lib/corporate-action-verify.test.ts`

**Interfaces:**
- Consumes: `CorporateActionCandidate` (Task 6), `RefAction` (Task 5).
- Produces: `verifyCandidate(candidate: CorporateActionCandidate, refBySymbol: Map<string, RefAction[]>): { status: "verified" | "inferred" | "unexplained"; ex_date?: string }` — pure. A candidate is **verified** when a `RefAction` for its symbol has `action_type === candidate.action_type` (or either, since split/bonus both multiply), `ex_date` within `ex_date_window`, and `|factor − candidate.factor| / candidate.factor <= 0.02`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { verifyCandidate } from "@/lib/import/corporate-action-verify";
import type { CorporateActionCandidate } from "@/lib/import/corporate-action-detect";
import type { RefAction } from "@/lib/import/corporate-actions-data";

const base: CorporateActionCandidate = {
  stock_id: "s1", symbol: "TDPOWERSYS", isin: "INE419M01027", account_id: "a",
  action_type: "split", factor: 2, ex_date_window: { from: "2026-01-01", to: "2026-12-31" },
  observed: { buys: 100, sells: 200, fifoOpen: 0, holdings: 0 }, status: "inferred",
};

describe("verifyCandidate", () => {
  it("verifies when a feed row matches symbol + window + factor", () => {
    const ref = new Map<string, RefAction[]>([["TDPOWERSYS", [
      { symbol: "TDPOWERSYS", isin: "INE419M01019", action_type: "split", ex_date: "2026-08-24", factor: 2 },
    ]]]);
    expect(verifyCandidate(base, ref)).toEqual({ status: "verified", ex_date: "2026-08-24" });
  });

  it("stays inferred when no feed row matches", () => {
    expect(verifyCandidate(base, new Map()).status).toBe("inferred");
  });

  it("stays inferred when the factor disagrees", () => {
    const ref = new Map<string, RefAction[]>([["TDPOWERSYS", [
      { symbol: "TDPOWERSYS", isin: null, action_type: "split", ex_date: "2026-08-24", factor: 5 },
    ]]]);
    expect(verifyCandidate(base, ref).status).toBe("inferred");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/corporate-action-verify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `verifyCandidate`**

```typescript
import type { CorporateActionCandidate } from "./corporate-action-detect";
import type { RefAction } from "./corporate-actions-data";

export function verifyCandidate(
  candidate: CorporateActionCandidate,
  refBySymbol: Map<string, RefAction[]>
): { status: "verified" | "inferred" | "unexplained"; ex_date?: string } {
  if (candidate.status === "unexplained") return { status: "unexplained" };
  const refs = refBySymbol.get(candidate.symbol) ?? [];
  for (const r of refs) {
    const inWindow = r.ex_date >= candidate.ex_date_window.from && r.ex_date <= candidate.ex_date_window.to;
    const factorMatch = Math.abs(r.factor - candidate.factor) / candidate.factor <= 0.02;
    if (inWindow && factorMatch) return { status: "verified", ex_date: r.ex_date };
  }
  return { status: "inferred" };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/corporate-action-verify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/corporate-action-verify.ts src/__tests__/lib/corporate-action-verify.test.ts
git commit -m "feat(ca): verify candidates against feed by symbol/window/factor"
```

---

## Task 9: Import integration — detect, auto-apply verified, return candidates

**Files:**
- Modify: `src/lib/import/tradebook-types.ts` (add candidate result types)
- Modify: `src/lib/import/tradebook-import-engine.ts` (orchestrate)
- Modify: `src/app/(authenticated)/actions/tradebook-actions.ts` (thread candidates into `BatchImportResult`)
- Test: `src/__tests__/lib/tradebook-import-engine.test.ts` (append)

**Interfaces:**
- Consumes: `detectCorporateActions`, `verifyCandidate`, `loadRefBySymbols`, `loadCorporateActionContext`, `recomputeFifoForAccount`.
- Produces:
  - `tradebook-types.ts`: `AppliedCorporateAction = { symbol; action_type; factor; ex_date; source }` and `PendingCorporateAction = CorporateActionCandidate & { status: "inferred" | "unexplained" }`; extend `BatchImportResult` with `corporate_actions: { applied: AppliedCorporateAction[]; pending: PendingCorporateAction[] }`.
  - `tradebook-import-engine.ts`: `export async function detectAndApplyForAccount(admin, userId, accountId): Promise<{ applied: AppliedCorporateAction[]; pending: PendingCorporateAction[] }>` — loads the account's trades grouped by symbol (with holdings), runs detection + verification, **auto-applies verified** (writes `corporate_actions` with `source='nse'`, sets `canonical_stock_id` when `matched_stock_ids.length > 1`, then `recomputeFifoForAccount`), and returns applied + pending.

- [ ] **Step 1: Append an engine test (verified auto-applies; inferred returned, not written)**

```typescript
it("auto-applies a verified split and returns inferred ones", async () => {
  // Seed: trades that oversell (100 buy, 200 sell) + a matching ref row.
  _db.trades.push(
    { id: "b", user_id: "u", account_id: "acc-mock", symbol: "SYM", isin: "INE1", stock_id: "s1", trade_date: "2024-01-01", trade_type: "buy", quantity: 100, price: 1000, executed_at: null, broker_trade_id: "b" },
    { id: "s", user_id: "u", account_id: "acc-mock", symbol: "SYM", isin: "INE1", stock_id: "s1", trade_date: "2024-09-01", trade_type: "sell", quantity: 200, price: 600, executed_at: null, broker_trade_id: "s" },
  );
  _db.corporate_action_ref = [
    { symbol: "SYM", isin: "INE1", action_type: "split", ex_date: "2024-05-01", factor: 2 },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = makeAdminMock() as any;
  const res = await recomputeAndDetect(admin, "u", "acc-mock"); // helper: recompute then detectAndApplyForAccount
  expect(res.applied.some((a) => a.symbol === "SYM" && a.factor === 2)).toBe(true);
});
```

(Extend `makeAdminMock` in this test file to serve `corporate_action_ref` via `.in().order().range()` and `holdings` via `.eq()`, mirroring the existing `select` mock, and to accept `insert`/`upsert` on `corporate_actions`. Add `corporate_action_ref` and `holdings` to the `_db` object.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/tradebook-import-engine.test.ts`
Expected: FAIL — `detectAndApplyForAccount` not defined.

- [ ] **Step 3: Implement `detectAndApplyForAccount`**

In `tradebook-import-engine.ts`:

```typescript
import { detectCorporateActions, type SecurityTrades } from "./corporate-action-detect";
import { verifyCandidate } from "./corporate-action-verify";
import { loadRefBySymbols } from "./corporate-actions-data";

export async function detectAndApplyForAccount(admin: AdminClient, userId: string, accountId: string) {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
    admin.from("trades")
      .select("id, user_id, account_id, symbol, isin, stock_id, trade_date, trade_type, quantity, price, executed_at, broker_trade_id")
      .eq("account_id", accountId).order("id", { ascending: true }).range(from, to));

  const ca = await loadCorporateActionContext(admin);

  // Group by symbol; attach holdings qty per symbol (broker statement).
  const bySymbol = new Map<string, SecurityTrades>();
  for (const r of rows) {
    const sym = String(r.symbol ?? "");
    const g = bySymbol.get(sym) ?? {
      symbol: sym, stock_id: (r.stock_id as string | null) ?? null, isin: String(r.isin ?? ""),
      account_id: accountId, trades: [], holdingsQty: null,
    };
    g.trades.push({
      id: r.id as string, user_id: r.user_id as string, account_id: accountId, symbol: sym,
      isin: String(r.isin ?? ""), stock_id: (r.stock_id as string | null) ?? null,
      trade_date: r.trade_date as string, trade_type: r.trade_type as "buy" | "sell",
      quantity: Number(r.quantity), price: Number(r.price),
      executed_at: (r.executed_at as string | null) ?? null, broker_trade_id: (r.broker_trade_id as string) ?? "",
    });
    bySymbol.set(sym, g);
  }

  const { data: hRows } = await admin.from("holdings").select("isin, quantity").eq("account_id", accountId);
  const holdByIsin = new Map<string, number>();
  for (const h of (hRows ?? []) as Array<{ isin: string; quantity: number | string }>) {
    holdByIsin.set(h.isin, (holdByIsin.get(h.isin) ?? 0) + Number(h.quantity));
  }
  for (const g of bySymbol.values()) {
    const q = [...new Set(g.trades.map((t) => t.isin))].reduce((s, i) => s + (holdByIsin.get(i) ?? 0), 0);
    g.holdingsQty = q > 0 ? q : (holdByIsin.size > 0 ? 0 : null);
  }

  const candidates = detectCorporateActions([...bySymbol.values()], ca);
  const refBySymbol = await loadRefBySymbols(admin, candidates.map((c) => c.symbol));

  const applied: AppliedCorporateAction[] = [];
  const pending: PendingCorporateAction[] = [];
  let didApply = false;

  for (const c of candidates) {
    const v = verifyCandidate(c, refBySymbol);
    if (v.status === "verified" && v.ex_date && c.stock_id) {
      // Link ISIN change if the symbol spanned two stock_ids.
      if (c.matched_stock_ids && c.matched_stock_ids.length > 1) {
        for (const old of c.matched_stock_ids) {
          if (old !== c.stock_id) await admin.from("indian_stocks").update({ canonical_stock_id: c.stock_id }).eq("id", old);
        }
      }
      await admin.from("corporate_actions").upsert(
        { stock_id: c.stock_id, action_type: c.action_type, ex_date: v.ex_date, factor: c.factor, source: "nse" },
        { onConflict: "stock_id,action_type,ex_date" });
      applied.push({ symbol: c.symbol, action_type: c.action_type, factor: c.factor, ex_date: v.ex_date, source: "nse" });
      didApply = true;
    } else {
      pending.push({ ...c, status: v.status });
    }
  }

  if (didApply) await recomputeFifoForAccount(admin, userId, accountId);
  return { applied, pending };
}
```

Then, in the existing per-account flow of `executeTradebookImport` (and the batch path), call `detectAndApplyForAccount` after the initial `recomputeFifoForAccount`, and include its result. (Detection is safe to skip on error — wrap in try/catch returning `{applied:[],pending:[]}`.)

- [ ] **Step 4: Thread into the server action**

In `tradebook-actions.ts`, after the per-account recompute loop in `importTradebooks`, call `detectAndApplyForAccount` for each affected account (via a fresh admin client) and merge `applied`/`pending` into the returned `BatchImportResult.corporate_actions`.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/__tests__/lib/tradebook-import-engine.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck & commit**

Run: `npx tsc --noEmit`

```bash
git add src/lib/import/tradebook-types.ts src/lib/import/tradebook-import-engine.ts "src/app/(authenticated)/actions/tradebook-actions.ts" src/__tests__/lib/tradebook-import-engine.test.ts
git commit -m "feat(ca): detect + auto-apply verified corporate actions on import"
```

---

## Task 10: `applyCorporateAction` server action (confirm inferred)

**Files:**
- Modify: `src/app/(authenticated)/actions/tradebook-actions.ts`
- Test: none new (thin wrapper over tested engine pieces; verified by typecheck + Task 11 UI)

**Interfaces:**
- Produces: `applyCorporateAction(input: { stock_id: string; action_type: "split" | "bonus"; ex_date: string; factor: number; matched_stock_ids?: string[] }): Promise<ActionResult>` — ownership-checks the account/security, sets `canonical_stock_id` for any `matched_stock_ids`, upserts `corporate_actions` with `source='inferred'`, then `recomputeFifoForAccount` for the caller's accounts holding that security.

- [ ] **Step 1: Implement the action**

```typescript
export async function applyCorporateAction(input: {
  stock_id: string; action_type: "split" | "bonus"; ex_date: string; factor: number; matched_stock_ids?: string[];
}): Promise<ActionResult> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();
    if (!(input.factor > 0)) throw new AppError("Invalid corporate-action factor.");
    const admin = createAdminClient();

    if (input.matched_stock_ids?.length) {
      for (const old of input.matched_stock_ids) {
        if (old !== input.stock_id) {
          await admin.from("indian_stocks").update({ canonical_stock_id: input.stock_id }).eq("id", old);
        }
      }
    }
    const { error } = await admin.from("corporate_actions").upsert(
      { stock_id: input.stock_id, action_type: input.action_type, ex_date: input.ex_date, factor: input.factor, source: "inferred" },
      { onConflict: "stock_id,action_type,ex_date" });
    if (error) throw new AppError(error.message);

    // Recompute the caller's accounts that trade this canonical security.
    const { data: accts } = await supabase.from("accounts").select("id");
    for (const a of (accts ?? []) as Array<{ id: string }>) {
      await recomputeFifoForAccount(admin, user.id, a.id);
    }
  });
}
```

(Import `createAdminClient` and `recomputeFifoForAccount` at the top of the file if not already present.)

- [ ] **Step 2: Typecheck & commit**

Run: `npx tsc --noEmit`

```bash
git add "src/app/(authenticated)/actions/tradebook-actions.ts"
git commit -m "feat(ca): applyCorporateAction server action for confirmed inferred actions"
```

---

## Task 11: Import dialog — Corporate actions section

**Files:**
- Modify: `src/components/trades/trade-import-dialog.tsx`

**Interfaces:**
- Consumes: `BatchImportResult.corporate_actions` (Task 9), `applyCorporateAction` (Task 10), `useInvalidateTrades`.

- [ ] **Step 1: Render the section (no unit test — UI; verified by run)**

After the summary block, when `result.corporate_actions` has entries, render:

```tsx
{ca && (ca.applied.length > 0 || ca.pending.length > 0) && (
  <div className="space-y-2 rounded-lg border p-3 text-sm">
    <p className="font-medium">Corporate actions</p>

    {ca.applied.map((a, i) => (
      <p key={`ap-${i}`} className="text-xs text-green-700 dark:text-green-400">
        ✓ {a.symbol}: {a.action_type} ×{a.factor} on {a.ex_date} — auto-applied ({a.source})
      </p>
    ))}

    {ca.pending.filter((p) => p.status === "inferred").map((p, i) => (
      <div key={`pd-${i}`} className="rounded-md border bg-muted/30 p-2 text-xs">
        <p>
          <span className="font-medium">{p.symbol}</span>: sold {p.observed.sells} but bought{" "}
          {p.observed.buys}. A ×{p.factor} {p.action_type} (~{p.ex_date_window.from}…{p.ex_date_window.to}) explains it.
        </p>
        <div className="mt-1.5 flex gap-2">
          <Button size="sm" onClick={() => confirmAction(p)} disabled={busy}>Apply</Button>
        </div>
      </div>
    ))}

    {ca.pending.filter((p) => p.status === "unexplained").map((p, i) => (
      <p key={`ux-${i}`} className="text-xs text-muted-foreground">
        ⚠ {p.symbol}: sold {p.observed.sells} vs bought {p.observed.buys} — no clean split/bonus explains it; review manually.
      </p>
    ))}
  </div>
)}
```

Where `ca = result.corporate_actions`, and `confirmAction(p)` calls `applyCorporateAction({ stock_id: p.stock_id!, action_type: p.action_type, ex_date: p.ex_date_window.from, factor: p.factor, matched_stock_ids: p.matched_stock_ids })`, then on `ok` invalidates trades and removes the card from local state (toastError on failure).

- [ ] **Step 2: Verify build + run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean, full suite passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/trades/trade-import-dialog.tsx
git commit -m "feat(ca): corporate-actions review section in import dialog"
```

---

## Task 12: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src/lib/import src/lib/corporate-actions "src/app/(authenticated)/actions/tradebook-actions.ts" src/components/trades/trade-import-dialog.tsx`
Expected: typecheck clean, all tests pass, lint clean.

- [ ] **Step 2: Manual/offline sanity (operator, Node 22, non-blocked IP)**

Run: `npx tsx scripts/sync-corporate-actions.ts --from 2020-01-01`
Expected: upserts split/bonus rows into `corporate_action_ref`; watermark set. (Requires migration 007 applied.)

- [ ] **Step 3: Confirm reconciliation on a known case**

Re-import (or trigger recompute for) an account holding a split stock (e.g. TDPOWERSYS) and confirm the trades dashboard reconciles and the dialog shows the action as auto-applied.

---

## Self-Review Notes

- **Spec coverage:** feed table + indexes (T1), equity-only factor parse incl. NCRPS exclusion (T2), NSE/BSE sources + BSE forthcoming-only (T3), market-wide watermark sync + chunked backfill + `--from` (T4), scoped context load + feed lookup (T5), detection Signals A/B/C + snapping + reconciliation guard (T6–T7), symbol-primary verification (T8), auto-apply-verified + canonical linking + return-pending (T9), confirm-inferred action (T10), UX with auto-applied / needs-confirm / manual-review (T11). ✅
- **Reconciliation guard:** enforced in detection (status `inferred` only when `buys*factor ≈ sells` / `open*factor ≈ holdings`); `unexplained` never auto-applies.
- **Offline isolation:** only T3 files + T4 script import `nse-bse-api`; no app path imports them (keeps it out of the Vercel bundle).
- **Type consistency:** `CorporateActionCandidate`, `RefAction`, `AppliedCorporateAction`, `PendingCorporateAction`, `SecurityTrades` names are used identically across T5–T11.
