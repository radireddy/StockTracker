# Merger Feed Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mergers flow through the same NSE/BSE feed pipeline as splits and bonuses — fetched by the sync script, stored in `corporate_action_ref`, and auto-applied during tradebook import when an orphan pair is confirmed by the feed.

**Architecture:** The NSE feed identifies the absorbed company's symbol and ex_date for a merger event, but rarely includes the swap ratio or acquirer symbol in the subject string. The orphan-pair heuristic already detects the surviving/absorbed pair from trade data and computes the ratio. This plan wires them together: feed confirms the event + provides the ex_date; orphan-pair provides the ratio and the surviving stock. When both agree, the merger is auto-applied without user intervention. When the feed has no record, the pair stays as a manual suggestion (current behaviour).

**Tech Stack:** Supabase PostgreSQL, TypeScript, Vitest, `nse-bse-api` npm package, Next.js server actions.

**Spec:** No separate spec — this extends the existing corporate-action pipeline documented in `src/lib/import/corporate-action-*.ts` and the sync script `scripts/sync-corporate-actions.ts`.

## Global Constraints

- Run `npm test` (Vitest) after every task — all existing tests must stay green.
- Never add `action_type='merger'` to the `corporate_actions` table except through the existing `recordMerger` code path (which validates ratio > 0). The feed path uses the same upsert with `source='nse'`.
- `corporate_action_ref` is write-only from the sync script (service role); readable by authenticated users. Do not add any user-scoped rows here.
- `factor` in `corporate_action_ref` is nullable after Task 1 — only for merger rows. Splits and bonuses always have factor > 0.
- Migration 010 must be applied in Supabase Dashboard SQL editor before running the sync script.
- Offline sync script (`scripts/sync-corporate-actions.ts`) is Node-only — never import from app/serverless code.
- All new pure functions go in existing files; do not create new source files unless a file grows past ~150 lines from additions.

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/010_merger_ref.sql` | **Create** — relax action_type + factor constraints, add acquirer columns |
| `src/lib/import/corporate-action-factor.ts` | **Modify** — add merger parser, refine exclusion logic, widen return type |
| `src/lib/corporate-actions/sync-core.ts` | **Modify** — widen `RefRow` (factor nullable, add acquirer fields, add merger to action_type) |
| `scripts/sync-corporate-actions.ts` | **Modify** — log counts by type (no logic change needed; upsert passes through) |
| `src/lib/import/corporate-actions-data.ts` | **Modify** — widen `RefAction` (action_type, factor nullable, add acquirer_symbol), add acquirer_symbol to select |
| `src/lib/import/merger-detect.ts` | **Modify** — add `matchOrphanPairsWithFeed` that cross-references pairs against the feed |
| `src/lib/import/tradebook-import-engine.ts` | **Modify** — call `matchOrphanPairsWithFeed` in `detectAndApplyForAccount`, auto-apply confirmed mergers |
| `src/__tests__/lib/corporate-action-factor.test.ts` | **Modify** — add merger subject test cases |
| `src/__tests__/lib/ca-sync-core.test.ts` | **Modify** — add merger row in `toRefRows` test |
| `src/__tests__/lib/merger-detect.test.ts` | **Modify** — add `matchOrphanPairsWithFeed` tests |

---

### Task 1: DB Migration — extend `corporate_action_ref` for mergers

**Files:**
- Create: `supabase/migrations/010_merger_ref.sql`

**Interfaces:**
- Produces: `corporate_action_ref` columns `acquirer_symbol TEXT`, `acquirer_isin TEXT`; nullable `factor`; `action_type` allows `'merger'`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/010_merger_ref.sql
-- Extends corporate_action_ref to support merger/amalgamation events.
-- Apply manually via Supabase Dashboard SQL editor.

-- 1. Allow 'merger' in action_type (drop + recreate check constraint).
ALTER TABLE corporate_action_ref
  DROP CONSTRAINT IF EXISTS corporate_action_ref_action_type_check;

ALTER TABLE corporate_action_ref
  ADD CONSTRAINT corporate_action_ref_action_type_check
    CHECK (action_type IN ('split', 'bonus', 'merger'));

-- 2. Make factor nullable — merger ratio is often absent from the feed subject.
ALTER TABLE corporate_action_ref
  ALTER COLUMN factor DROP NOT NULL;

-- Replace NOT NULL + implied > 0 with: null OR > 0.
ALTER TABLE corporate_action_ref
  DROP CONSTRAINT IF EXISTS corporate_action_ref_factor_check;

ALTER TABLE corporate_action_ref
  ADD CONSTRAINT corporate_action_ref_factor_check
    CHECK (factor IS NULL OR factor > 0);

-- 3. Add acquirer columns (nullable; splits/bonuses leave these NULL).
ALTER TABLE corporate_action_ref
  ADD COLUMN IF NOT EXISTS acquirer_symbol TEXT;

ALTER TABLE corporate_action_ref
  ADD COLUMN IF NOT EXISTS acquirer_isin TEXT;

CREATE INDEX IF NOT EXISTS idx_ca_ref_merger_symbol
  ON corporate_action_ref (symbol, ex_date)
  WHERE action_type = 'merger';

-- POST-APPLY CHECK:
--   SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'corporate_action_ref'
--   ORDER BY ordinal_position;
```

