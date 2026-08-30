# Stable Stock Identity (`stock_id`) Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each stock's identity a stable surrogate UUID (`indian_stocks.id`) so that corporate actions that change a stock's ISIN (splits, face‑value changes) or NSE symbol (renames) never fork a company, orphan its research, or lose its price/market‑cap.

**Architecture:** Introduce a surrogate primary key on `indian_stocks`; demote `isin`, `nse_symbol`, `bse_code` to *mutable attributes*. `companies` and `holdings` reference the stock by `stock_id` (UUID FK) instead of joining on `isin`. Rollout is **expand → migrate → contract**: every phase is independently deployable and 100% backward compatible with the previously‑deployed app. A DB sync trigger keeps `isin` and `stock_id` consistent during the transition so old and new code coexist.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript, Supabase (Postgres + RLS), PostgREST, Vitest. Migrations applied by hand in the Supabase Dashboard SQL editor (project is not `supabase link`‑ed).

**Spec:** this document (design + plan combined).

## Global Constraints

- **100% backward compatible.** Existing portfolios/companies/holdings and the currently‑deployed app must keep working at every phase. No data loss. No required downtime beyond a sub‑second migration lock.
- **Forward compatible for all corporate actions.** Split / face‑value change (ISIN changes), bonus (ISIN usually same), rename (symbol changes), merger (distinct instruments) must all resolve to the correct existing stock without duplicating it.
- **Surrogate key is identity.** `indian_stocks.id` (UUID) is the only durable identity. `isin`/`nse_symbol`/`bse_code` are mutable attributes and must never again be treated as identity.
- Migrations applied manually in the Supabase Dashboard; each migration file is self‑contained and idempotent where practical. Follow the existing repo convention (numbered files under `supabase/migrations/`).
- Error‑handling convention: mutations return `ActionResult`; reads throw; use `describeDbError`.
- Coverage gate: global branch coverage ≥ 95% (`npm run test:coverage`).

---

## Background: why this change (verified facts)

**Identifier stability (India):** ISIN and symbol fail on *opposite* corporate actions, so neither is a safe identity.

| Corporate action | ISIN | NSE symbol | BSE code |
|---|---|---|---|
| Split / face‑value change | **changes** | same | same |
| Bonus (FV unchanged) | usually same | same | same |
| Rename / rebrand | same | **changes** | same |
| Merger | acquired ISIN retired | acquired symbol delisted | acquired code retired |

