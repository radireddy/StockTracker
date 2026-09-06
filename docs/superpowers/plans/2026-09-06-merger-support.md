# Merger Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the app to record stock mergers (different ISINs, fixed swap ratio) so FIFO correctly reconciles from-security buys against to-security sells without phantom short-sells or phantom open positions.

**Architecture:** Reuse the existing `canonical_stock_id` supersession pointer and `adjustQtyPrice` factor machinery — a merger is just `action_type = 'merger'` with a factor equal to the swap ratio on the to-security, plus `canonical_stock_id` pointing from-security → to-security. An orphan-pair heuristic auto-detects likely merger pairs from imported trades and surfaces them as suggestions (never auto-applied). A manual dialog covers pairs the heuristic misses.

**Tech Stack:** Next.js 15 App Router, Supabase/PostgreSQL, TypeScript, Vitest, base-ui (Select, Dialog, AlertDialog), Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-09-05-merger-support-design.md`

## Global Constraints

- Run `npm test` and `npm run build` green before every commit.
- Run `npm run lint` and `npx tsc --noEmit` before every commit.
- Never mutate `CorporateActionContext` outside the import engine.
- Supabase migrations applied manually in Dashboard SQL editor — do not auto-apply.
- All server actions use the `action()` wrapper from `@/lib/action` and `getAuthUser()` for the RLS-scoped client, plus `createAdminClient()` for writes.
- base-ui `Select`: `onValueChange` receives `(value: string | null, event)` — always null-guard.
- No new tables. Reuse `corporate_actions` + `indian_stocks.canonical_stock_id`.

---

## File Map

**Create:**
- `supabase/migrations/009_merger_support.sql` — extends `action_type` CHECK constraint
- `src/lib/import/merger-detect.ts` — orphan-pair detector
- `src/components/trades/record-merger-dialog.tsx` — manual merger entry dialog
- `src/__tests__/lib/merger-detect.test.ts` — detector unit tests

**Modify:**
- `src/lib/import/corporate-actions.ts` — add `'merger'` to `CorporateAction.action_type` union
- `src/lib/import/tradebook-types.ts` — add `OrphanPairSuggestion` type; add `merger_suggestions` to `BatchImportResult.corporate_actions`
- `src/lib/import/tradebook-import-engine.ts` — call `detectOrphanPairs` inside `detectAndApplyForAccount`; thread `mergerSuggestions` out
- `src/app/(authenticated)/actions/tradebook-actions.ts` — add `recordMerger`; thread `merger_suggestions` through `importTradebookFiles`
- `src/components/trades/trade-import-dialog.tsx` — render merger suggestion rows
- `src/app/(authenticated)/trades/page.tsx` — add "Record merger" button
- `src/__tests__/lib/fifo-engine.test.ts` — add merger FIFO reconciliation test
- `src/__tests__/lib/tradebook-import-engine.test.ts` — add merger suggestion threading test

---

## Task 1: Migration + Type Union + FIFO Test

**Files:**
- Create: `supabase/migrations/009_merger_support.sql`
- Modify: `src/lib/import/corporate-actions.ts:15`
- Test: `src/__tests__/lib/fifo-engine.test.ts`

**Interfaces:**
- Produces: `CorporateAction.action_type` now allows `"merger"` — all downstream code that uses this union (adjustQtyPrice, cumulativeFactor, FIFO engine) picks it up automatically.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/009_merger_support.sql
-- Extends the corporate_actions type enum to include merger events.
-- Apply manually in Supabase Dashboard SQL editor.

ALTER TABLE corporate_actions
  DROP CONSTRAINT IF EXISTS corporate_actions_action_type_check;

ALTER TABLE corporate_actions
  ADD CONSTRAINT corporate_actions_action_type_check
    CHECK (action_type IN ('split', 'bonus', 'merger'));
```

- [ ] **Step 2: Extend the TypeScript union**

In `src/lib/import/corporate-actions.ts`, change line 15:

```typescript
// Before:
action_type: "split" | "bonus";

// After:
action_type: "split" | "bonus" | "merger";
```

The same union appears in `CorporateActionCandidate.action_type` in `corporate-action-detect.ts` — leave that as `"split" | "bonus"` (the detector never emits a merger candidate; that's the orphan-pair detector's job).

- [ ] **Step 3: Write the failing FIFO merger test**

Add to `src/__tests__/lib/fifo-engine.test.ts`:

