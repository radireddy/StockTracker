# Atomic Holdings Import + Replace Confirmation — Design

**Date:** 2026-07-03
**Status:** Approved

## Problem

The holdings import engine (`src/lib/import/holdings-import-engine.ts:108-151`) replaces an
account's holdings with a **non-transactional delete-then-insert**:

1. `DELETE` all `holdings` for `(portfolio_id, account_id)`.
2. Bulk `INSERT`/`upsert` the fresh position rows.

Two ways this permanently loses data:

- **Insert fails after delete** → all holdings for the account are gone, no rollback.
- **Every row gets skipped** (companies couldn't be created, so `rows.length === 0`) → the
  delete already ran, nothing is inserted, and the import is merely marked `"failed"`. This is
  the "statement not imported completely → existing holdings lost" case.

Additionally, a reimport silently discards the account's previous statement **and any manual
edits**, with no warning or confirmation to the user.

## Goals

1. Existing holdings for an account are **never** lost when a new import fails or is incomplete.
2. Before an import runs, the user is **warned** that re-importing replaces the account's existing
   holdings (including manual edits) and must **confirm**.

## Non-Goals

- Preflight/dry-run detection of the exact target account and counts (chosen against: blanket
  confirm is sufficient for now).
- Making the additive stock/company creation steps transactional (they are non-destructive).

---

## Part A — Atomic replace via Postgres RPC transaction

### New migration: `supabase/migrations/003_replace_holdings_rpc.sql`

A `SECURITY INVOKER` plpgsql function. Invoker (not definer) so the existing holdings RLS policy
(`FOR ALL USING (auth.uid() = user_id)`) still enforces per-user isolation — the caller can only
delete/insert their own rows, and INSERT's `WITH CHECK` defaults to the `USING` expression.

```sql
create or replace function replace_account_holdings(
  p_portfolio_id uuid,
  p_account_id  uuid,
  p_rows        jsonb
) returns void
language plpgsql
security invoker
as $$
begin
  delete from holdings
   where portfolio_id = p_portfolio_id
     and account_id  = p_account_id;

  if p_rows is not null and jsonb_array_length(p_rows) > 0 then
    insert into holdings (
      user_id, portfolio_id, account_id, company_id, isin,
      quantity, avg_buy_price, sector, source, import_holding_id
    )
    select
      (r->>'user_id')::uuid,
      (r->>'portfolio_id')::uuid,
      (r->>'account_id')::uuid,
      (r->>'company_id')::uuid,
      r->>'isin',
      (r->>'quantity')::numeric,
      (r->>'avg_buy_price')::numeric,
      nullif(r->>'sector', ''),
      r->>'source',
      (r->>'import_holding_id')::uuid
    from jsonb_array_elements(p_rows) as r;
  end if;
end;
$$;

grant execute on function replace_account_holdings(uuid, uuid, jsonb) to authenticated;
```

The entire function body executes in **one implicit transaction**. If the insert fails, the
preceding delete rolls back — insert-fails-after-delete can no longer lose data.

> **Manual step:** the project is not CLI-linked to Supabase (migrations are applied by hand via
> the Dashboard SQL editor). This migration must be run in the Dashboard before the new engine
> code works against the live database.

### Engine change: `holdings-import-engine.ts`

Steps 1 (ensure stocks) and 2 (ensure companies) are unchanged — they are additive/non-destructive.

Replace the current step 3 + 4 (`.delete()` then `.upsert()`) with:

- Build `rows` exactly as today (filter to holdings whose company exists, collecting
  `symbolsImported` / `symbolsSkipped`).
- **Guard — the core fix:** if `rows.length === 0`, do **not** call the RPC. The account's
  existing holdings are left untouched; the import result is `status: "failed"` (nothing could be
  imported). This preserves existing data on an incomplete import.
- Otherwise, call `userSupabase.rpc("replace_account_holdings", { p_portfolio_id, p_account_id, p_rows: rows })`.
  On `error`, `throw` (the transaction rolled back, so existing holdings survive) — the API route's
  existing catch marks the `import_holdings` row `failed`.

Because the delete runs first *inside* the transaction, the insert no longer needs `onConflict`
handling.

---

## Part B — Blanket replace confirmation

In `src/app/(authenticated)/import/page.tsx`, gate the import behind a confirmation dialog using the
existing `src/components/ui/alert-dialog.tsx`.

- Add `confirmOpen` state.
- The main **Import** button opens the dialog instead of calling `handleImport()` directly.
- Dialog copy:
  > **Import holdings?**
  > Re-importing an account **replaces** its existing holdings, including any manual edits you've
  > made for that account. This can't be undone.
  >
  > **[Cancel]** **[Replace & import]** (destructive-styled action)
- Confirm → close dialog, run the existing `handleImport()`.
- Cancel → close dialog, no-op.

No API/flow change — this is a client-side guard only.

---

## Testing (TDD)

Update `src/__tests__/lib/import/holdings-import-engine.test.ts` first (red), then implement:

- Add an `rpc` method to the mock client (`makeClient`) that captures its args and resolves
  `{ error }`. `captured.insertedHoldings` is now sourced from the `p_rows` argument rather than the
  `upsert` call.
- Replace the two separate failure tests ("clearing previous holdings fails", "inserting the fresh
  snapshot fails") with one: **"atomic replace fails → throws; existing holdings untouched"** —
  asserts the RPC was invoked and the call rejects.
- Add: **"skips the destructive replace when no rows would be inserted"** — when all holdings are
  skipped (e.g. company creation failed), assert `rpc` was **not** called and `status === "failed"`.
- Existing happy-path assertions carry over, reading the inserted rows from the captured RPC args.

## Files touched

- `supabase/migrations/003_replace_holdings_rpc.sql` (new)
- `src/lib/import/holdings-import-engine.ts`
- `src/app/(authenticated)/import/page.tsx`
- `src/__tests__/lib/import/holdings-import-engine.test.ts`
