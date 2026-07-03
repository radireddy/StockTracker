# Move-to-Holdings Account Selection — Design

**Date:** 2026-07-02
**Branch:** feat/switch-to-holding
**Status:** Approved (pending spec review)

## Problem

When a company is moved from a watchlist into a holdings portfolio, it shows up
in holdings but belongs to **no account** — because the account↔company link
only exists through a `holdings` row, and a watchlist company has none. The move
must prompt the user to select an account so the company genuinely belongs to
one. Conversely, moving a company **out** of holdings (to a watchlist) must
remove the account↔company link.

## Context / current state

- The account↔company link lives **only** in a `holdings` row. There is no
  account column on `companies`.
- The DB already allows zero positions: `holdings.quantity CHECK (>= 0)` and
  `holdings.avg_buy_price CHECK (>= 0)`. **No migration is needed.**
- The *Add company* form already implements the target pattern (committed as
  `1e27355`): account mandatory, quantity/avg price optional, creating a
  zero-qty holdings row via `createCompanyWithHolding` +
  `companyWithHoldingSchema`. This work brings the *Move* dialog to parity.
- `moveCompany` (`src/app/(authenticated)/actions/company-actions.ts`) already
  carries existing holdings to the target company, and already **deletes**
  holdings when the target is a watchlist (the move-out unlink).
- Shared UI: `AccountSelect` + `NEW_ACCOUNT` sentinel
  (`src/components/account/account-select.tsx`), already used by the add form.
- The move dialog (`src/components/portfolio/move-stock-dialog.tsx`) currently
  collects only a target portfolio.

## Design

### 1. `MoveStockDialog` (UI)

- When the selected **target** portfolio is `type === 'holdings'` AND the
  **current** portfolio is a watchlist, reveal a **Position** section:
  - `AccountSelect` (existing accounts + `+ New account…`) — **required**.
  - Optional **Quantity** and **Avg Buy Price** inputs — same layout and inline
    validation as `company-form.tsx` (qty must be positive if given; avg price
    non-negative if given).
- The dialog resolves whether to show the section from `portfolios` +
  `currentPortfolioId` (current type) and the selected target's type — no new
  props threaded through the table.
- Accounts are loaded via the existing `getAccounts` server action when the
  dialog opens (self-contained; does not depend on the watchlist dashboard
  payload including accounts).
- The **Move** button is disabled until a target is chosen and, when the
  Position section is shown, an account is chosen.

### 2. `moveCompany` (server action)

Add an optional `position` argument:

```ts
position?: {
  account_id?: string;
  new_account_label?: string;
  quantity?: number;
  avg_buy_price?: number;
}
```

Behavior:

- Existing holdings still carry over to the new company with their own accounts
  (unchanged).
- **If the moved company ends up with zero holdings and the target is
  holdings:** resolve/create the account (reusing the account-resolution logic
  from `createCompanyWithHolding` — create a `broker: 'manual'` account when
  `new_account_label` is given) and insert one `holdings` row with
  `quantity: quantity ?? 0`, `avg_buy_price: avg_buy_price ?? 0`,
  `source: 'manual'`.
- **Guard:** target is holdings + no carried holdings + no account supplied →
  throw `"Select an account to move this stock into holdings."`
- **Move-out (holdings → watchlist):** keep the existing behavior that deletes
  holdings for the company (the account↔company unlink). Locked in by a test.

### 3. Validation

Extract a `moveToHoldingsSchema` (or reuse the account+position slice of
`companyWithHoldingSchema`) so the server validates the position the same way
the add form does: account required (existing id or new label); quantity
positive-if-present; avg price non-negative-if-present.

## Testing

- watchlist→holdings with account only → creates a zero-qty holdings row under
  the chosen account.
- watchlist→holdings with account + qty + price → creates a holding with those
  values.
- watchlist→holdings with **no** account → rejected with the guard message.
- holdings→watchlist → holdings deleted (account unlinked).
- holdings→holdings with existing positions → positions carry over unchanged;
  no account prompt required.

## Decisions

- **Zero-position link representation:** a zero-qty `holdings` row (DB already
  permits it). No new column on `companies`.
- **Account mandatory, qty/price optional** on move into holdings — mirrors the
  add-company form.
- **Holdings→holdings with existing positions:** do **not** prompt for an
  account; positions carry over with their own accounts.

## Known minor gap

A research-only stock already sitting in a *holdings* portfolio, moved to
*another* holdings portfolio, has no position to carry and (per the
current-portfolio-type heuristic) won't show the inline picker — it is instead
caught by the server guard with the clear error message. Acceptable for this
rare case; can be upgraded later to an inline picker by passing per-company
holdings presence into the dialog.

## Out of scope

- Corporate actions (removed from the codebase).
- Reworking the add-company form (already done).
- Any DB migration.