```typescript
import type { CorporateActionContext } from "@/lib/import/corporate-actions";

describe("computeFifoMatches — merger (cross-ISIN via canonical_stock_id)", () => {
  it("reconciles from-security buys against to-security sells at the swap ratio", () => {
    // Equitas shape: bought 1020 EQUITAS (from-id), merged into EQUITASBNK (to-id)
    // at ×2.31 on 2023-10-01, then sold 2356 EQUITASBNK on 2024-04-15.
    const FROM = "from-id";
    const TO   = "to-id";

    const trades: RawTradeForFifo[] = [
      { id: "b1", isin: "INE988K01017", stock_id: FROM,
        trade_date: "2022-01-01", trade_type: "buy", quantity: 1020, price: 100, executed_at: null },
      { id: "s1", isin: "INE063P01018", stock_id: TO,
        trade_date: "2024-04-15", trade_type: "sell", quantity: 2356, price: 200, executed_at: null },
    ];

    const ca: CorporateActionContext = {
      canonicalMap: new Map([[FROM, TO]]),
      actionsBySecurity: new Map([
        [TO, [{ stock_id: TO, action_type: "merger", ex_date: "2023-10-01", factor: 2.31 }]],
      ]),
    };

    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades, ca });
    // b1: 1020 × 2.31 = 2356.2 adjusted shares. s1 consumes 2356 of them.
    expect(matches).toHaveLength(1);
    const m = matches[0];
    expect(m.buy_trade_id).toBe("b1");
    expect(m.sell_trade_id).toBe("s1");
    expect(m.matched_quantity).toBeCloseTo(2356, 0);
    // Cost basis: ₹100 / 2.31 ≈ ₹43.29 per EQUITASBNK share
    expect(m.buy_price).toBeCloseTo(100 / 2.31, 2);
    // Realized PnL: (200 - 43.29) × 2356 ≈ positive
    expect(m.realized_pnl).toBeGreaterThan(0);
    expect(m.is_long_term).toBe(true); // > 365 days
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run src/__tests__/lib/fifo-engine.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `computeFifoMatches` likely has no `ca` parameter or ignores `action_type: "merger"`.

- [ ] **Step 5: Check computeFifoMatches signature**

Read `src/lib/import/fifo-engine.ts` to confirm how `ca` is used. The existing engine already applies `cumulativeFactor` (which multiplies all actions' factors regardless of `action_type`). If it already accepts `ca` as an optional parameter, the test should pass after just the type union change. Verify by running step 4 again.

- [ ] **Step 6: Run all tests to confirm nothing broke**

```bash
npm test 2>&1 | tail -30
```

Expected: all green (type union change is backward-compatible).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/009_merger_support.sql \
        src/lib/import/corporate-actions.ts \
        src/__tests__/lib/fifo-engine.test.ts
git commit -m "$(cat <<'EOF'
feat(merger): add merger action_type to CA union + FIFO cross-ISIN test

Migration 009 extends the DB CHECK constraint. The TypeScript union
addition propagates to adjustQtyPrice/cumulativeFactor so the FIFO
engine applies merger swap ratios identical to splits/bonuses.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: OrphanPairSuggestion Type + Detector + Tests

**Files:**
- Modify: `src/lib/import/tradebook-types.ts`
- Create: `src/lib/import/merger-detect.ts`
- Create: `src/__tests__/lib/merger-detect.test.ts`

**Interfaces:**
- Consumes: `SecurityTrades` from `"./corporate-action-detect"`, `CorporateActionContext` from `"./corporate-actions"`
- Produces:
  ```typescript
  // tradebook-types.ts
  export interface OrphanPairSuggestion {
    fromSymbol: string;
    fromStockId: string;
    toSymbol: string;
    toStockId: string | null;
    impliedRatio: number; // toQty / fromNetOpen
    fromQty: number;      // net open in from-security (for display)
    toQty: number;        // total sells in to-security (for display)
  }

  // merger-detect.ts
  export function detectOrphanPairs(
    securities: SecurityTrades[],
    ca: CorporateActionContext
  ): OrphanPairSuggestion[]
  ```

- [ ] **Step 1: Add OrphanPairSuggestion to tradebook-types.ts**

In `src/lib/import/tradebook-types.ts`, add after the `PendingCorporateAction` type:

```typescript
/** A possible cross-security merger suggested from orphan-pair heuristic. Never auto-applied. */
export interface OrphanPairSuggestion {
  fromSymbol: string;
  fromStockId: string;
  toSymbol: string;
  toStockId: string | null;
  impliedRatio: number;  // toQty / fromNetOpen (e.g. 2.31)
  fromQty: number;       // net open shares in from-security
  toQty: number;         // total sold shares in to-security
}
```

- [ ] **Step 2: Write the failing detector tests**

Create `src/__tests__/lib/merger-detect.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectOrphanPairs } from "@/lib/import/merger-detect";
import type { SecurityTrades } from "@/lib/import/corporate-action-detect";
import type { TradeForOpenPositions } from "@/lib/import/open-positions";

const EMPTY_CTX = { canonicalMap: new Map(), actionsBySecurity: new Map() };
const ACC = "acc-1";

function buy(sym: string, isin: string, stockId: string, date: string, qty: number): TradeForOpenPositions {
  return { id: "t1", user_id: "u", account_id: ACC, symbol: sym, isin, stock_id: stockId,
    trade_date: date, trade_type: "buy", quantity: qty, price: 100,
    executed_at: null, broker_trade_id: "b" };
}

function sell(sym: string, isin: string, stockId: string | null, date: string, qty: number): TradeForOpenPositions {
  return { id: "t2", user_id: "u", account_id: ACC, symbol: sym, isin, stock_id: stockId,
    trade_date: date, trade_type: "sell", quantity: qty, price: 200,
    executed_at: null, broker_trade_id: "s" };
}

function sec(sym: string, isin: string, stockId: string | null, trades: TradeForOpenPositions[]): SecurityTrades {
  return { symbol: sym, stock_id: stockId, isin, account_id: ACC, trades, holdingsQty: null };
}

