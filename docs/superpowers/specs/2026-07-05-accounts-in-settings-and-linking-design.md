# Accounts in Settings + Reliable Account Linking — Design

**Date:** 2026-07-05
**Status:** Approved, pending implementation plan
**Branch:** `feat/app-theme-dark-mode` (accounts work will branch from here / main as appropriate)

## Problem

Account management is currently scattered and account auto-detection is brittle:

1. **Scattered UI** — the full `AccountsManager` CRUD list lives on the **Import** page. Inline "+ New account…" creation is also offered in three other places: the **new company** form (`company-form.tsx`), the company detail **Holdings tab** (`holdings-tab.tsx`), and the **Move stock** dialog (`move-stock-dialog.tsx`).

2. **Duplicate accounts on import** — import auto-detects the target account by an exact match on `(broker, client_id)` read from the statement. A manually-created account is stored with `broker='manual'`, `client_id=null`, so it can **never** match a real Zerodha statement. A user who created "My Zerodha" by hand and then imports the `AB1234` statement ends up with a **second, duplicate** account (`AB1234 (Zerodha)`), because the importer sees no match and silently creates a new one.

## Goals

- One home for account management: a card under **Settings**.
- A manual account can be given a broker identity so import recognises it.
- No silent duplicate accounts: import surfaces unmatched statements and lets the user link them to an existing account.
- Account creation happens **only** in Settings. Everywhere else, users select an existing account (or are pointed to Settings).

## Non-Goals

- No merging of two already-separate accounts (holdings migration between accounts). If a duplicate already exists, the user resolves it manually (delete/rename). This design *prevents* new duplicates rather than merging old ones.
- No schema migration. Existing columns (`accounts.broker`, `accounts.client_id`, the partial-unique index) and existing RPC signatures are reused as-is.

## Existing constraints (relied upon)

- `accounts` columns: `label`, `broker`, `client_id` (nullable), `pan_number`, `mobile`.
- Partial unique index `idx_accounts_user_broker_client ON accounts (user_id, broker, client_id) WHERE client_id IS NOT NULL`.
- `accountSchema` (`src/lib/validations.ts`) already validates `broker`, `client_id`, `pan_number`, `mobile`.
- `POST /api/import` already accepts an `explicitAccountId` and resolves it before writing.
- Import writes are atomic per account via `replace_account_holdings` RPC.

---

## Part 1 — Move account management to Settings

**Files:** `src/app/(authenticated)/settings/page.tsx`, `src/app/(authenticated)/import/page.tsx`, `src/components/account/accounts-manager.tsx`

- Add an **Accounts** card to the Settings page, after Portfolios, mounting `<AccountsManager />`. On change it should revalidate as needed (Settings is a server component; `AccountsManager` self-fetches, so no prop wiring beyond an optional `onChanged` is required).
- Remove the `<AccountsManager />` mount and its import from the Import page. The Import page keeps only: portfolio selector, file upload, review/commit flow (Part 4), and Import History.
- Extend `AccountsManager`'s **create** and **edit** forms with optional **Broker** and **Client ID** fields (plus keep label). This lets a user attach the broker identity that makes import auto-match work (Part 2). PAN / mobile remain out of scope for the form for now (not needed for matching).

## Part 2 — Editable broker + client ID

**Files:** `src/app/(authenticated)/actions/account-actions.ts`, `src/components/account/accounts-manager.tsx`

- Extend `updateAccount` to accept `broker?` and `client_id?` in addition to `label`/`pan_number`/`mobile`. Trim; empty `client_id` → `null`; empty `broker` → keep `'manual'`.
- On a `23505` conflict against the `(user_id, broker, client_id)` index, return an `AppError` with a clear message: e.g. *"Another account already uses that Client ID for this broker. Client IDs must be unique per broker."*
- `createAccount` already accepts these fields; ensure the Settings create form passes them.

**Result:** a user can set "My Zerodha" → broker `zerodha`, client ID `AB1234` in Settings, and the next import auto-matches on `(broker, client_id)` exactly as today.

## Part 3 — Remove inline account creation everywhere

**Files:** `src/components/account/account-select.tsx`, `src/components/company/company-form.tsx`, `src/components/company/holdings-tab.tsx`, `src/components/portfolio/move-stock-dialog.tsx`, `src/app/(authenticated)/actions/holdings-actions.ts`, `src/app/(authenticated)/actions/company-actions.ts`

- `AccountSelect` becomes **select-only**:
  - Remove the `NEW_ACCOUNT` option and the inline label `<Input>`.
  - Remove the `newLabel` / `onNewLabelChange` props.
  - When `accounts.length === 0`, render an empty state instead of a disabled dropdown: a short message with a link to Settings — *"No accounts yet. Add one in Settings."* (`<Link href="/settings">`).
  - Export of `NEW_ACCOUNT` is removed; update all importers.
