# Trade Review & Correction — Design

**Date:** 2026-09-05
**Branch:** `feat/corporate-action-auto-detect`
**Status:** Design (awaiting approval)

## Problem

The tradebook import auto-detects corporate actions and reconciles trades, but
when a position can't be reconciled (e.g. `sold 320 vs bought 62`) the import
dialog shows a "review manually" message that is a **dead end** — there is no way
for the user to act on it:

- `trades-actions.ts` exposes only reads (`getOpenPositions`, `getOpenLotsForStock`).
  There is **no manual trade entry, edit, or delete** anywhere in the app.
- The dominant real cause of these mismatches is **missing buy history** (import
  date-range gaps) — shares sold/held that were never bought in the imported
  files. The feed is complete; the trades are not. Secondary causes: shares
  transferred in, IPO/demerger allotments, or history Zerodha no longer provides.

Users need to review a position's trade timeline and correct it: add missing
buys, edit wrong data, remove erroneous rows, and record sales.

## Goals

- Per-company CRUD on trades from the **trades dashboard**: edit / delete a
  trade, add a new trade, and sell (all or partial) at the company level.
- Corrections survive tradebook **reimports** (idempotent upsert never wipes them).
- Preserve an **audit trail**: broker trades stay recoverable even after edit or
  "delete".
- Keep the import page's existing status + mismatch/CA info, and point users to
  the dashboard for corrections.

## Non-Goals (v1)

- Manual / forced corporate-action entry and CA deletion. Corporate actions
  remain handled entirely on the import page (auto-apply + the existing Apply
  button). Revisit later if needed.
- Per-lot "sell" targeting. FIFO is oldest-first; selling is a company-level
  quantity operation.
- A central "positions needing review" list. Fully-exited/oversold positions are
  surfaced on the import page as today; the dashboard shows only open positions.

## Chosen Approach — Hybrid (Approach C)

Broker trades are declared immutable raw records, and reimport is an idempotent
upsert on `(account_id, broker_trade_id)` that only **inserts** (never deletes).
Hard-deleting a broker trade would therefore be silently undone by the next
reimport. The hybrid model resolves this:

- **Broker trades** (`source='zerodha'`): **soft-exclude** (hidden from FIFO, row
  persists so reimport can't resurrect it) and **override-in-place** (edited value
  used; original preserved in a JSONB column; shown as "edited", resettable).
- **Manual trades** (`source='manual'`): full create / edit / hard-delete. Given a
  synthetic `broker_trade_id`, they never collide with a reimport and persist for
  free.

## Data Model — migration `008_trade_corrections.sql`

Applied manually via the Supabase Dashboard SQL editor (per project convention).

### `trades` — three new columns

```sql
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS source   TEXT NOT NULL DEFAULT 'zerodha'
    CHECK (source IN ('zerodha','manual')),
  ADD COLUMN IF NOT EXISTS excluded BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original JSONB;
```

- `source` — discriminator. Existing rows default to `'zerodha'`.
- `excluded` — soft-delete flag. FIFO and all read paths ignore `excluded=true`.
- `original` — snapshot of `{quantity, price, trade_date, trade_type}` captured on
  the **first** override of a broker trade; `NULL` if never edited. Powers the
  "edited" badge and reset-to-original.

**Manual rows:** inserted with `source='manual'` and
`broker_trade_id = 'manual-' || gen_random_uuid()`, satisfying the existing
`UNIQUE(account_id, broker_trade_id)` and guaranteeing no reimport collision.

Optional supporting index (open, non-excluded lookups are the hot path):

```sql
CREATE INDEX IF NOT EXISTS idx_trades_account_active
  ON trades(account_id) WHERE excluded = false;
```

### Read/FIFO path must exclude soft-deleted rows

The same migration re-creates the two SQL functions from `005_tradebook.sql`,
adding `AND t.excluded = false` to the trade scans in both:

- `get_open_positions(p_account_ids uuid[])`
- `get_open_lots_for_stock(p_isin text, p_account_ids uuid[])`

App-side trade fetches add `.eq("excluded", false)`:

- `recomputeFifoForAccount` (FIFO input) in `tradebook-import-engine.ts`
- `detectAndApplyForAccount` (CA detection input) in `tradebook-import-engine.ts`

All read live columns, so overrides take effect with no extra logic.

## Server Actions

Convention (per project memory): mutations return `ActionResult` via the
`action()` wrapper + `toastError`/`describeDbError`; reads throw. Ownership is
gated with the RLS-scoped client; writes + FIFO recompute use the admin client.
Every mutation recomputes FIFO for the **affected account only** (reusing
`recomputeFifoForAccount`); no CA re-detection runs, so edits never re-flag.

### Reads — reuse existing