- [ ] **Step 2: Apply in Supabase Dashboard SQL editor**

Paste the file contents into the SQL editor and run. Verify with the post-apply query above.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/010_merger_ref.sql
git commit -m "feat(ca): extend corporate_action_ref for merger events (010)"
```

---

### Task 2: Merger parser + tests

**Files:**
- Modify: `src/lib/import/corporate-action-factor.ts`
- Modify: `src/__tests__/lib/corporate-action-factor.test.ts`

**Interfaces:**
- Produces: `parseCorporateAction(subject)` now returns `{ action_type: "split" | "bonus"; factor: number } | { action_type: "merger"; factor: number | null } | null`
- Consumers: `sync-core.ts:toRefRows` (Task 3)

- [ ] **Step 1: Write failing tests for merger subjects**

Add to `src/__tests__/lib/corporate-action-factor.test.ts`:

```ts
it("detects merger/amalgamation subjects", () => {
  // Subject without a ratio → factor null
  expect(parseCorporateAction("Merger")).toEqual({ action_type: "merger", factor: null });
  expect(parseCorporateAction("Amalgamation")).toEqual({ action_type: "merger", factor: null });
  expect(parseCorporateAction("Scheme of Arrangement - Amalgamation")).toEqual({ action_type: "merger", factor: null });
  expect(parseCorporateAction("Scheme Of Arrangement- Merger with HDFC Bank Ltd")).toEqual({ action_type: "merger", factor: null });

  // Subject with an explicit ratio
  expect(parseCorporateAction("Merger in ratio 42:25")).toEqual({ action_type: "merger", factor: 42 / 25 });
});

