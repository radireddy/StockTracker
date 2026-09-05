# Merger Support — Design Spec

**Date:** 2026-09-05  
**Branch:** feat/corporate-action-auto-detect  
**Status:** Approved

---

## Problem

When two Indian securities participate in a reverse merger (e.g. Equitas Holdings →
Equitasbnk), the event looks like two orphaned positions:

- From-security: buys only, never any sells, net open > 0  
- To-security: sells (or holdings) but no buys

The existing corporate-action engine handles splits and bonuses (same ISIN, same
stock_id, multiplier applied in-place). Mergers cross ISIN and stock_id boundaries,
so the FIFO engine sees an apparent short-sell on the to-security and a phantom
holding on the from-security.

---

## Scope

- Support mergers where buys are in the from-security and sells (or current holdings)
  are in the to-security, with a fixed swap ratio.
- Auto-detect likely merger pairs after import and surface as a suggestion (never
  auto-apply — feed has no merger records).
- Manual entry for pairs the heuristic misses.
- No new table: reuse `corporate_actions` with `action_type = 'merger'` and the
  existing `canonical_stock_id` pointer.

---

## Section 1 — Data Model (migration `009`)

### `corporate_actions.action_type`

Extend the CHECK constraint from `('split', 'bonus')` to `('split', 'bonus', 'merger')`.

A merger row describes the swap applied to the **to-security** at the effective date.
`factor` holds the swap ratio (e.g. 2.31 for "231 shares received per 100 held").

### `indian_stocks.canonical_stock_id`

This column already exists (migration 006). For a merger, the from-security gets
`canonical_stock_id = to_security_id`, exactly like a renamed security. No schema
change needed — only the application of the value.

### One-level trigger

The existing `enforce_canonical_one_level` trigger already prevents chains.
No change needed.

### Why no separate `mergers` table

`adjustQtyPrice` (in `corporate-actions.ts`) already applies a multiplier to a
trade's qty/price based on `action_type + ex_date`. Adding `'merger'` to the enum
makes the existing FIFO path pick up merger adjustments at no additional complexity.
A separate table would duplicate all that logic.

---

## Section 2 — Apply Mechanism: `recordMerger` server action

**File:** `src/app/(authenticated)/actions/tradebook-actions.ts` (or
`merger-actions.ts` if the file grows unwieldy — TBD at implementation time).

**Input:**
```ts
{
  fromStockId: string;
  toStockId: string;
  ratio: number;      // shares received per share held (e.g. 2.31)
  exDate: string;     // "YYYY-MM-DD"
}
```

**Validations (throw `AppError` on failure):**
- `ratio > 0`
- `exDate` is not in the future (≤ today)
- `fromStockId !== toStockId`
- Caller has at least one non-excluded trade in `fromStockId` (ownership gate via
  RLS-scoped client, same pattern as `applyCorporateAction`)

**Steps (using admin client for writes):**
1. Set `canonical_stock_id = toStockId` on the from-security's `indian_stocks` row.
   The existing trigger rejects the write if it would create a chain.
2. Upsert a `corporate_actions` row:
   `{ stock_id: toStockId, action_type: 'merger', ex_date: exDate, factor: ratio, source: 'manual' }`
3. Recompute FIFO for all accounts that hold from- or to-security trades, using the
   existing `recomputeOpenPositions` helper.

**No reconciliation gate.** Splits and bonuses need a gate because the user could
post a wrong factor. Mergers are user-confirmed (they see the suggestion with the
computed ratio and explicitly confirm). The ownership gate is the only safety check.

---

## Section 3 — Auto-detect: Orphan-Pair Detector

**New file:** `src/lib/import/merger-detect.ts`

### Algorithm

Runs once per import completion, over the set of `SecurityTrades` objects produced
by the import engine.

```
For each pair (A, B) of distinct securities:
  if A.trades are all buys (no sells) AND A.netOpen > 0
  AND B.trades are all sells (no buys) AND B.totalSells > 0:
    impliedRatio = B.totalSells / A.netOpen
    if ratio looks "clean" (see below):
      emit OrphanPairSuggestion { fromSymbol, fromStockId, toSymbol, toStockId, ratio, confidence }
```

