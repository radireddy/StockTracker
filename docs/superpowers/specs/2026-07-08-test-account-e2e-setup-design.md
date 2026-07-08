# Test Account & E2E Infrastructure Design

**Date:** 2026-07-08  
**Status:** Approved

---

## Context

The app currently has no e2e test infrastructure and no test account. All real data lives under `adireddyravindra@gmail.com`. Tests must run against realistic data (portfolios, holdings, financials) without touching production data or exposing real PII (broker account IDs, PAN, mobile).

The app uses Google OAuth as the only public-facing auth method. Email+password auth is enabled in Supabase but invisible to regular users (no email login UI). This is the hook we use for test authentication.

---

## Part 1: Data Migration Script

**File:** `scripts/create-test-account.ts`  
**Run:** Once. Not re-runnable (one-time setup).

**Test user:** `e2e-test@stocktracker.local` — already exists in Supabase Auth. Do not create a new user.

### What it does

1. Looks up source user UUID via admin client (`SOURCE_USER_EMAIL`)
2. Looks up existing test user UUID by email `e2e-test@stocktracker.local`
3. Sets a stable password on the test user: `adminClient.auth.admin.updateUserById(testUserId, { password: TEST_USER_PASSWORD })`
4. Copies all user-scoped data in FK-safe order, generating new UUIDs for each row and maintaining an old→new ID map for foreign key resolution
5. Scrubs PII during copy

### Copy order (FK dependency chain)

```
portfolios
  → companies (portfolio_id remapped)
    → projection_models (company_id remapped)
      → financial_years (company_id + projection_model_id remapped)
      → valuation_scenarios (company_id + projection_model_id remapped)
      → timeline_entries (company_id remapped)
      → segment_valuations (company_id remapped)
      → market_perceptions (company_id remapped)
accounts
  → holdings (portfolio_id + account_id + company_id remapped)
```

`import_holdings` is skipped — it's statement import metadata, not needed for tests.

### PII scrubbing

| Field | Replaced with |
|---|---|
| `profiles.display_name` | `"Test User"` |
| `profiles.avatar_url` | `null` |
| `accounts.label` | `"Test Demat Account"` |
| `accounts.client_id` | `"ZT000000"` |
| `accounts.pan_number` | `"XXXXX0000X"` |
| `accounts.mobile` | `"0000000000"` |

`profiles.email` is handled automatically (Supabase sets it from `TEST_USER_EMAIL`).

### Env vars required

```
SOURCE_USER_EMAIL=adireddyravindra@gmail.com
TEST_USER_EMAIL=e2e-test@stocktracker.local
TEST_USER_PASSWORD=<strong random password — never committed>
NEXT_PUBLIC_SUPABASE_URL=<same as .env.local>
SUPABASE_SERVICE_ROLE_KEY=<same as .env.local>
```

Store in `.env.test` (gitignored).

---

## Part 2: Auth Bypass — Email+Password in Playwright globalSetup

No app code changes required. The email provider is already enabled in Supabase; the app UI just doesn't expose it.

### Flow

```
globalSetup.ts (runs once before all Playwright tests)
  ↓
supabase.auth.signInWithPassword({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })
  ↓ returns session tokens
Set sb-* cookies manually on Playwright browser context
  ↓
page.context().storageState() saved to .playwright/auth-state.json  ← gitignored
```

All tests reference `storageState: '.playwright/auth-state.json'` in `playwright.config.ts`. They start already authenticated.

### Security properties

- No app code changed — bypass is purely in test infrastructure
- Password stored in `.env.test` (gitignored), never committed
- `.playwright/auth-state.json` is gitignored
- Regular users cannot use this path — no email login UI exists
- Test user has no Google OAuth identity linked — cannot be hijacked via Google

---

## Part 3: Playwright Config + Smoke Tests

### New files

```
playwright.config.ts
tests/global-setup.ts
tests/global-teardown.ts          (optional cleanup)
tests/smoke/auth.spec.ts
tests/smoke/dashboard.spec.ts
tests/smoke/company.spec.ts
tests/smoke/holdings.spec.ts
```

### `playwright.config.ts`

- `baseURL`: `http://localhost:3000`
- Browser: Chromium only
- `globalSetup`: `tests/global-setup.ts`
- `use.storageState`: `.playwright/auth-state.json`
- `webServer`: starts `next dev` if not already running

### Smoke test coverage

| Test file | What it verifies |
|---|---|
| `auth.spec.ts` | Unauthenticated request to `/dashboard` redirects to `/login` |
| `dashboard.spec.ts` | `/dashboard` loads, portfolio name visible, allocation chart renders |
| `company.spec.ts` | `/company/[id]` loads with company name, financials tab accessible |
| `holdings.spec.ts` | Holdings tab shows at least one stock row |

All smoke tests are **read-only** — no mutations.

### Gitignore additions

```
.playwright/
.env.test
```

---

## Verification

1. Run `npx tsx scripts/create-test-account.ts` — confirm test user appears in Supabase Auth dashboard
2. Run `npx playwright test --headed` — confirm globalSetup signs in, dashboard loads
3. Run `npx playwright test` — all smoke tests green
4. Confirm `.playwright/auth-state.json` is not tracked by git