it("still rejects non-equity Scheme of Arrangement (NCRPS bonus)", () => {
  // The existing test case — must stay null, not a merger.
  expect(parseCorporateAction("Scheme Of Arrangement - Bonus Ncrps 4:1")).toBeNull();
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/__tests__/lib/corporate-action-factor.test.ts
```

Expected: FAIL — `merger` subjects return null, `Scheme Of Arrangement - Bonus Ncrps` may now wrongly return merger.

- [ ] **Step 3: Implement in `corporate-action-factor.ts`**

Replace the file with the following (full rewrite — the file is small):

```ts
/** Parse an NSE/BSE corporate-action subject into an equity share-multiplier.
 *  Returns null for anything that isn't an equity split, bonus, or merger. */
export function parseCorporateAction(
  subject: string
): { action_type: "split" | "bonus"; factor: number } | { action_type: "merger"; factor: number | null } | null {
  const s = subject.toLowerCase();

  // Exclude non-equity instruments outright.
  if (/ncrps|preference|warrant|debenture/.test(s)) return null;
  // Scheme of Arrangement is only valid when it IS a merger/amalgamation.
  if (/scheme of arrangement/.test(s) && !/merger|amalgam/.test(s)) return null;

  // Merger / amalgamation: detect first (before bonus, to avoid false bonus match).
  if (/\bmerger\b|amalgam/.test(s)) {
    // Try to parse an explicit ratio like "42:25".
    const m = s.match(/(\d+)\s*:\s*(\d+)/);
    if (m) {
      const num = parseInt(m[1], 10);
      const den = parseInt(m[2], 10);
      if (num > 0 && den > 0) return { action_type: "merger", factor: num / den };
    }
    return { action_type: "merger", factor: null };
  }

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

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/__tests__/lib/corporate-action-factor.test.ts
```

Expected: all green.

- [ ] **Step 5: Run full suite to check no regressions**

```bash
npm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/corporate-action-factor.ts src/__tests__/lib/corporate-action-factor.test.ts
git commit -m "feat(ca): parse merger/amalgamation subjects in corporate-action-factor"
```

---

### Task 3: Sync-core types + toRefRows + tests

**Files:**
- Modify: `src/lib/corporate-actions/sync-core.ts`
- Modify: `src/__tests__/lib/ca-sync-core.test.ts`

**Interfaces:**
- Produces: `RefRow { ..., action_type: "split" | "bonus" | "merger"; factor: number | null; acquirer_symbol: string | null; acquirer_isin: string | null }`
- Produces: `toRefRows` returns rows for mergers (factor may be null)
- Consumers: `scripts/sync-corporate-actions.ts` upsert (Task 4 — no code change needed, the object just gets new fields)

- [ ] **Step 1: Write failing test for merger row in toRefRows**

Add to `src/__tests__/lib/ca-sync-core.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/__tests__/lib/ca-sync-core.test.ts
```

Expected: FAIL — merger subjects not yet handled.

- [ ] **Step 3: Update `sync-core.ts`**

```ts
import { parseCorporateAction } from "@/lib/import/corporate-action-factor";
import type { RawCorporateAction } from "@/lib/corporate-actions/sources/types";

export interface RefRow {
  source: string;
  symbol: string;
  isin: string | null;
  action_type: "split" | "bonus" | "merger";
  ex_date: string;
  factor: number | null;        // null only for mergers where ratio is unknown
  raw_subject: string;
  acquirer_symbol: string | null;
  acquirer_isin: string | null;
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
      acquirer_symbol: null,   // reserved for future subject parsing
      acquirer_isin: null,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/__tests__/lib/ca-sync-core.test.ts
```

Expected: all green.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all green. TypeScript may flag `factor: number | null` at the upsert call in `sync-corporate-actions.ts` — fix in next step if needed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/corporate-actions/sync-core.ts src/__tests__/lib/ca-sync-core.test.ts
git commit -m "feat(ca): extend RefRow + toRefRows to handle merger type"
```

---

### Task 4: Sync script — log merger counts

**Files:**
- Modify: `scripts/sync-corporate-actions.ts`

**Interfaces:**
- No interface change — the upsert passes `RefRow` objects directly; new fields (`acquirer_symbol`, `acquirer_isin`) go straight through. The only change is the log message, which currently hard-codes "split/bonus rows".

- [ ] **Step 1: Update the log message to reflect all action types**

In `scripts/sync-corporate-actions.ts`, find line ~55:

```ts
console.log(`${source.name}: upserted ${total} split/bonus rows; watermark → ${now.toISOString()}`);
```

Change to:

```ts
console.log(`${source.name}: upserted ${total} rows (split/bonus/merger); watermark → ${now.toISOString()}`);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors. If `factor: number | null` causes a type error in the upsert (Supabase client may infer non-null), cast: `factor: parsed.factor as number | null`.

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-corporate-actions.ts
git commit -m "chore(ca): update sync script log to mention merger rows"
```

---

### Task 5: Data layer — widen RefAction and load merger rows

**Files:**
- Modify: `src/lib/import/corporate-actions-data.ts`

**Interfaces:**
- Produces: `RefAction { ..., action_type: "split" | "bonus" | "merger"; factor: number | null; acquirer_symbol: string | null }`
- Consumers: `corporate-action-verify.ts:feedActionsToApply` (already handles only split/bonus — no change needed there), `merger-detect.ts:matchOrphanPairsWithFeed` (Task 6)

- [ ] **Step 1: Update `RefAction` interface and query**

In `src/lib/import/corporate-actions-data.ts`, update:

```ts
export interface RefAction {
  symbol: string;
  isin: string | null;
  action_type: "split" | "bonus" | "merger";
  ex_date: string;
  factor: number | null;       // null for mergers where ratio not in feed
  acquirer_symbol: string | null;
}
```

In `loadRefForSecurities`, update the `.select()` call to include `acquirer_symbol`:

```ts
client
  .from("corporate_action_ref")
  .select("symbol, isin, action_type, ex_date, factor, acquirer_symbol")
  .in(col, vals)
  .order("ex_date", { ascending: true })
  .range(from, to)
```

Also update the dedup key (line ~52) to include action_type:

```ts
const k = `${r.symbol}|${r.isin ?? ""}|${r.action_type}|${r.ex_date}|${r.factor ?? "null"}`;
```

And the list push inside the per-security loop:

```ts
const list = uniq
  .filter((r) => r.symbol === s.symbol || (r.isin != null && r.isin === s.isin))
  .map((r) => ({ ...r, factor: r.factor != null ? Number(r.factor) : null, acquirer_symbol: r.acquirer_symbol ?? null }));
```

- [ ] **Step 2: Check `feedActionsToApply` still compiles**

`corporate-action-verify.ts:feedActionsToApply` uses `RefAction.factor` — now nullable. Find where `factor: num(a.factor)` is used and guard:

```ts
// In feedActionsToApply, the loop over feedActions:
if (a.action_type === "merger") continue;  // mergers handled separately; skip here
```

This keeps `feedActionsToApply` producing only split/bonus `CorporateAction` objects (which require non-null factor).

Similarly in `reconcileWithFeed`, add the same guard early:

```ts
// In reconcileWithFeed:
const relevant = feedActions.filter(
  (a) =>
    a.action_type !== "merger" &&   // ADD THIS LINE
    a.ex_date > earliest &&
    ...
);
```

- [ ] **Step 3: Run full suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/import/corporate-actions-data.ts src/lib/import/corporate-action-verify.ts
git commit -m "feat(ca): widen RefAction to include merger rows; skip mergers in split/bonus verify path"
```

---

### Task 6: Feed-confirmed merger matching + tests

**Files:**
- Modify: `src/lib/import/merger-detect.ts`
- Modify: `src/__tests__/lib/merger-detect.test.ts`

**Interfaces:**
- Consumes: `OrphanPairSuggestion` (from `tradebook-types.ts`), `RefAction` (from `corporate-actions-data.ts`)
- Produces: `matchOrphanPairsWithFeed(pairs, refBySymbol) → { confirmed: ConfirmedMerger[]; unconfirmed: OrphanPairSuggestion[] }`
  where `ConfirmedMerger = OrphanPairSuggestion & { ex_date: string }`

- [ ] **Step 1: Write failing tests for `matchOrphanPairsWithFeed`**

Add to `src/__tests__/lib/merger-detect.test.ts`:

```ts
import { matchOrphanPairsWithFeed } from "@/lib/import/merger-detect";
import type { OrphanPairSuggestion } from "@/lib/import/tradebook-types";
import type { RefAction } from "@/lib/import/corporate-actions-data";

function refAction(symbol: string, ex_date: string, acquirer_symbol: string | null = null): RefAction {
  return { symbol, isin: null, action_type: "merger", ex_date, factor: null, acquirer_symbol };
}

function pair(fromSymbol: string, fromStockId: string, toSymbol: string, toStockId: string | null): OrphanPairSuggestion {
  return { fromSymbol, fromStockId, toSymbol, toStockId, impliedRatio: 2.31, fromQty: 1020, toQty: 2356 };
}

describe("matchOrphanPairsWithFeed", () => {
  it("confirms a pair when feed has merger for the sell-only (absorbed) symbol", () => {
    const pairs = [pair("EQUITASBNK", "survives-id", "EQUITAS", "absorbed-id")];
    // sell-only symbol = pair.toSymbol = "EQUITAS"
    const refBySymbol = new Map<string, RefAction[]>([
      ["EQUITAS", [refAction("EQUITAS", "2024-10-15")]],
    ]);
    const { confirmed, unconfirmed } = matchOrphanPairsWithFeed(pairs, refBySymbol);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].ex_date).toBe("2024-10-15");
    expect(confirmed[0].fromSymbol).toBe("EQUITASBNK");
    expect(confirmed[0].toSymbol).toBe("EQUITAS");
    expect(unconfirmed).toHaveLength(0);
  });

  it("leaves pair unconfirmed when feed has no merger for the absorbed symbol", () => {
    const pairs = [pair("EQUITASBNK", "survives-id", "EQUITAS", "absorbed-id")];
    const refBySymbol = new Map<string, RefAction[]>();
    const { confirmed, unconfirmed } = matchOrphanPairsWithFeed(pairs, refBySymbol);
    expect(confirmed).toHaveLength(0);
    expect(unconfirmed).toHaveLength(1);
  });

  it("leaves pair unconfirmed when feed acquirer_symbol does not match fromSymbol", () => {
    const pairs = [pair("EQUITASBNK", "survives-id", "EQUITAS", "absorbed-id")];
    const refBySymbol = new Map<string, RefAction[]>([
      // Feed says acquirer is SOMEBANK, but orphan pair says EQUITASBNK — mismatch
      ["EQUITAS", [refAction("EQUITAS", "2024-10-15", "SOMEBANK")]],
    ]);
    const { confirmed, unconfirmed } = matchOrphanPairsWithFeed(pairs, refBySymbol);
    expect(confirmed).toHaveLength(0);
    expect(unconfirmed).toHaveLength(1);
  });

  it("skips pair when fromStockId or toStockId is null (cannot write canonical pointer)", () => {
    const pairWithNullTo = pair("EQUITASBNK", "survives-id", "EQUITAS", null);
    const refBySymbol = new Map<string, RefAction[]>([
      ["EQUITAS", [refAction("EQUITAS", "2024-10-15")]],
    ]);
    const { confirmed, unconfirmed } = matchOrphanPairsWithFeed([pairWithNullTo], refBySymbol);
    expect(confirmed).toHaveLength(0);
    expect(unconfirmed).toHaveLength(1);
  });

  it("accepts pair when feed acquirer_symbol is null (no acquirer info in feed)", () => {
    const pairs = [pair("EQUITASBNK", "survives-id", "EQUITAS", "absorbed-id")];
    const refBySymbol = new Map<string, RefAction[]>([
      ["EQUITAS", [refAction("EQUITAS", "2024-10-15", null)]],
    ]);
    const { confirmed } = matchOrphanPairsWithFeed(pairs, refBySymbol);
    expect(confirmed).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/__tests__/lib/merger-detect.test.ts
```

Expected: FAIL — `matchOrphanPairsWithFeed` not exported.

- [ ] **Step 3: Implement `matchOrphanPairsWithFeed` in `merger-detect.ts`**

Add to `src/lib/import/merger-detect.ts` (after existing `detectOrphanPairs`):

```ts
import type { RefAction } from "./corporate-actions-data";
import type { OrphanPairSuggestion } from "./tradebook-types";

export interface ConfirmedMerger extends OrphanPairSuggestion {
  ex_date: string;
}

/**
 * Cross-reference orphan pairs with the NSE/BSE merger reference feed.
 *
 * In an orphan pair, pair.toSymbol is the sell-only (absorbed) company and
 * pair.fromSymbol is the buy-only (surviving) company. The feed records the
 * merger event on the absorbed symbol. When the feed confirms the event AND
 * does not name a different acquirer, the pair is promoted to auto-apply.
 *
 * A pair is left unconfirmed when:
 *   - No merger ref exists for the absorbed symbol.
 *   - The ref's acquirer_symbol is non-null and differs from pair.fromSymbol.
 *   - Either stockId is null (can't write the canonical pointer).
 */
export function matchOrphanPairsWithFeed(
  pairs: OrphanPairSuggestion[],
  refBySymbol: Map<string, RefAction[]>
): { confirmed: ConfirmedMerger[]; unconfirmed: OrphanPairSuggestion[] } {
  const confirmed: ConfirmedMerger[] = [];
  const unconfirmed: OrphanPairSuggestion[] = [];

  for (const pair of pairs) {
    if (!pair.fromStockId || !pair.toStockId) {
      unconfirmed.push(pair);
      continue;
    }

    // pair.toSymbol = sell-only = absorbed company = what the feed records on.
    const feedForAbsorbed = (refBySymbol.get(pair.toSymbol) ?? []).filter(
      (r) => r.action_type === "merger"
    );

    if (feedForAbsorbed.length === 0) {
      unconfirmed.push(pair);
      continue;
    }

    // Use the latest merger ref entry (most relevant if multiple exist).
    const mergerRef = feedForAbsorbed[feedForAbsorbed.length - 1];

    // If feed names a specific acquirer, it must match the buy-only (surviving) symbol.
    if (mergerRef.acquirer_symbol !== null && mergerRef.acquirer_symbol !== pair.fromSymbol) {
      unconfirmed.push(pair);
      continue;
    }

    confirmed.push({ ...pair, ex_date: mergerRef.ex_date });
  }

  return { confirmed, unconfirmed };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/__tests__/lib/merger-detect.test.ts
```

Expected: all green.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/merger-detect.ts src/__tests__/lib/merger-detect.test.ts
git commit -m "feat(ca): add matchOrphanPairsWithFeed — promote feed-confirmed orphan pairs"
```

---

### Task 7: Wire auto-apply into `detectAndApplyForAccount`

**Files:**
- Modify: `src/lib/import/tradebook-import-engine.ts`

**Interfaces:**
- Consumes: `matchOrphanPairsWithFeed` (Task 6), `ConfirmedMerger` (Task 6)
- Result: `detectAndApplyForAccount` now returns feed-confirmed mergers in `applied[]` instead of `mergerSuggestions[]`

- [ ] **Step 1: Add the import and auto-apply block**

At the top of `tradebook-import-engine.ts`, add to the `merger-detect` import:

```ts
import { detectOrphanPairs, matchOrphanPairsWithFeed } from "./merger-detect";
```

In `detectAndApplyForAccount`, replace the existing final block (starting from the `const mergerSuggestions = detectOrphanPairs(...)` line on ~356) with:

```ts
// Pass 3 — merger auto-apply: cross-reference orphan pairs against the
// merger ref feed. Confirmed pairs are applied here (no user action needed);
// unconfirmed ones surface as manual suggestions.
const allPairs = detectOrphanPairs(securities, ca);
const { confirmed: confirmedMergers, unconfirmed: mergerSuggestions } =
  matchOrphanPairsWithFeed(allPairs, refBySymbol);

for (const m of confirmedMergers) {
  // m.toStockId = absorbed (sell-only); m.fromStockId = surviving (buy-only).
  // Both are guaranteed non-null by matchOrphanPairsWithFeed.

  // 1. Point absorbed → surviving (canonical supersession).
  const { error: canonErr } = await admin
    .from("indian_stocks")
    .update({ canonical_stock_id: m.fromStockId })
    .eq("id", m.toStockId as string);
  if (canonErr) {
    log.warn("auto-merge: canonical update failed", { pair: m, error: canonErr.message });
    mergerSuggestions.push(m);
    continue;
  }

  // 2. Upsert merger corporate action on surviving stock.
  const { error: caErr } = await admin
    .from("corporate_actions")
    .upsert(
      {
        stock_id: m.fromStockId,
        action_type: "merger",
        ex_date: m.ex_date,
        factor: m.impliedRatio,
        source: "nse",
      },
      { onConflict: "stock_id,action_type,ex_date" }
    );
  if (caErr) {
    log.warn("auto-merge: corporate_actions upsert failed", { pair: m, error: caErr.message });
    // Undo canonical update to leave state consistent before surfacing as suggestion.
    await admin
      .from("indian_stocks")
      .update({ canonical_stock_id: null })
      .eq("id", m.toStockId as string);
    mergerSuggestions.push(m);
    continue;
  }

  applied.push({
    symbol: m.toSymbol,   // absorbed symbol shown in the import result
    action_type: "merger",
    factor: m.impliedRatio,
    ex_date: m.ex_date,
    source: "nse",
  });
  didApply = true;
}

return { applied, pending, mergerSuggestions };
```

- [ ] **Step 2: Run full suite**

```bash
npm test
```

Expected: all green. The existing `tradebook-import-engine.test.ts` mocks `detectOrphanPairs` — check that it still compiles and runs. If the test uses a named import `detectOrphanPairs`, add `matchOrphanPairsWithFeed` to the same mock:

```ts
vi.mock("@/lib/import/merger-detect", () => ({
  detectOrphanPairs: vi.fn().mockReturnValue([]),
  matchOrphanPairsWithFeed: vi.fn().mockReturnValue({ confirmed: [], unconfirmed: [] }),
}));
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/import/tradebook-import-engine.ts
git commit -m "feat(ca): auto-apply feed-confirmed mergers in detectAndApplyForAccount"
```

---

### Task 8: End-to-end smoke test (manual)

No code changes — verify the full flow works against the real Supabase instance.

- [ ] **Step 1: Run the sync script for a short window**

```bash
npx tsx scripts/sync-corporate-actions.ts --from 2022-01-01
```

Watch the log. It should now show merger rows in the total count alongside split/bonus. Verify in Supabase Dashboard:

```sql
SELECT action_type, COUNT(*) FROM corporate_action_ref GROUP BY action_type;
```

Expected: rows for `split`, `bonus`, and `merger`.

- [ ] **Step 2: Check a known merger (EQUITAS → EQUITASBNK, ex_date 2024-10-15)**

```sql
SELECT * FROM corporate_action_ref
WHERE symbol = 'EQUITAS' AND action_type = 'merger';
```

Expected: 1 row with `ex_date = '2024-10-15'`, `factor = null` (NSE subject just says "Merger"), `acquirer_symbol = null`.

- [ ] **Step 3: Import a tradebook that has EQUITAS buys and EQUITASBNK sells**

Use the Trades page → Import Tradebook. After import, the result panel should show a merger in the "Applied corporate actions" section (not in "Merger suggestions"). The FIFO should recompute correctly with the canonical pointer.

- [ ] **Step 4: Verify FIFO result in the UI**

On the Trades page, EQUITAS open position should now be zero (absorbed). EQUITASBNK should show the correct cost basis adjusted by the swap ratio.

---

## Self-Review Checklist

- [x] **Spec coverage**: All requirements covered — feed fetch (Tasks 3–4), ref storage (Task 1), auto-apply (Tasks 5–7).
- [x] **Placeholder scan**: All code blocks are complete. No "TBD" or "add validation" placeholders.
- [x] **Type consistency**: `RefRow.factor: number | null` in Task 3 propagates to `RefAction.factor: number | null` in Task 5, used as `m.impliedRatio` (always a number) in Task 7.
- [x] **Existing tests stay green**: `feedActionsToApply` and `reconcileWithFeed` are guarded against merger rows in Task 5 so their test suites are unaffected.
- [x] **Null guards**: Task 6 guards `toStockId == null`; Task 7 guards DB write errors with rollback + surface-as-suggestion fallback.
- [x] **Migration first**: Task 1 must be applied to Supabase before the sync script is run (it relaxes the factor constraint). Tasks 2–7 compile and test without the migration (they only write merger rows via the sync script, not from app code).