- **`company-form.tsx`**: remove `newAccountLabel` state, `NEW_ACCOUNT` branch, and the `new_account_label` form field. Account remains required for holdings companies — validation just checks a real account id is selected. If no accounts exist, the empty state guides the user to Settings and submission is blocked with a clear message.
- **`holdings-tab.tsx`**: remove the inline `createAccount` path and `NEW_ACCOUNT` handling in the "Add to account" flow; select-only.
- **`move-stock-dialog.tsx`**: remove `NEW_ACCOUNT` handling and `new_account_label`; select-only (consistency call, confirmed).
- **Server tolerance:** `holdings-actions.ts` and `company-actions.ts` (which forwards `p_new_account_label` to the `move_company` RPC) keep their parameters but will now always receive `null`/absent. No DB migration; the RPC param becomes dead but harmless. Client code stops populating `new_account_label`.

## Part 4 — Import-time pre-flight detect + link

**Files:** new `src/app/api/import/detect/route.ts` (or a `?dryRun` branch of the existing route — implementer's choice, prefer a separate route for clarity), `src/app/(authenticated)/import/page.tsx`, `src/app/api/import/route.ts`

### Detect endpoint

`POST /api/import/detect` — accepts the same file(s) + `broker`, parses each **without writing**, returns per file:

```
{
  file_name: string,
  broker: string,
  client_id: string | null,
  statement_date: string | null,
  stock_count: number,
  matched_account: { id: string, label: string } | null,   // exact (broker, client_id) match
  parse_error: string | null                                 // e.g. wrong sheet, > 100 stocks
}
```

- Matching uses the same `(broker, client_id)` lookup the commit path uses.
- Returns the caller's existing accounts too (or the client fetches them separately) so the "link to existing" dropdown can be populated.

### Import page review phase

New phase sequence: `select → review → importing → done`.

1. **select** — choose portfolio + file(s), click **Continue** (was "Import…").
2. **review** — call detect; render one row per file:
   - **Matched**: "→ will update **{matched_account.label}**" (reimport/replace semantics unchanged; the existing "replace" warning still applies here).
   - **Unmatched, has client_id**: radio group —
     - ⦿ **Create new account** — default; label defaults to `{client_id} ({broker displayName})`, editable.
     - ○ **Link to existing account** — dropdown of the user's accounts. Choosing this will backfill that account's `broker`+`client_id`.
   - **No client_id**: must pick an existing account from a dropdown (cannot create/auto-detect). Blocks commit until chosen.
   - **parse_error**: show the error; that file is excluded from commit.
   - Keep the existing "replace can't be undone" confirmation before commit (can fold into the review screen's commit button).
3. **importing / done** — unchanged result rendering.

### Commit changes (`POST /api/import`)

The route already resolves `explicitAccountId`. Extend per-file commit to carry the review decision:

- **Link to existing** → pass `explicitAccountId`. After resolving the account, if its `client_id` is `null`, **backfill** `broker` + `client_id` from the parsed statement (so future imports auto-match). Only backfill when `client_id` is null — never overwrite a different existing client_id (guard against mis-linking). Handle the `(broker, client_id)` unique conflict gracefully (surface a clear error, do not crash the import).
- **Create new** → today's path (create `{client_id} ({displayName})`), optionally with a user-edited label passed through.
- **Matched** → today's path (reuse matched account).

Parsing happens twice (detect, then commit) since files are re-uploaded; acceptable.

---

## Data flow summary

```
Settings → AccountsManager (create/edit broker+client_id)  ─┐
                                                            ├─→ accounts (broker, client_id)
Import → detect (parse-only) → review (link/create) ────────┘        │
        → commit → resolve/backfill account → replace_account_holdings
Company new / Holdings tab / Move stock → AccountSelect (select-only) ─→ existing accounts
```

## Error handling

- Follows the project convention: mutations (`createAccount`, `updateAccount`) return `ActionResult` with `toastError`/`describeDbError`; reads throw.
- `23505` on account create/update/backfill → friendly, actionable message.
- Detect parse errors are per-file and non-fatal to the batch.
- Import commit remains atomic per account; backfill failure surfaces as a clear error without losing holdings.

## Testing

- **Unit** (`src/__tests__/`):
  - `updateAccount` accepts/normalises broker+client_id; 23505 mapped to friendly error.
  - Detect logic: matched vs unmatched vs no-client_id classification.
  - Backfill-on-link: null client_id gets set; non-null is not overwritten.
- **Component/behavioural** where feasible:
  - `AccountSelect` renders empty state with Settings link when no accounts; no `+ New account…` option.
  - Import review classifies rows and blocks commit for no-client_id/unresolved rows.
- Update existing tests that reference `NEW_ACCOUNT` / inline creation.

## Rollout / consistency notes

- No DB migration required.
- `new_account_label` becomes dead on the server; a later cleanup migration can drop the RPC param, out of scope here.
- Existing duplicate accounts (if any) are not auto-merged; users delete/rename manually.