`getOpenLotsForStock(isin, accountIds?)` already returns per-lot rows with `id`
and `broker_trade_id`; the dashboard panel uses it as-is. (It naturally excludes
`excluded=true` rows via the updated SQL function.)

### Mutations — new file `trade-corrections-actions.ts`

```
addManualTrade({ accountId, isin, stockId?, symbol,
                 trade_type: 'buy'|'sell', quantity, price, trade_date })
updateTrade({ tradeId, quantity?, price?, trade_date? })
deleteTrade(tradeId)
sellPosition({ isin, accountId, quantity, price, trade_date })
resetTradeToOriginal(tradeId)
```

- **`addManualTrade`** — inserts `source='manual'` with synthetic
  `broker_trade_id`; `stock_id` resolved from `isin` when not supplied.
- **`updateTrade`** — broker trade: capture `original` once (if `NULL`), then
  update live columns; manual trade: update directly.
- **`deleteTrade`** — `source='manual'` → hard `DELETE`; `source='zerodha'` →
  `UPDATE excluded=true`.
- **`sellPosition`** — records **one** manual sell of `quantity` for the
  stock/account (default `quantity` = total open qty ⇒ "sell all"; smaller ⇒
  partial). FIFO consumes oldest-first on recompute.
- **`resetTradeToOriginal`** — restore `original` into live columns, set
  `original = NULL`.

**Validation (every write):** `quantity > 0`, `price >= 0`, `trade_date` not in
the future, `trade_type ∈ {buy,sell}`, and the account/trade belongs to the
caller. `sellPosition` additionally rejects `quantity` greater than current open
qty.

## UI

### Trades dashboard — `OpenLotsPanel` (per company, expanded)

- **Per-lot row actions:** **Edit** (inline: qty / price / date) and **Delete**
  (confirm dialog; broker → excluded, manual → removed).
- **Row badges:** `manual` for `source='manual'`; `edited` (with **Reset**) when
  `original` is non-null.
- **Panel header (company-level):**
  - **Add trade** — dialog: buy/sell, quantity, price, date, account.
  - **Sell** — dialog: quantity **prefilled to full open qty (editable down for a
    partial sell)**, price, date. Records one manual sell via `sellPosition`.
- After any action: refetch the position's lots and refresh the positions list; a
  fully-sold company then drops off the dashboard automatically (only open
  positions are returned).

### Import dialog — `trade-import-dialog.tsx`

Keep all existing content (import status, corporate-action applied/pending,
mismatch "review manually" lines). Add one line:

> "You can review, edit, or correct these trades anytime from the dashboard."

## Reimport Safety (why the hybrid holds)

| Correction | Reimport behavior |
|---|---|
| Manual trade added | Synthetic `broker_trade_id` never conflicts → untouched. |
| Broker trade excluded | Row persists with `excluded=true`; upsert `ignoreDuplicates` → no-op → stays excluded. |
| Broker trade edited | Row persists with edited live columns + `original`; upsert no-op → edit preserved. |
| Manual trade deleted | Hard-deleted; no matching broker row exists to reinsert. |

## Error Handling

- All mutations wrapped by `action()`; DB errors surfaced via `describeDbError`
  and `toastError` (prod-redacted per convention).
- Ownership failures throw `AppError("You don't have access to this trade.")`.
- `sellPosition` over-quantity throws `AppError("Sell quantity exceeds open position.")`.
- FIFO recompute failures roll the mutation's user-facing result to an error toast
  but never crash the dashboard.

## Testing

Unit (Vitest), following existing import-test patterns:

- **actions** (mocked Supabase, as in `tradebook-import-engine.test.ts`):
  add/update/delete/sell happy paths; broker delete → `excluded=true`; manual
  delete → row gone; broker edit snapshots `original` once; reset restores it;
  over-sell rejected; future date rejected; ownership rejection.
- **FIFO exclusion:** `excluded=true` rows are omitted from `computeFifoMatches`
  input and from open-position output.
- **reimport safety:** re-running the import engine over a set that includes a
  manual row and an excluded broker row leaves both intact.

Component tests are out of scope for v1 (consistent with current trades UI).

## Rollout

1. Apply `008_trade_corrections.sql` in the Supabase Dashboard (add columns +
   re-create the two functions).
2. Ship actions + UI.
3. No backfill: existing rows default to `source='zerodha'`, `excluded=false`,
   `original=NULL`.

## Caveats / Future

- `corporate_actions` is global (no `user_id`); manual CA management is deferred,
  so this design introduces no new multi-tenant exposure.
- Fully-exited oversold positions (held = 0) are visible on the import page but
  not the dashboard (which shows only open positions). If users need to correct
  those post-import, a future "needs review" surface can reuse these same
  actions.