Industry practice (Intrinio, Bloomberg OpenFIGI, Upstox `instrument_key`, Groww `groww_symbol`, Zerodha's own daily‑diff guidance) is a **surrogate internal PK + mutable, optionally effective‑dated identifier attributes**. FIGI is the only permanent external anchor (free via OpenFIGI) — deferred to a future phase.

**Current ISIN surface (audit):**
- `indian_stocks.isin` — the only ISIN **PRIMARY KEY** (`000_initial_combined.sql:103`).
- `companies.isin` — **FK** → `indian_stocks(isin)` (`:158`), plain index (`:179`), composite unique `(portfolio_id, isin)` (`:182`).
- `holdings.isin` — denormalized column, **not** an FK (`:440`).
- No other table references ISIN. All child tables key on `company_id`.
- RPCs touching isin: `move_company`, `replace_account_holdings` (000 + 001), `bulk_update_stock_prices`.
- Read joins rely on the `companies.isin → indian_stocks.isin` FK for the PostgREST `indian_stocks(...)` embed: `api/dashboard/route.ts`, `company-actions.ts`, `pnl-actions.ts`, `company/[id]/page.tsx`.

**Target end‑state schema:**
- `indian_stocks`: `id UUID PK`; `isin` becomes nullable + partial‑unique; `nse_symbol`/`bse_code` remain partial‑unique (one active stock per symbol/code — the surrogate model means one row per stock, so uniqueness is now *correct* and the earlier "two rows share a symbol" problem disappears).
- `companies`: gains `stock_id UUID NOT NULL REFERENCES indian_stocks(id)`; keeps `isin` as a maintained denormalized cache; unique becomes `(portfolio_id, stock_id)`.
- `holdings`: gains `stock_id UUID NOT NULL REFERENCES indian_stocks(id)`; keeps `isin` as a denormalized snapshot.

**Corporate‑action resolution (import + price), keyed by `stock_id`:**
1. Statement row `(symbol, isin)` → find stock by **current isin** → use it.
2. else find by **nse_symbol** → it's a split/FV change: **update that stock's `isin`** in place (record history), use it.
3. else create a new stock.
4. isin matches but symbol differs → rename: **update the stock's `nse_symbol`** in place (record history).

Because there is exactly one row per stock, price/market‑cap live on that row and are **never orphaned** by an ISIN change — the reported bug becomes structurally impossible.

---

## File Structure

**Migrations (new, applied by hand in Dashboard, in order):**
- `supabase/migrations/002_stock_id_expand.sql` — additive: `indian_stocks.id`, `companies.stock_id`, `holdings.stock_id` (nullable), backfill, FKs, indexes, and a BEFORE‑INSERT/UPDATE **sync trigger** keeping `isin`↔`stock_id` consistent for both old and new code.
- `supabase/migrations/003_stock_id_reconcile_dupes.sql` — one‑off: merge `indian_stocks` rows that are the same stock split across two ISINs (the live TD Power case + a general detector), repointing `stock_id` and deleting empty duplicate stock rows.
- `supabase/migrations/004_stock_id_contract.sql` — after new code is live: `stock_id NOT NULL`, swap unique `(portfolio_id, isin)` → `(portfolio_id, stock_id)`, make `isin` nullable + partial‑unique, drop the old `companies.isin → indian_stocks(isin)` FK, redefine `move_company` / `replace_account_holdings` to carry `stock_id`.
- (Optional, future) `005_stock_identifier_history.sql` — effective‑dated `stock_identifiers(stock_id, type, value, valid_from, valid_to)` for full audit/time‑travel.

**Code (modified):**
- `src/lib/stocks/resolve-stock.ts` (new) — the single stock‑resolution helper used by import + manual add: resolve `(symbol, isin)` → `stock_id` with corporate‑action handling.
- `src/lib/import/holdings-import-engine.ts` — replace the 2b ISIN‑re‑key block with `resolveStock`; build holding rows with `stock_id`.
- `src/app/(authenticated)/actions/holdings-actions.ts`, `company-actions.ts` — resolve `stock_id` on create; write both `stock_id` and `isin`.
- `src/lib/services/price-refresh.ts`, `src/app/(authenticated)/actions/price-actions.ts` — key price updates by `stock_id`; symbol→stock resolution.
- Read joins: switch PostgREST embeds from the implicit `isin` FK to the `stock_id` FK (`indian_stocks!stock_id(...)`), in `api/dashboard/route.ts`, `company-actions.ts`, `pnl-actions.ts`, `company/[id]/page.tsx`.
- `src/types/database.ts` — add `id` to `IndianStock`; add `stock_id` to `Company`/`Holding`.
- RPCs `move_company`, `replace_account_holdings` — carry `stock_id` (in `004`).

**Tests (created/modified):**
- `src/__tests__/lib/stocks/resolve-stock.test.ts` (new).
- `src/__tests__/lib/import/holdings-import-engine.test.ts` — adapt to `stock_id`.
- `src/__tests__/lib/services/price-refresh.test.ts` (new/extend) — stock_id keying.

---

## Phase / Task overview

- **Phase A (Expand):** Task 1 — `002` additive migration + sync trigger. *Deployable; old app unaffected.*
- **Phase B (Reconcile):** Task 2 — `003` merge split‑duplicated stock rows (TD Power + general).
- **Phase C (Migrate code):** Tasks 3–7 — `resolveStock` helper, import engine, actions, price refresh, read‑join swaps, types. Dual‑write `isin`+`stock_id`. *Deployable on top of A/B.*
- **Phase D (Contract):** Task 8 — `004` tighten constraints + swap unique index + redefine RPCs.
- **Phase E (Optional):** Task 9 — identifier history table + FIGI anchor (future).

Each task ends with an independently testable, committable deliverable. Full step‑by‑step SQL/code for each task is in the "Tasks" section below.

---

## Tasks

### Task 1: Expand migration `002` (additive + sync trigger)

**Files:**
- Create: `supabase/migrations/002_stock_id_expand.sql`

**Interfaces:**
- Produces: `indian_stocks.id UUID` (unique, backfilled), `companies.stock_id UUID` (nullable, FK→`indian_stocks.id`, backfilled), `holdings.stock_id UUID` (nullable, FK, backfilled), trigger `sync_stock_id_isin` on `companies` and `holdings`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- 002_stock_id_expand.sql — additive, backward compatible.
BEGIN;

-- 1. Surrogate id on the catalog (existing rows get a unique id via volatile default).
ALTER TABLE indian_stocks ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_indian_stocks_id ON indian_stocks (id);

-- 2. stock_id on the referencing tables (nullable during transition).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stock_id UUID;
ALTER TABLE holdings  ADD COLUMN IF NOT EXISTS stock_id UUID;

-- 3. Backfill from the existing isin join.
UPDATE companies c SET stock_id = s.id FROM indian_stocks s
 WHERE c.stock_id IS NULL AND c.isin = s.isin;
UPDATE holdings h SET stock_id = s.id FROM indian_stocks s
 WHERE h.stock_id IS NULL AND h.isin = s.isin;

-- 4. FKs (NOT VALID first to avoid a long lock, then validate).
ALTER TABLE companies ADD CONSTRAINT companies_stock_id_fkey
  FOREIGN KEY (stock_id) REFERENCES indian_stocks(id) NOT VALID;
ALTER TABLE companies VALIDATE CONSTRAINT companies_stock_id_fkey;
ALTER TABLE holdings ADD CONSTRAINT holdings_stock_id_fkey
  FOREIGN KEY (stock_id) REFERENCES indian_stocks(id) NOT VALID;
ALTER TABLE holdings VALIDATE CONSTRAINT holdings_stock_id_fkey;

CREATE INDEX IF NOT EXISTS idx_companies_stock_id ON companies (stock_id);
CREATE INDEX IF NOT EXISTS idx_holdings_stock_id ON holdings (stock_id);

-- 5. Sync trigger: keep isin <-> stock_id consistent so OLD code (writes isin only)
--    and NEW code (writes stock_id, maybe isin) both produce consistent rows.
CREATE OR REPLACE FUNCTION sync_stock_id_isin() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_isin text; v_id uuid;
BEGIN
  IF NEW.stock_id IS NULL AND NEW.isin IS NOT NULL THEN
    SELECT id INTO v_id FROM indian_stocks WHERE isin = NEW.isin;
    NEW.stock_id := v_id;                    -- old code path
  ELSIF NEW.stock_id IS NOT NULL AND (NEW.isin IS NULL OR NEW.isin = '') THEN
    SELECT isin INTO v_isin FROM indian_stocks WHERE id = NEW.stock_id;
    NEW.isin := v_isin;                       -- new code path (denormalized cache)
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_stock_id_isin_companies ON companies;
CREATE TRIGGER trg_sync_stock_id_isin_companies
  BEFORE INSERT OR UPDATE OF isin, stock_id ON companies
  FOR EACH ROW EXECUTE FUNCTION sync_stock_id_isin();

DROP TRIGGER IF EXISTS trg_sync_stock_id_isin_holdings ON holdings;
CREATE TRIGGER trg_sync_stock_id_isin_holdings
  BEFORE INSERT OR UPDATE OF isin, stock_id ON holdings
  FOR EACH ROW EXECUTE FUNCTION sync_stock_id_isin();

COMMIT;
```

- [ ] **Step 2: Verify backfill completeness (run in Dashboard)**

Run:
```sql
SELECT count(*) FROM companies WHERE stock_id IS NULL;   -- expect 0
SELECT count(*) FROM holdings  WHERE stock_id IS NULL;    -- expect 0 (any left are orphan isins to inspect)
```
Expected: both 0. Any non‑zero → inspect those rows (isin not in `indian_stocks`) before proceeding.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/002_stock_id_expand.sql
git commit -m "feat(db): expand — add stable stock_id surrogate + sync trigger (additive)"
```

**Note:** No app code changes in this task — the deployed app keeps using `isin` and is unaffected. `stock_id` is populated for it automatically by the trigger.

---

### Task 2: Reconcile split‑duplicated stock rows `003`

**Files:**
- Create: `supabase/migrations/003_stock_id_reconcile_dupes.sql`

**Interfaces:**
- Consumes: `stock_id` columns from Task 1.
- Produces: a single canonical `indian_stocks` row per real stock; duplicate empty rows removed; `companies.stock_id`/`holdings.stock_id` repointed to canonical.

- [ ] **Step 1: Write the reconciliation SQL (TD Power + general detector)**

```sql
-- 003_stock_id_reconcile_dupes.sql — merge two indian_stocks rows that are the
-- same stock under different ISINs (a split created an empty new-ISIN stub).
BEGIN;

-- General detector: a "stub" row has a price/symbol-less identity and a sibling
-- row shares its NSE symbol OR is referenced by the same logical company set.
-- For safety we reconcile the KNOWN case explicitly, then report any others.

-- TD Power: canonical = old ISIN row (has price + nse_symbol, referenced widely);
-- stub = new ISIN row (empty). Move the live ISIN onto canonical, repoint the
-- company that sits on the stub, delete the stub.
DO $$
DECLARE v_canon uuid; v_stub uuid;
BEGIN
  SELECT id INTO v_canon FROM indian_stocks WHERE isin = 'INE419M01027';
  SELECT id INTO v_stub  FROM indian_stocks WHERE isin = 'INE419M01035';
  IF v_canon IS NULL OR v_stub IS NULL THEN RAISE NOTICE 'TD Power rows not both present; skipping'; RETURN; END IF;

  -- Repoint any company/holding on the stub to the canonical stock.
  UPDATE companies SET stock_id = v_canon WHERE stock_id = v_stub;
  UPDATE holdings  SET stock_id = v_canon WHERE stock_id = v_stub;

  -- Canonical adopts the current (post-split) ISIN; keep its symbol + price.
  UPDATE indian_stocks SET isin = 'INE419M01035' WHERE id = v_canon;

  -- Remove the now-unreferenced empty stub (frees the isin value we just took).
  DELETE FROM indian_stocks WHERE id = v_stub;
END $$;

COMMIT;

-- Report any other potential duplicates for manual review (symbol shared across ISINs):
-- SELECT nse_symbol, array_agg(isin) FROM indian_stocks
--  WHERE nse_symbol IS NOT NULL GROUP BY nse_symbol HAVING count(*) > 1;
```

- [ ] **Step 2: Verify TD Power is consolidated (run in Dashboard)**

Run:
```sql
SELECT s.id, s.isin, s.nse_symbol, s.price, s.market_cap
  FROM indian_stocks s WHERE s.nse_symbol = 'TDPOWERSYS';
-- expect ONE row: isin INE419M01035, nse_symbol TDPOWERSYS, price ~752.7, market_cap set
SELECT c.id, c.isin, c.stock_id FROM companies c
  JOIN indian_stocks s ON s.id = c.stock_id WHERE s.nse_symbol='TDPOWERSYS';
-- expect all TD Power companies share the one stock_id
```
Expected: one catalog row with price/market_cap; all TD Power companies point to it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_stock_id_reconcile_dupes.sql
git commit -m "fix(db): reconcile split-duplicated TD Power stock rows onto one stock_id"
```

---

### Task 3: `resolveStock` helper (corporate‑action aware)

**Files:**
- Create: `src/lib/stocks/resolve-stock.ts`
- Test: `src/__tests__/lib/stocks/resolve-stock.test.ts`

**Interfaces:**
- Produces: `resolveStock(adminClient, { isin, symbol, bseCode?, sector? }): Promise<{ stockId: string; created: boolean; renamedFrom?: string; reIsinedFrom?: string }>`.
  - Resolution order: current `isin` → `nse_symbol` (split: update isin) → `bse_code` → create. On isin‑match‑but‑symbol‑differs: update symbol (rename).

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { resolveStock } from "@/lib/stocks/resolve-stock";
// (Uses the same chainable Supabase mock pattern as holdings-import-engine.test.ts)

it("returns the stock matched by current ISIN", async () => {
  const client = makeStockClient({ byIsin: { INE002A01018: { id: "s1", nse_symbol: "RELIANCE" } } });
  const r = await resolveStock(client, { isin: "INE002A01018", symbol: "RELIANCE" });
  expect(r).toMatchObject({ stockId: "s1", created: false });
});

it("matches by symbol and re-keys the ISIN when a split changed it", async () => {
  const client = makeStockClient({ bySymbol: { TDPOWERSYS: { id: "s2", isin: "INE419M01027" } } });
  const r = await resolveStock(client, { isin: "INE419M01035", symbol: "TDPOWERSYS" });
  expect(r).toMatchObject({ stockId: "s2", created: false, reIsinedFrom: "INE419M01027" });
  expect(client.updates).toContainEqual({ id: "s2", set: { isin: "INE419M01035" } });
});

it("updates the symbol when the ISIN matches but the name changed (rename)", async () => {
  const client = makeStockClient({ byIsin: { INE0X: { id: "s3", nse_symbol: "OLDSYM" } } });
  const r = await resolveStock(client, { isin: "INE0X", symbol: "NEWSYM" });
  expect(r).toMatchObject({ stockId: "s3", renamedFrom: "OLDSYM" });
  expect(client.updates).toContainEqual({ id: "s3", set: { nse_symbol: "NEWSYM" } });
});

it("creates a new stock when nothing matches", async () => {
  const client = makeStockClient({});
  const r = await resolveStock(client, { isin: "INE999", symbol: "NEWCO" });
  expect(r.created).toBe(true);
  expect(client.inserts[0]).toMatchObject({ isin: "INE999", nse_symbol: "NEWCO" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/stocks/resolve-stock.test.ts`
Expected: FAIL ("resolveStock is not a function").

- [ ] **Step 3: Implement `resolveStock`**

```typescript
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "resolve-stock" });

export interface StockRef { isin: string; symbol: string; bseCode?: string | null; sector?: string | null; }
export interface ResolvedStock { stockId: string; created: boolean; renamedFrom?: string; reIsinedFrom?: string; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveStock(adminClient: any, ref: StockRef): Promise<ResolvedStock> {
  // 1. Current ISIN.
  const { data: byIsin } = await adminClient
    .from("indian_stocks").select("id, nse_symbol").eq("isin", ref.isin).maybeSingle();
  if (byIsin) {
    let renamedFrom: string | undefined;
    if (ref.symbol && byIsin.nse_symbol !== ref.symbol) {
      renamedFrom = byIsin.nse_symbol ?? undefined;
      await adminClient.from("indian_stocks").update({ nse_symbol: ref.symbol }).eq("id", byIsin.id);
      log.info("Stock rename reconciled", { stockId: byIsin.id, from: renamedFrom, to: ref.symbol });
    }
    return { stockId: byIsin.id, created: false, renamedFrom };
  }
  // 2. NSE symbol (split / face-value change: ISIN changed, symbol stable).
  if (ref.symbol) {
    const { data: bySym } = await adminClient
      .from("indian_stocks").select("id, isin").eq("nse_symbol", ref.symbol).maybeSingle();
    if (bySym) {
      await adminClient.from("indian_stocks").update({ isin: ref.isin }).eq("id", bySym.id);
      log.info("Stock ISIN change reconciled", { stockId: bySym.id, from: bySym.isin, to: ref.isin });
      return { stockId: bySym.id, created: false, reIsinedFrom: bySym.isin as string };
    }
  }
  // 3. BSE code fallback.
  if (ref.bseCode) {
    const { data: byBse } = await adminClient
      .from("indian_stocks").select("id").eq("bse_code", ref.bseCode).maybeSingle();
    if (byBse) {
      await adminClient.from("indian_stocks").update({ isin: ref.isin, nse_symbol: ref.symbol }).eq("id", byBse.id);
      return { stockId: byBse.id, created: false };
    }
  }
  // 4. Create.
  const { data: created, error } = await adminClient
    .from("indian_stocks")
    .insert({ isin: ref.isin, name: ref.symbol, nse_symbol: ref.symbol, exchange: "NSE", sector: ref.sector ?? null })
    .select("id").single();
  if (error) throw error;
  return { stockId: created.id, created: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/stocks/resolve-stock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stocks/resolve-stock.ts src/__tests__/lib/stocks/resolve-stock.test.ts
git commit -m "feat(stocks): add corporate-action-aware resolveStock (isin→symbol→bse→create)"
```

---

### Task 4: Import engine uses `stock_id`

**Files:**
- Modify: `src/lib/import/holdings-import-engine.ts`
- Test: `src/__tests__/lib/import/holdings-import-engine.test.ts`

**Interfaces:**
- Consumes: `resolveStock` (Task 3).
- Produces: holding rows carrying `stock_id`; companies created/looked‑up by `stock_id`.

- [ ] **Step 1: Adapt tests** — replace the `isin`‑re‑key expectations (the 2b `companyUpdates`/`migrated_companies` cases) with `stock_id` resolution: assert each statement stock resolves via `resolveStock`, companies are matched/created by `(portfolio_id, stock_id)`, and `replace_account_holdings` rows include `stock_id`. Keep the "reuse on ISIN change" scenario but assert it reuses the company by `stock_id` (no duplicate) and does **not** create a second catalog row.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/__tests__/lib/import/holdings-import-engine.test.ts` → FAIL.

- [ ] **Step 3: Implement** — replace step 1 (stock upsert) + step 2b (isin re‑key) with a loop calling `resolveStock` per unique statement stock to get a `stock_id`; look up existing companies by `(portfolio_id, stock_id)`; create missing companies with `stock_id` (trigger fills `isin`); build holding rows with `stock_id` **and** `isin` (denormalized). Keep the "skip destructive replace when 0 importable rows" safeguard.

- [ ] **Step 4: Run to verify pass** — tests green.

- [ ] **Step 5: Commit** — `git commit -m "feat(import): resolve stocks by stock_id; retire isin re-keying"`

---

### Task 5: Manual add + price paths use `stock_id`

**Files:**
- Modify: `src/app/(authenticated)/actions/holdings-actions.ts`, `src/app/(authenticated)/actions/company-actions.ts`, `src/app/(authenticated)/actions/price-actions.ts`, `src/lib/services/price-refresh.ts`
- Test: `src/__tests__/lib/services/price-refresh.test.ts` (new/extend)

**Interfaces:**
- Consumes: `resolveStock`.
- Produces: manual company/holding creation resolves `stock_id`; price updates key on `stock_id` (build `Map<stockId, symbol>` and update `indian_stocks` by `id`).

- [ ] **Step 1: Write failing test** for price refresh keying by `stock_id` (quote fanned to the right stock row; one row per stock so no symbol collision).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `addHolding`/`createCompanyWithHolding` resolve `stock_id` and write `stock_id`+`isin`; `refreshPrices`/`manualRefreshPrices` select `stock_id, indian_stocks(id, nse_symbol, bse_code)`, map symbol→`stock_id`, update `indian_stocks` by `id`. `PriceUpdateRow` gains `stock_id` (keep `isin` optional).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat: key price refresh + manual add on stock_id"`

---

### Task 6: Read joins via the `stock_id` FK

**Files:**
- Modify: `src/app/api/dashboard/route.ts`, `src/app/(authenticated)/actions/company-actions.ts`, `src/app/(authenticated)/actions/pnl-actions.ts`, `src/app/(authenticated)/company/[id]/page.tsx`

**Interfaces:**
- Produces: PostgREST embeds resolve via `stock_id` FK, e.g. `indian_stocks!companies_stock_id_fkey(name, nse_symbol, price, market_cap, sector)` (or the `!stock_id` shorthand). Property access `company.indian_stocks?.*` is unchanged in the UI.

- [ ] **Step 1: Change each embed** from the implicit isin FK to the `stock_id` FK. (Both FKs exist during Phase C, so this is safe to deploy independently.)
- [ ] **Step 2: Verify** with `npm run test && npx tsc --noEmit && npm run lint`.
- [ ] **Step 3: Manual smoke** — load dashboard + a company detail; CMP/market cap render.
- [ ] **Step 4: Commit** — `git commit -m "refactor: resolve stock embeds via stock_id FK"`

---

### Task 7: Types + full verification

**Files:**
- Modify: `src/types/database.ts`
- Verify: whole suite

- [ ] **Step 1:** Add `IndianStock.id: string`; `Company.stock_id: string`; `Holding.stock_id: string`. Keep `isin` fields.
- [ ] **Step 2:** `npm run test:coverage` (≥95% branches), `npx tsc --noEmit`, `npm run lint` on changed files.
- [ ] **Step 3: Commit** — `git commit -m "types: add stock id/stock_id fields"`
- [ ] **Step 4: DEPLOY** Phase C. App now uses `stock_id` while `isin` remains consistent (trigger + dual‑write). Old and new code are both correct against the `002/003` schema.

---

### Task 8: Contract migration `004` (tighten + swap constraints + RPCs)

**Files:**
- Create: `supabase/migrations/004_stock_id_contract.sql`

**Interfaces:**
- Consumes: a fully deployed Phase C app (every write sets `stock_id`).
- Produces: `stock_id NOT NULL`; unique `(portfolio_id, stock_id)`; `isin` nullable + partial‑unique on `indian_stocks`; old `companies.isin` FK dropped; RPCs carry `stock_id`.

- [ ] **Step 1: Pre‑flight check (Dashboard)** — `SELECT count(*) FROM companies WHERE stock_id IS NULL; SELECT count(*) FROM holdings WHERE stock_id IS NULL;` both 0.

- [ ] **Step 2: Write the migration**

```sql
-- 004_stock_id_contract.sql — run ONLY after Phase C is deployed and verified.
BEGIN;

ALTER TABLE companies ALTER COLUMN stock_id SET NOT NULL;
ALTER TABLE holdings  ALTER COLUMN stock_id SET NOT NULL;

-- One stock per portfolio, now keyed on the surrogate.
DROP INDEX IF EXISTS idx_companies_portfolio_isin;
CREATE UNIQUE INDEX idx_companies_portfolio_stock ON companies (portfolio_id, stock_id);

-- isin is now a mutable attribute on the catalog: drop the old FK, keep isin as
-- a partial-unique attribute (one active ISIN per stock at a time).
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_isin_fkey;
ALTER TABLE indian_stocks ALTER COLUMN isin DROP NOT NULL;   -- if it was NOT NULL via PK; PK now on id
-- (indian_stocks PK is already id via idx from 002; ensure it:)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='indian_stocks_pkey' AND conrelid='indian_stocks'::regclass
                 AND (SELECT attname FROM pg_attribute WHERE attrelid='indian_stocks'::regclass AND attnum = ANY(conkey))='id') THEN
    ALTER TABLE indian_stocks DROP CONSTRAINT IF EXISTS indian_stocks_pkey;
    ALTER TABLE indian_stocks ADD PRIMARY KEY (id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_indian_stocks_isin ON indian_stocks (isin) WHERE isin IS NOT NULL AND isin <> '';

COMMIT;
```

- [ ] **Step 3: Redefine RPCs to carry `stock_id`** — update `move_company` (carry `stock_id` on the inserted company + holdings; duplicate check on `(portfolio_id, stock_id)`) and `replace_account_holdings` (insert `stock_id` from payload; delete predicate unchanged). Keep signatures compatible; ship as part of `004`.

- [ ] **Step 4: Verify (Dashboard + app)** — insert/import/move smoke tests; `SELECT` a company embed to confirm price shows.

- [ ] **Step 5: Commit** — `git commit -m "feat(db): contract — stock_id NOT NULL, swap unique/PK, drop isin FK, RPCs on stock_id"`

**Rollback:** `004` is the only non‑additive step. Rollback = drop the new unique index, recreate `(portfolio_id, isin)`, re‑add the `companies.isin` FK, set columns nullable. `002/003` and the Phase‑C app remain fully functional without `004` (it only tightens), so `004` can wait until Phase C has soaked.

---

### Task 9 (Optional, future): identifier history + FIGI anchor

- `005_stock_identifier_history.sql`: `stock_identifiers(stock_id, type CHECK in ('isin','nse_symbol','bse_code','yahoo_symbol','figi'), value, valid_from, valid_to)`; `resolveStock` writes a history row on every re‑key/rename. Enables time‑travel and audit (Intrinio pattern).
- FIGI: resolve each stock to a FIGI once at creation via the free OpenFIGI API; store as the permanent cross‑vendor anchor. Deferred.

---

## Backward / forward compatibility summary

- **Old app vs new schema (Phase A/B live, app not yet redeployed):** app writes/reads `isin`; the sync trigger fills `stock_id`; `companies.isin` FK still intact → **works unchanged.**
- **New app vs new schema (Phase C):** app writes `stock_id`+`isin`, reads via `stock_id` FK; both FKs present → **works.** If a rollback to old app is needed, the trigger + retained `isin` keep old app working.
- **Contract (Phase D):** applied only after Phase C soaks; tightens constraints without changing behavior. Reversible.
- **All corporate actions** resolved by `resolveStock` against the surrogate: split/FV (isin re‑key), bonus (isin match), rename (symbol update), merger (distinct stock_ids) — none create duplicates or orphan price/research.

## Index changes (net)

Added: `idx_indian_stocks_id` (unique), `idx_companies_stock_id`, `idx_holdings_stock_id`, `idx_companies_portfolio_stock` (unique), `idx_indian_stocks_isin` (partial unique).
Removed (Phase D): `idx_companies_portfolio_isin` (replaced by the stock_id version). Kept: `idx_companies_isin`, `idx_indian_stocks_nse_symbol` (unique), `idx_indian_stocks_bse_code` (unique) — still valid and useful for `resolveStock` lookups.