describe("detectOrphanPairs", () => {
  it("detects Equitas→EquitasBnk shape (×2.31, denom 255 ≤ 500)", () => {
    const securities: SecurityTrades[] = [
      sec("EQUITAS", "INE988K01017", "from-id", [
        buy("EQUITAS", "INE988K01017", "from-id", "2022-01-01", 1020),
      ]),
      sec("EQUITASBNK", "INE063P01018", "to-id", [
        sell("EQUITASBNK", "INE063P01018", "to-id", "2024-04-15", 2356),
      ]),
    ];
    const suggestions = detectOrphanPairs(securities, EMPTY_CTX);
    expect(suggestions).toHaveLength(1);
    const s = suggestions[0];
    expect(s.fromSymbol).toBe("EQUITAS");
    expect(s.toSymbol).toBe("EQUITASBNK");
    expect(s.impliedRatio).toBeCloseTo(2356 / 1020, 4);
    expect(s.fromQty).toBe(1020);
    expect(s.toQty).toBe(2356);
  });

  it("does not suggest a pair if from-security also has sells", () => {
    // ARVINDFASN shape: buy 1500, sell 4800 — same security oversell, not a merger
    const securities: SecurityTrades[] = [
      sec("ARVINDFASN", "INE414G01012", "id-a", [
        buy("ARVINDFASN", "INE414G01012", "id-a", "2021-01-01", 1500),
        sell("ARVINDFASN", "INE414G01012", "id-a", "2023-06-01", 4800),
      ]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX)).toHaveLength(0);
  });

  it("does not suggest a pair if to-security also has buys", () => {
    const securities: SecurityTrades[] = [
      sec("ASTOCK", "INE001", "id-a", [buy("ASTOCK", "INE001", "id-a", "2021-01-01", 100)]),
      sec("BSTOCK", "INE002", "id-b", [
        buy("BSTOCK", "INE002", "id-b", "2020-01-01", 50),
        sell("BSTOCK", "INE002", "id-b", "2023-06-01", 231),
      ]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX)).toHaveLength(0);
  });

  it("skips a pair with a noisy ratio (denom > 500 in lowest terms)", () => {
    // from=487 (prime), to=709 (prime); gcd=1, denom=487 ≤ 500 → actually passes!
    // Use from=311, to=433: gcd(311,433)=gcd(311,122)=gcd(122,67)=gcd(67,55)=gcd(55,12)=gcd(12,7)=gcd(7,5)=gcd(5,2)=gcd(2,1)=1, denom=311 ≤ 500 → would pass
    // Use from=503 (prime), to=701 (prime); denom=503 > 500 → skipped
    const securities: SecurityTrades[] = [
      sec("FROM", "INE001", "id-a", [buy("FROM", "INE001", "id-a", "2021-01-01", 503)]),
      sec("TO",   "INE002", "id-b", [sell("TO", "INE002", "id-b", "2023-01-01", 701)]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX)).toHaveLength(0);
  });

  it("does not pair securities from different accounts", () => {
    const securities: SecurityTrades[] = [
      { symbol: "FROM", stock_id: "id-a", isin: "INE001", account_id: "acc-1", holdingsQty: null,
        trades: [buy("FROM", "INE001", "id-a", "2021-01-01", 1020)] },
      { symbol: "TO", stock_id: "id-b", isin: "INE002", account_id: "acc-2", holdingsQty: null,
        trades: [sell("TO", "INE002", "id-b", "2024-01-01", 2356)] },
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX)).toHaveLength(0);
  });

  it("skips from-security with no stock_id", () => {
    const securities: SecurityTrades[] = [
      sec("FROM", "INE001", null, [buy("FROM", "INE001", null, "2021-01-01", 1020)]),
      sec("TO",   "INE002", "id-b", [sell("TO", "INE002", "id-b", "2024-01-01", 2356)]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/lib/merger-detect.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `merger-detect.ts` doesn't exist yet.

- [ ] **Step 4: Implement merger-detect.ts**

Create `src/lib/import/merger-detect.ts`:

```typescript
import { adjustQtyPrice, type CorporateActionContext } from "./corporate-actions";
import { securityKey } from "./corporate-actions";
import type { SecurityTrades } from "./corporate-action-detect";
import type { OrphanPairSuggestion } from "./tradebook-types";

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** True when toQty/fromQty is a "clean" fraction (denominator ≤ 500 in lowest terms). */
function isCleanRatio(fromQty: number, toQty: number): boolean {
  const a = Math.round(fromQty);
  const b = Math.round(toQty);
  if (a <= 0 || b <= 0) return false;
  const g = gcd(a, b);
  return a / g <= 500;
}

function netQty(sec: SecurityTrades, ca: CorporateActionContext): { netOpen: number; totalSells: number } {
  const key = securityKey(sec.stock_id, sec.isin, ca.canonicalMap);
  const actions = ca.actionsBySecurity.get(key) ?? [];
  let buys = 0;
  let sells = 0;
  for (const t of sec.trades) {
    const { qty } = adjustQtyPrice(Number(t.quantity), Number(t.price), t.trade_date, actions);
    if (t.trade_type === "buy") buys += qty;
    else sells += qty;
  }
  return { netOpen: Math.max(0, buys - sells), totalSells: sells };
}

/**
 * Detect likely merger pairs in a set of securities.
 *
 * A pair (A, B) is a merger candidate when:
 *   - Same account
 *   - A has only buys, net open > 0, non-null stock_id
 *   - B has only sells, no buys
 *   - toQty / fromNetOpen has a "clean" rational denominator (≤ 500)
 *
 * Never auto-applied — always surfaced as a suggestion for user confirmation.
 */
export function detectOrphanPairs(
  securities: SecurityTrades[],
  ca: CorporateActionContext
): OrphanPairSuggestion[] {
  // Partition into buy-only and sell-only groups, keyed by account.
  const buyOnly = securities.filter(
    (s) =>
      s.stock_id != null &&
      s.trades.length > 0 &&
      s.trades.every((t) => t.trade_type === "buy")
  );
  const sellOnly = securities.filter(
    (s) =>
      s.trades.length > 0 &&
      s.trades.every((t) => t.trade_type === "sell")
  );

  const suggestions: OrphanPairSuggestion[] = [];

  for (const from of buyOnly) {
    const { netOpen } = netQty(from, ca);
    if (netOpen <= 0) continue;

    for (const to of sellOnly) {
      // Must be the same account (mergers happen account-by-account at the broker).
      if (from.account_id !== to.account_id) continue;

      const { totalSells } = netQty(to, ca);
      if (totalSells <= 0) continue;
      if (!isCleanRatio(netOpen, totalSells)) continue;

      suggestions.push({
        fromSymbol: from.symbol,
        fromStockId: from.stock_id as string,
        toSymbol: to.symbol,
        toStockId: to.stock_id,
        impliedRatio: totalSells / netOpen,
        fromQty: Math.round(netOpen),
        toQty: Math.round(totalSells),
      });
    }
  }

  return suggestions;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/lib/merger-detect.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Run full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/import/tradebook-types.ts \
        src/lib/import/merger-detect.ts \
        src/__tests__/lib/merger-detect.test.ts
git commit -m "$(cat <<'EOF'
feat(merger): orphan-pair detector + OrphanPairSuggestion type

detectOrphanPairs() finds buy-only/sell-only security pairs in the same
account where the ratio has a reduced-fraction denominator ≤ 500.
Suggestions are never auto-applied — always user-confirmed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Thread Merger Suggestions Through Engine + Server Action

**Files:**
- Modify: `src/lib/import/tradebook-types.ts`
- Modify: `src/lib/import/tradebook-import-engine.ts`
- Modify: `src/app/(authenticated)/actions/tradebook-actions.ts`
- Test: `src/__tests__/lib/tradebook-import-engine.test.ts`

**Interfaces:**
- Consumes: `detectOrphanPairs` from `"./merger-detect"`, `OrphanPairSuggestion` from `"./tradebook-types"`
- Produces:
  - `detectAndApplyForAccount` now returns `{ applied, pending, mergerSuggestions: OrphanPairSuggestion[] }`
  - `BatchImportResult.corporate_actions` gains `merger_suggestions: OrphanPairSuggestion[]`

- [ ] **Step 1: Extend BatchImportResult in tradebook-types.ts**

In `src/lib/import/tradebook-types.ts`, change the `BatchImportResult` interface:

```typescript
// Before:
corporate_actions: {
  applied: AppliedCorporateAction[];
  pending: PendingCorporateAction[];
};

// After:
corporate_actions: {
  applied: AppliedCorporateAction[];
  pending: PendingCorporateAction[];
  merger_suggestions: OrphanPairSuggestion[];
};
```

- [ ] **Step 2: Write failing test for merger suggestion threading**

Open `src/__tests__/lib/tradebook-import-engine.test.ts`. Find the existing `detectAndApplyForAccount` test section (look for the block that mocks the admin client and calls `detectAndApplyForAccount`). Add a new test:

```typescript
it("includes merger suggestions when orphan pairs exist", async () => {
  // Mock: account has EQUITAS buys only + EQUITASBNK sells only, same account.
  // The mock must return these as trades when queried.
  // See existing mock pattern in the file for the exact mock shape needed.
  // detectOrphanPairs should fire and produce one suggestion.

  // After calling detectAndApplyForAccount(mockAdmin, "user-1", "acc-1"):
  const result = await detectAndApplyForAccount(mockAdmin, "user-1", "acc-1");
  expect(result.mergerSuggestions).toHaveLength(1);
  expect(result.mergerSuggestions[0].fromSymbol).toBe("EQUITAS");
  expect(result.mergerSuggestions[0].toSymbol).toBe("EQUITASBNK");
  expect(result.mergerSuggestions[0].impliedRatio).toBeCloseTo(2356 / 1020, 2);
});
```

Read the existing test file's mock setup carefully, then adapt the mock to return EQUITAS buys + EQUITASBNK sells for account `"acc-1"`. The exact mock shape must match the existing pattern.

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/__tests__/lib/tradebook-import-engine.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: FAIL — `detectAndApplyForAccount` doesn't return `mergerSuggestions`.

- [ ] **Step 4: Update detectAndApplyForAccount in tradebook-import-engine.ts**

Add import at the top:

```typescript
import { detectOrphanPairs } from "./merger-detect";
import type { OrphanPairSuggestion } from "./tradebook-types";
```

Change the function return type at line 182:

```typescript
// Before:
): Promise<{ applied: AppliedCorporateAction[]; pending: PendingCorporateAction[] }> {

// After:
): Promise<{ applied: AppliedCorporateAction[]; pending: PendingCorporateAction[]; mergerSuggestions: OrphanPairSuggestion[] }> {
```

Before the `return { applied, pending };` at the end of the `try` block, add:

```typescript
const mergerSuggestions = detectOrphanPairs(securities, ca);
```

Change the return statement:

```typescript
return { applied, pending, mergerSuggestions };
```

Also update the catch block's empty return:

```typescript
return { applied: [], pending: [], mergerSuggestions: [] };
```

- [ ] **Step 5: Update importTradebookFiles in tradebook-actions.ts**

In `src/app/(authenticated)/actions/tradebook-actions.ts`, find the section around line 223 where `detectAndApplyForAccount` is called. Update:

```typescript
// Before:
const allApplied: AppliedCorporateAction[] = [];
const allPending: PendingCorporateAction[] = [];
const adminForCa = createAdminClient();
for (const accountId of affectedAccounts) {
  const { applied, pending } = await detectAndApplyForAccount(adminForCa, user.id, accountId);
  allApplied.push(...applied);
  allPending.push(...pending);
}
// ...
return {
  // ...
  corporate_actions: { applied: allApplied, pending: allPending },
};

// After:
const allApplied: AppliedCorporateAction[] = [];
const allPending: PendingCorporateAction[] = [];
const allMergerSuggestions: OrphanPairSuggestion[] = [];
const adminForCa = createAdminClient();
for (const accountId of affectedAccounts) {
  const { applied, pending, mergerSuggestions } = await detectAndApplyForAccount(adminForCa, user.id, accountId);
  allApplied.push(...applied);
  allPending.push(...pending);
  allMergerSuggestions.push(...mergerSuggestions);
}
// ...
return {
  // ...
  corporate_actions: { applied: allApplied, pending: allPending, merger_suggestions: allMergerSuggestions },
};
```

Add the import for `OrphanPairSuggestion` in the imports block at the top of the file.

Also update `recomputeTradebookAccounts` (around line 302) to thread merger_suggestions similarly, and update any place that constructs a `BatchImportResult` to include `merger_suggestions: []`.

- [ ] **Step 6: Run tests**

```bash
npm test 2>&1 | tail -30
```

Fix any TypeScript errors from the return-type mismatch (e.g. the partial result at line 245 without merger_suggestions). Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/import/tradebook-types.ts \
        src/lib/import/tradebook-import-engine.ts \
        src/app/(authenticated)/actions/tradebook-actions.ts \
        src/__tests__/lib/tradebook-import-engine.test.ts
git commit -m "$(cat <<'EOF'
feat(merger): thread OrphanPairSuggestion through engine + server action

detectAndApplyForAccount now returns mergerSuggestions alongside applied
and pending. BatchImportResult gains merger_suggestions field. import
server action aggregates suggestions across all affected accounts.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: recordMerger Server Action + Tests

**Files:**
- Modify: `src/app/(authenticated)/actions/tradebook-actions.ts`
- Test: `src/__tests__/lib/trade-corrections-actions.test.ts` (add to existing file)

**Interfaces:**
- Produces:
  ```typescript
  export async function recordMerger(input: {
    fromStockId: string;
    toStockId: string;
    ratio: number;
    exDate: string;
  }): Promise<ActionResult>
  ```

- [ ] **Step 1: Write failing tests**

Add to `src/__tests__/lib/trade-corrections-actions.test.ts` (or create `merger-actions.test.ts` if the file becomes unwieldy — prefer adding to the existing file first):

```typescript
// Import recordMerger at the top with other imports
// import { recordMerger } from "@/app/(authenticated)/actions/tradebook-actions";

describe("recordMerger", () => {
  it("succeeds: sets canonical_stock_id and upserts merger CA row", async () => {
    // Mock: supabase.from("trades").select().in("stock_id", ...) returns 1 row for fromStockId
    // Mock: admin.from("indian_stocks").update().eq() succeeds
    // Mock: admin.from("corporate_actions").upsert() succeeds
    // Mock: supabase.from("accounts").select() returns [{ id: "acc-1" }]
    // Mock: recomputeFifoForAccount succeeds (vi.mock at module level)

    const result = await recordMerger({
      fromStockId: "from-id",
      toStockId: "to-id",
      ratio: 2.31,
      exDate: "2023-10-01",
    });
    expect(result).toEqual({ data: undefined }); // ActionResult success
  });

  it("throws AppError when ratio ≤ 0", async () => {
    const result = await recordMerger({
      fromStockId: "from-id", toStockId: "to-id", ratio: 0, exDate: "2023-10-01",
    });
    expect(result).toMatchObject({ error: expect.stringContaining("ratio") });
  });

  it("throws AppError when exDate is in the future", async () => {
    const result = await recordMerger({
      fromStockId: "from-id", toStockId: "to-id", ratio: 2.31, exDate: "2099-01-01",
    });
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("throws AppError when fromStockId === toStockId", async () => {
    const result = await recordMerger({
      fromStockId: "same-id", toStockId: "same-id", ratio: 2.31, exDate: "2023-10-01",
    });
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("throws AppError when caller has no trades in from-security", async () => {
    // Mock: supabase.from("trades").select()...returns [] (no trades)
    const result = await recordMerger({
      fromStockId: "from-id", toStockId: "to-id", ratio: 2.31, exDate: "2023-10-01",
    });
    expect(result).toMatchObject({ error: expect.stringContaining("trade") });
  });
});
```

Study the existing test mocking pattern in `trade-corrections-actions.test.ts` before writing the mocks — match the exact `vi.mock`/`vi.mocked` shape used there.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/lib/trade-corrections-actions.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: FAIL — `recordMerger` not exported yet.

- [ ] **Step 3: Implement recordMerger in tradebook-actions.ts**

Add after `applyCorporateAction` (around line 457):

```typescript
export async function recordMerger(input: {
  fromStockId: string;
  toStockId: string;
  ratio: number;
  exDate: string;
}): Promise<ActionResult> {
  return action(async () => {
    const today = new Date().toISOString().slice(0, 10);
    if (!(input.ratio > 0)) throw new AppError("Merger ratio must be greater than zero.");
    if (input.exDate > today) throw new AppError("Effective date cannot be in the future.");
    if (input.fromStockId === input.toStockId) throw new AppError("From and to securities must be different.");

    const { user, supabase } = await getAuthUser();
    const admin = createAdminClient();

    // Ownership gate: caller must have at least one non-excluded trade in the from-security.
    const { data: trades, error: tradeErr } = await supabase
      .from("trades")
      .select("id")
      .eq("stock_id", input.fromStockId)
      .eq("excluded", false)
      .limit(1);
    if (tradeErr) throw new AppError(tradeErr.message);
    if (!trades || trades.length === 0) {
      throw new AppError("You don't have trades for this security.");
    }

    // 1. Point the from-security at the canonical (to-security).
    //    The enforce_canonical_one_level trigger rejects chains automatically.
    const { error: canonErr } = await admin
      .from("indian_stocks")
      .update({ canonical_stock_id: input.toStockId })
      .eq("id", input.fromStockId);
    if (canonErr) throw new AppError(canonErr.message);

    // 2. Upsert the merger corporate action on the to-security.
    const { error: caErr } = await admin.from("corporate_actions").upsert(
      {
        stock_id: input.toStockId,
        action_type: "merger",
        ex_date: input.exDate,
        factor: input.ratio,
        source: "manual",
      },
      { onConflict: "stock_id,action_type,ex_date" }
    );
    if (caErr) throw new AppError(caErr.message);

    // 3. Recompute FIFO for all of the caller's accounts.
    const { data: accts } = await supabase.from("accounts").select("id");
    for (const a of (accts ?? []) as Array<{ id: string }>) {
      await recomputeFifoForAccount(admin, user.id, a.id);
    }
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/__tests__/lib/trade-corrections-actions.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: all `recordMerger` tests pass.

- [ ] **Step 5: Run full test suite + type check**

```bash
npm test 2>&1 | tail -20 && npx tsc --noEmit 2>&1 | head -20
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/app/(authenticated)/actions/tradebook-actions.ts \
        src/__tests__/lib/trade-corrections-actions.test.ts
git commit -m "$(cat <<'EOF'
feat(merger): recordMerger server action

Ownership-gated, validates ratio/date/identity. Sets canonical_stock_id
then upserts a 'merger' corporate_actions row, then recomputes FIFO for
all caller accounts. No reconciliation gate — user explicitly confirms.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Import Dialog — Merger Suggestion UI

**Files:**
- Modify: `src/components/trades/trade-import-dialog.tsx`

**Interfaces:**
- Consumes: `OrphanPairSuggestion` from `"@/lib/import/tradebook-types"`, `recordMerger` from `"@/app/(authenticated)/actions/tradebook-actions"`
- Note: `BatchImportResult.corporate_actions.merger_suggestions` is now available after import.

- [ ] **Step 1: Read the current dialog state shape**

Read `src/components/trades/trade-import-dialog.tsx` in full. Identify:
- Where `corporateActions` state is set (after `importTradebookFiles` / `recomputeTradebookAccounts` returns)
- Where pending CAs are rendered (search for `corporateActions.pending.map`)
- The `confirmAction` helper shape

- [ ] **Step 2: Add merger suggestion state and rendering**

Make these changes (exact line numbers will vary — use the search above):

**Add import:**
```typescript
import type { OrphanPairSuggestion } from "@/lib/import/tradebook-types";
import { recordMerger } from "@/app/(authenticated)/actions/tradebook-actions";
```

**Extend the `corporateActions` state** to hold `merger_suggestions`:

```typescript
// Before the type was implicitly { applied: ...; pending: ... }
// Change to:
const [corporateActions, setCorporateActions] = useState<{
  applied: AppliedCorporateAction[];
  pending: PendingCorporateAction[];
  merger_suggestions: OrphanPairSuggestion[];
} | null>(null);
```

**When setting corporateActions** (wherever `setCorporateActions({ applied, pending })` is called), include `merger_suggestions`:

```typescript
setCorporateActions({
  applied: r.corporate_actions.applied,
  pending: r.corporate_actions.pending,
  merger_suggestions: r.corporate_actions.merger_suggestions,
});
```

**Add a `confirmMerger` handler** (alongside `confirmAction`):

```typescript
const confirmMerger = async (s: OrphanPairSuggestion, ratio: number, exDate: string) => {
  const result = await recordMerger({
    fromStockId: s.fromStockId,
    toStockId: s.toStockId ?? "",
    ratio,
    exDate,
  });
  if ("error" in result) {
    toastError("Failed to record merger", result.error);
    return;
  }
  setCorporateActions((prev) =>
    prev
      ? { ...prev, merger_suggestions: prev.merger_suggestions.filter((m) => m !== s) }
      : prev
  );
  invalidateTrades();
};
```

**Render merger suggestions** below the existing pending CAs block:

```tsx
{corporateActions.merger_suggestions.length > 0 && (
  <div className="mt-3 space-y-2">
    <p className="text-sm font-medium text-muted-foreground">Possible mergers detected</p>
    {corporateActions.merger_suggestions.map((s, i) => (
      <MergerSuggestionRow
        key={i}
        suggestion={s}
        onConfirm={(ratio, exDate) => confirmMerger(s, ratio, exDate)}
      />
    ))}
  </div>
)}
```

**Add `MergerSuggestionRow` component** at the top of the file (before the main dialog component):

```tsx
function MergerSuggestionRow({
  suggestion,
  onConfirm,
}: {
  suggestion: OrphanPairSuggestion;
  onConfirm: (ratio: number, exDate: string) => void;
}) {
  const [ratio, setRatio] = useState(Number(suggestion.impliedRatio.toFixed(4)));
  const [exDate, setExDate] = useState("");
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
      <p className="font-medium">
        {suggestion.fromSymbol} → {suggestion.toSymbol}
        <span className="ml-2 text-muted-foreground">
          ({suggestion.fromQty.toLocaleString()} shares → {suggestion.toQty.toLocaleString()} shares)
        </span>
      </p>
      <p className="mt-1 text-muted-foreground">
        Implied swap ratio: ×{suggestion.impliedRatio.toFixed(4)}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Ratio
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            value={ratio}
            onChange={(e) => setRatio(Number(e.target.value))}
            className="w-24 rounded border px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Effective date
          <input
            type="date"
            max={today}
            value={exDate}
            onChange={(e) => setExDate(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          />
        </label>
        <Button
          size="sm"
          disabled={busy || ratio <= 0 || !exDate}
          onClick={async () => {
            setBusy(true);
            try { await onConfirm(ratio, exDate); }
            finally { setBusy(false); }
          }}
        >
          {busy ? "Applying…" : "Confirm merger"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Handle `reset()` — clear merger_suggestions**

In the `reset` function (wherever `setCorporateActions(null)` is called), ensure it stays `null` (that already clears everything, including merger_suggestions).

- [ ] **Step 4: Start dev server and verify the UI renders without errors**

```bash
npm run dev 2>&1 &
```

Navigate to the trades dashboard, open the import dialog, import a CSV. Check that:
1. No console errors
2. The "Possible mergers" section appears only when `merger_suggestions.length > 0`
3. The ratio and date inputs work
4. The "Confirm merger" button is disabled until a date is selected

- [ ] **Step 5: Run tests + type check**

```bash
npm test 2>&1 | tail -20 && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add src/components/trades/trade-import-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(merger): show merger suggestions in import dialog

MergerSuggestionRow lets users confirm/adjust ratio + date for orphan
pairs detected during import. Calls recordMerger on confirm, removes
the row from state on success.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Trades Dashboard — "Record Merger" Button + Dialog

**Files:**
- Create: `src/components/trades/record-merger-dialog.tsx`
- Modify: `src/app/(authenticated)/trades/page.tsx`

**Interfaces:**
- Consumes: `recordMerger` from `"@/app/(authenticated)/actions/tradebook-actions"`, `useInvalidateTrades` from `"@/hooks/use-trades-data"`, `DashboardAccount` and `useTradesData` from existing hooks
- The dialog needs a searchable list of the user's traded securities. Reuse `getOpenPositions` from the existing trades actions (it already returns `symbol` + `stock_id`).

- [ ] **Step 1: Read open positions action**

```bash
grep -n "getOpenPositions\|OpenPosition" src/app/\(authenticated\)/actions/trades-actions.ts | head -15
```

Note the return type — the dialog's from/to selects will be populated from this list.

- [ ] **Step 2: Create the dialog component**

Create `src/components/trades/record-merger-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogBackdrop, DialogPanel } from "@base-ui-components/react/dialog";
import { Button } from "@/components/ui/button";
import { recordMerger } from "@/app/(authenticated)/actions/tradebook-actions";
import { getOpenPositions } from "@/app/(authenticated)/actions/trades-actions";
import { toastError } from "@/lib/toast-error";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}

export function RecordMergerDialog({ open, onClose, onMerged }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [fromStockId, setFromStockId] = useState("");
  const [toStockId, setToStockId] = useState("");
  const [ratio, setRatio] = useState("");
  const [exDate, setExDate] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: positions = [] } = useQuery({
    queryKey: ["open-positions-for-merger"],
    queryFn: () => getOpenPositions("all"),
    enabled: open,
    staleTime: 30_000,
  });

  const securities = positions
    .filter((p) => p.stock_id != null)
    .map((p) => ({ stockId: p.stock_id as string, symbol: p.symbol }));

  const reset = () => {
    setFromStockId(""); setToStockId(""); setRatio(""); setExDate("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromStockId || !toStockId || !ratio || !exDate) return;
    const ratioNum = Number(ratio);
    if (!(ratioNum > 0)) { toastError("Invalid ratio", "Ratio must be greater than zero."); return; }
    setBusy(true);
    try {
      const result = await recordMerger({ fromStockId, toStockId, ratio: ratioNum, exDate });
      if ("error" in result) { toastError("Failed to record merger", result.error); return; }
      toast.success("Merger recorded and FIFO recomputed.");
      reset();
      onMerged();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <DialogPanel className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold">Record Merger</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">From security (absorbed)</label>
            <select
              required
              value={fromStockId}
              onChange={(e) => setFromStockId(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Select…</option>
              {securities.map((s) => (
                <option key={s.stockId} value={s.stockId}>{s.symbol}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Into security (surviving)</label>
            <select
              required
              value={toStockId}
              onChange={(e) => setToStockId(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Select…</option>
              {securities.map((s) => (
                <option key={s.stockId} value={s.stockId}>{s.symbol}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-sm font-medium">Swap ratio</label>
              <input
                required
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder="e.g. 2.31"
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">Shares received per share held</p>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-sm font-medium">Effective date</label>
              <input
                required
                type="date"
                max={today}
                value={exDate}
                onChange={(e) => setExDate(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Recording…" : "Record merger"}
            </Button>
          </div>
        </form>
      </DialogPanel>
    </Dialog>
  );
}
```

- [ ] **Step 3: Add the button to the trades page**

In `src/app/(authenticated)/trades/page.tsx`, add:

```typescript
import { RecordMergerDialog } from "@/components/trades/record-merger-dialog";
```

Add state:

```typescript
const [mergerDialogOpen, setMergerDialogOpen] = useState(false);
```

In the toolbar `<div className="flex items-center gap-3">`, add the button after `<TradeImportButton />`:

```tsx
<Button variant="outline" size="sm" onClick={() => setMergerDialogOpen(true)}>
  Record merger
</Button>
<RecordMergerDialog
  open={mergerDialogOpen}
  onClose={() => setMergerDialogOpen(false)}
  onMerged={invalidateTrades}
/>
```

- [ ] **Step 4: Verify the dialog in the browser**

With the dev server running:
1. Navigate to `/trades`
2. Click "Record merger" — dialog opens
3. Select two securities, enter ratio and date
4. Click "Record merger" — toast appears, dialog closes

Also verify that `getOpenPositions` is the right action to use. If it returns only positions with `quantity > 0`, ensure that from-securities (which may still have open quantity before merger is recorded) and to-securities both appear. If they don't appear in the select (because they have no open position in the current FIFO state), switch to fetching all distinct securities the user has traded:

```typescript
// Alternative: fetch all distinct symbols from trades
const { data: allStocks } = await supabase
  .from("trades")
  .select("symbol, stock_id")
  .eq("excluded", false)
  .not("stock_id", "is", null)
  .order("symbol");
// deduplicate client-side
```

Adjust as needed based on what the dev server shows.

- [ ] **Step 5: Run tests + lint + type check**

```bash
npm test 2>&1 | tail -20 && npm run lint 2>&1 | head -20 && npx tsc --noEmit 2>&1 | head -20
```

Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/trades/record-merger-dialog.tsx \
        src/app/\(authenticated\)/trades/page.tsx
git commit -m "$(cat <<'EOF'
feat(merger): Record Merger dialog on trades dashboard

Manual entry form for cross-ISIN merger events that the orphan-pair
heuristic misses. Calls recordMerger, recomputes FIFO, invalidates
the open-positions query.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Section 1 (migration 009): Task 1, Step 1
- [x] Section 2 (recordMerger action): Task 4
- [x] Section 3 (orphan-pair detector): Task 2
- [x] Section 4 (import dialog suggestions): Task 5
- [x] Section 5 (manual form): Task 6
- [x] Section 6 (FIFO mechanics — 'merger' in union): Task 1, Step 2
- [x] Section 7 (type changes): Tasks 1-3
- [x] Section 8 (tests): Tasks 1-4

**Placeholder scan:** None found — all steps include concrete code.

**Type consistency:**
- `OrphanPairSuggestion` defined in Task 2, used consistently in Tasks 3, 5
- `recordMerger` return type `ActionResult` (no type arg = `ActionResult<void>`) — matches existing `action()` wrapper pattern
- `detectAndApplyForAccount` return type updated consistently in Task 3

**Note for executor:** Apply `supabase/migrations/009_merger_support.sql` manually in the Supabase Dashboard SQL editor before testing recordMerger end-to-end. The DB constraint must be relaxed before the `corporate_actions` upsert with `action_type = 'merger'` will succeed.