"Clean ratio" heuristic — denominator ≤ 500 after reducing the fraction, or ratio is
within 0.005 of a simple decimal. This accepts 231/100 = 2.31 and rejects noise like
1.367 (ARVINDFASN's missing history). The threshold can be relaxed at runtime if the
user sees a real merger go undetected.

`netOpen` is computed from the canonical FIFO context (so a prior split on A is
already folded in before the ratio is computed).

**No cross-account merge.** A merger happened account-by-account at the broker. Only
pair trades within the same account.

**Exported type:**
```ts
export interface OrphanPairSuggestion {
  fromSymbol: string;
  fromStockId: string;
  toSymbol: string;
  toStockId: string;
  impliedRatio: number;
  fromQty: number;   // shown in UI so user can verify the math
  toQty: number;
}
```

---

## Section 4 — Import Dialog: Merger Suggestions

After import, the engine returns merger suggestions alongside the existing
`applied` and `pending` corporate-action lists.

**Engine change:** `detectCorporateActionsForAccount` (in
`tradebook-import-engine.ts`) adds a third return key:
```ts
{ applied, pending, mergerSuggestions: OrphanPairSuggestion[] }
```

**UI (in `trade-import-dialog.tsx`):** If `mergerSuggestions.length > 0`, show a
"Possible mergers" subsection below the existing corporate-actions block. Each row:

> `EQUITAS → EQUITASBNK · ×2.31 (1,020 shares → 2,356)`  
> [Confirm] with an editable ratio input and date picker

Confirming calls `recordMerger` and removes the suggestion from the list. No
auto-apply.

**The suggestion is not persisted.** It only lives in the import dialog's React
state. If the user closes without confirming, the suggestion reappears on the next
import.

---

## Section 5 — Manual "Record Merger" Form

**Where:** A "Record merger" button in the trades dashboard toolbar (next to the
existing import button). Opens a dialog.

**Fields:**
- From-security: searchable select over the user's traded securities (symbols)
- To-security: same
- Swap ratio: number input (validates > 0)
- Effective date: date input (validates ≤ today)

Submits to `recordMerger`. On success, invalidates trades and open positions.

---

## Section 6 — FIFO Mechanics

`adjustQtyPrice` in `corporate-actions.ts` already handles any `action_type` value
(it only cares about factor and ex_date). Adding `'merger'` to the TypeScript union
in `CorporateAction.action_type` is the only code change.

In `cumulativeFactor` (also in `corporate-actions.ts`), merger actions are included
in the cumulative multiplier identically to splits. This is correct: when the FIFO
engine processes the to-security, it sees the from-security's buy lots (because
`canonical_stock_id` remaps them) and scales their qty/price by the merger factor at
the effective date. The result is the correct cost basis and quantity in the
to-security's units.

---

## Section 7 — Type Changes

**`src/lib/import/corporate-actions.ts`**
```ts
// Before:
action_type: "split" | "bonus";

// After:
action_type: "split" | "bonus" | "merger";
```

This single union change propagates automatically through `adjustQtyPrice`,
`cumulativeFactor`, `CorporateActionContext`, and the engine.

**`src/lib/import/tradebook-types.ts`** — add `mergerSuggestions` to
`TradeImportResult`.

**`src/app/(authenticated)/actions/tradebook-actions.ts`** — add
`recordMerger` export and update `applyCorporateAction`'s input type for
`action_type` union.

---

## Section 8 — Testing

**`src/__tests__/lib/merger-detect.test.ts`** (new)
- Equitas shape: buy 1,020 EQUITAS, sell 2,356 EQUITASBNK → suggestion ×2.31
- Fully exited same-security: no suggestion (both buys and sells present)
- Noisy ratio (1.367): no suggestion emitted
- Cross-account: no suggestion (A in account-1, B in account-2)

**`src/__tests__/lib/merger-actions.test.ts`** (new, or added to
`trade-corrections-actions.test.ts`)
- Happy path: canonical set, CA row upserted, FIFO recomputed
- Future date: throws AppError
- No trades for from-security: throws AppError (ownership gate)
- fromStockId === toStockId: throws AppError
- ratio ≤ 0: throws AppError

**`src/__tests__/lib/fifo-engine.test.ts`** — add merger shape test:
- 1,020 EQUITAS bought at ₹100 on 2022-01-01
- merger ×2.31 on 2023-10-01 (canonical EQUITAS → EQUITASBNK)
- 2,356 EQUITASBNK sold on 2024-04-15
- FIFO open = 0 (no phantom short), cost basis = ₹100 / 2.31 = ₹43.29/share in
  EQUITASBNK units

---

## Migration Script: `009_merger_support.sql`

```sql
-- 009_merger_support.sql — extend corporate_actions to support mergers

ALTER TABLE corporate_actions
  DROP CONSTRAINT IF EXISTS corporate_actions_action_type_check;

ALTER TABLE corporate_actions
  ADD CONSTRAINT corporate_actions_action_type_check
    CHECK (action_type IN ('split', 'bonus', 'merger'));
```

No data migration needed. The `canonical_stock_id` mechanism already exists.
`source` already accepts `'manual'`. Factor already accepts any positive numeric.

---

## What This Does NOT Handle

- **Multi-leg mergers** (A+B → C): requires multiple canonical pointers, out of scope.
- **Cash-component mergers** (ratio + cash): factor only covers share component.
- **Feed-sourced mergers**: NSE/BSE CA feed doesn't publish merger data; all mergers
  are manual-entry or heuristic-suggested.
- **Holdings-statement-only evidence**: the orphan-pair detector runs only over trade
  history, not holdings snapshots.
