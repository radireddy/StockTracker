# Adaptive Add-Company Form — Design

**Date:** 2026-07-02
**Branch:** `feat/switch-to-holding`
**Status:** Approved, ready for planning

## Problem

Adding a company through `/company/new` works acceptably for a Watchlist but is
confusing and incomplete for a Holdings portfolio:

1. **Destination is invisible.** The form title is a generic "Add New Company"
   with a subtitle that never names the actual portfolio. With multiple
   holdings/watchlists, the user can't tell where the company lands.
2. **The Holdings form is a dead end.** The data that *defines* a holding —
   account, quantity, average cost — is not captured. A gray note instead tells
   the user to import a statement or use the Holdings tab. So "Add Company" to a
   Holdings portfolio creates an empty research stub with **no position**.
3. **Field ambiguity.** The form shows "Buy Price (₹)", which is a research
   *target* price, not the actual average cost. On Holdings these get conflated.
   "Star Rating" is forced required even when the user only wants to log a
   position.
4. **Two mental models in one form.** Watchlist = research metadata. Holdings =
   a real position *plus* optional research. Today both render identically, with
   a disclaimer bolted on.
5. **Duplicated logic.** `holdings-tab.tsx` already implements the
   "select account or `+ New account…`" pattern with `createAccount` /
   `addHolding`. A redesign should share it, not reinvent it.

## The two independent datasets

Adding a company has two independent parts:

- **Research data** → `companies` row (rating, strategy, horizon, target buy
  price, thesis). All fields optional.
- **Position data** → `holdings` row (account + quantity + avg price). These
  three are an **atomic unit**; a holding row cannot exist without all three.

The existing data model already treats all four combinations as meaningful. The
`cleanup-unheld-companies.sql` script deletes Holdings companies that are
*unheld **and** unrated* — i.e. rated-but-unheld companies are intentionally
kept. And the import flow already produces position-without-research (bare stub
+ holding).

| | Research filled | Research empty |
|---|---|---|
| **Position filled** | analyzed + bought | bought, not yet researched (like import) |
| **Position empty**  | on watch-to-buy (rated, unheld) | stock-only → default-rated (★2), unheld |

Because star rating defaults to ★2, a stock-only add is a valid rated-unheld row
that the cleanup script keeps — so it is *not* hard-blocked.

## Chosen approach

**Adaptive single form** (kept at `/company/new`), made portfolio-aware and
branched by portfolio type. Chosen over a multi-step wizard (too many clicks for
a quick add) and a dashboard modal (can be layered on later if desired).

### A. Destination header (both types)

Top of the form shows **"Adding to: `<Portfolio name>`"** with a **type badge**
(Holdings / Watchlist) and an **inline dropdown** to switch the destination
portfolio. Reuses `portfolios` + `select(id)` from `usePortfolioContext`;
switching re-renders the form's branch. No new global state.

### B. Content branches by portfolio type

**Watchlist** — Stock (required) + Research fields (rating, strategy, horizon,
target buy price). Essentially today's form minus the holdings note. Submit →
existing `createCompany` (unchanged).

**Holdings** — three zones:

1. **Stock** (required).
2. **Position** card — shown expanded, *optional*: `AccountSelect`
   (existing account or `+ New account…` with inline name field), Quantity,
   Avg buy price. **All-or-nothing:** if any one of the three is filled, all
   three become required.
3. **Research** — collapsed `▸ Add research details (optional)`: rating,
   strategy, horizon, target buy price.

Submit → new `createCompanyWithHolding` action.

The "Buy Price (₹)" field is renamed **"Target Buy Price (₹)"** and moved into
Research (maps to `companies.buy_price`), disambiguating it from the position's
average cost.

**Hard requirement:** a stock must be selected. A stock-only add produces a
default-rated (★2), unheld company (a valid watch-to-buy row). Not hard-blocked.

### C. Shared `AccountSelect` component

`src/components/account/account-select.tsx` — extracted from the duplicated logic
in `holdings-tab.tsx`. Controlled component:

```
<AccountSelect
  accounts={accounts}
  value={accountId}            // "" | <account id> | "__new__"
  onChange={setAccountId}
  newLabel={newLabel}
  onNewLabelChange={setNewLabel}
/>
```

Renders existing accounts + a `+ New account…` option; when `__new__` is
selected, reveals the inline label input. `holdings-tab.tsx` is refactored to
consume it, removing the duplication.

### D. Server action `createCompanyWithHolding(formData)`

Lives in `holdings-actions.ts`. Single server-side flow so partial failures do
not orphan data:

1. `getAuthUser()`.
2. Validate via `companyWithHoldingSchema`.
3. **Dup-check** company by `(portfolio_id, isin)` → error
   "This stock is already in `<portfolio>`".
4. If `+New` account: `createAccount({ label, broker: 'manual' })`.
5. Insert `companies` row with research fields (defaults applied).
6. If a position is present: insert `holdings` row (`source: 'manual'`,
   `import_holding_id: null`) referencing the account + company.
7. `fetchStockPrice(isin)`, `revalidatePath('/')`, return company id.

The Watchlist path continues to call `createCompany`.

Ordering note: dup-check precedes account/company creation so a duplicate does
not orphan a freshly created account. If the holding insert fails after the
company is created, the company remains as a valid research-only row.

### E. Validation (`validations.ts`)

New `companyWithHoldingSchema` composing the research fields with an optional
position block, plus a Zod `.refine()`: *if any of {account_id / new_account_label,
quantity, avg_buy_price} is present, all of {account, quantity, avg_buy_price}
are required.* Reuses `isinSchema` / `uuidSchema`.

### F. Error handling

Inline toasts (sonner), matching `holdings-tab.tsx`:

- Incomplete position → "Enter account, quantity and avg price together".
- Duplicate stock → "This stock is already in `<portfolio>`".
- Duplicate new-account name → surfaced from `createAccount`'s unique-constraint
  message.

### G. Testing

Unit tests for `createCompanyWithHolding` following the mocked-Supabase pattern
in `holdings-import-engine.test.ts`:

- existing-account path,
- new-account creation,
- duplicate-company rejection,
- all-or-nothing position enforcement,
- research-only add (no holding row created).

**Note:** `@testing-library/react` is not installed (only `@testing-library/jest-dom`
matchers). Component-render tests would require adding that dependency; component
tests are out of scope unless that dep is added.

## Files touched

**New**
- `src/components/account/account-select.tsx`
- `createCompanyWithHolding` in `src/app/(authenticated)/actions/holdings-actions.ts`
- `companyWithHoldingSchema` in `src/lib/validations.ts`
- `src/__tests__/lib/create-company-with-holding.test.ts`

**Rewritten**
- `src/components/company/company-form.tsx`

**Refactored**
- `src/components/company/holdings-tab.tsx` (consume shared `AccountSelect`)
- `src/app/(authenticated)/company/new/page.tsx` (form reads portfolio context)

## Out of scope

- Dashboard modal quick-add (Option C) — can be layered on later.
- Multi-step wizard (Option B).
- Corporate actions, price history, or any change to the import flow.
