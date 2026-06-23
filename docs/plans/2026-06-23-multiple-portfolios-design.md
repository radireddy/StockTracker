# Multiple Portfolios — Design Document

## Overview

Evolve StockTracker from a single-portfolio app to a full multi-portfolio system. Users can create and manage multiple portfolios (holdings, watchlists) with independent research, holdings tracking, P&L computation, and stock movement between portfolios.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Transaction model | Hybrid — transaction log for holdings, simple for watchlists |
| Portfolio types | Single `portfolios` table with `type` field (`holdings`, `watchlist`) |
| Research data | Per-portfolio-holding — each portfolio entry has independent thesis/model |
| Move stock | Transfer — duplicate common data to target, ask for target-specific data, delete source |
| Price refresh | Existing auto-refresh — stale check during market hours, shared `indian_stocks` |
| Navigation | Dropdown selector in header |
| Default view | Default portfolio — user sets which one is default |
| All portfolios view | No — one portfolio at a time |
| Portfolio CRUD | Quick actions in dropdown + full management in settings |
| Portfolio deletion | Cascade delete with confirmation dialog |

## Architecture: Pragmatic Evolution (Approach C)

Build on the existing schema with additive changes only. No breaking migrations.

```
indian_stocks (shared, no RLS write for users)
  - isin (PK), name, nse_symbol, bse_code
  - price, change, change_pct, volume, market_cap
  - last_updated

profiles
  - id (= auth.uid()), plan, plan_limits
  - plan_limits.max_portfolios (enforced server-side)

portfolios (MODIFIED)
  - id, user_id, name, description
  - type ('holdings' | 'watchlist')        [NEW]
  - is_default                             [EXISTS, enforce unique per user]
  - sort_order                             [NEW]
  - color                                  [NEW]
  - icon                                   [NEW]
  - 1:N -> companies

companies (MODIFIED — serves as "portfolio entry": holding + research)
  - id, portfolio_id (FK), user_id, isin (FK -> indian_stocks)
  - Holding fields [NEW]: quantity, avg_buy_price, buy_date, notes, sort_order
  - Research fields [EXISTING]: thesis, highlights, star_rating, strategy, ...
  - 1:N -> financial_years
  - 1:N -> valuation_scenarios
  - 1:N -> timeline_entries
  - 1:N -> transactions [NEW]
  - 1:N -> segment_valuations
  - 1:N -> market_perceptions

transactions [NEW TABLE]
  - id, company_id (FK), user_id
  - type ('BUY' | 'SELL')
  - quantity, price, fees, date, notes
  - created_at, updated_at
```

### Constraints

- `UNIQUE(portfolio_id, isin)` on companies — same stock can't appear twice in same portfolio
- `UNIQUE(user_id) WHERE is_default = true` on portfolios — only one default per user
- RLS on all tables: `auth.uid() = user_id`
- Index on `transactions(company_id, date)` for chronological queries

## Database Schema Changes

### Migration: Modify `portfolios`

```sql
ALTER TABLE portfolios
  ADD COLUMN type TEXT NOT NULL DEFAULT 'holdings'
    CHECK (type IN ('holdings', 'watchlist')),
  ADD COLUMN sort_order INTEGER DEFAULT 0,
  ADD COLUMN color TEXT,
  ADD COLUMN icon TEXT;

-- Ensure only one default portfolio per user
CREATE UNIQUE INDEX idx_portfolios_user_default
  ON portfolios (user_id) WHERE is_default = true;
```

### Migration: Modify `companies`

```sql
ALTER TABLE companies
  ADD COLUMN quantity NUMERIC,
  ADD COLUMN avg_buy_price NUMERIC,
  ADD COLUMN buy_date DATE,
  ADD COLUMN notes TEXT,
  ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Prevent duplicate stock in same portfolio
CREATE UNIQUE INDEX idx_companies_portfolio_isin
  ON companies (portfolio_id, isin);
```

### Migration: Create `transactions`

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  fees NUMERIC DEFAULT 0,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transactions_company_date ON transactions (company_id, date);
CREATE INDEX idx_transactions_user ON transactions (user_id);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own transactions"
  ON transactions FOR ALL
  USING (auth.uid() = user_id);

-- Auto-update updated_at trigger (reuse existing trigger function)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

## Backend Implementation

### Server Actions

#### `portfolio-actions.ts` (expand existing)

```
createPortfolio(name, type, description?, color?, icon?)
  - Validate plan_limits.max_portfolios
  - Insert with next sort_order
  - If first portfolio, set is_default = true

updatePortfolio(id, { name?, description?, type?, color?, icon?, is_default? })
  - If setting is_default = true, unset previous default in same transaction

deletePortfolio(id)
  - Reject if is_default (must reassign first)
  - Reject if only portfolio
  - CASCADE deletes companies + all children + transactions
  - Revalidate paths

setDefaultPortfolio(id)
  - Unset current default, set new default in transaction

getPortfolios()
  - Return all with stock counts, for dropdown

getPortfolioDeletionSummary(id)
  - Return counts: stocks, transactions, financial models, etc.

reorderPortfolios(orderedIds[])
  - Batch update sort_order
```

#### `company-actions.ts` (modify existing)

```
getCompanies(portfolioId)
  - NOW REQUIRED parameter (no more "all portfolios" query)
  - Join indian_stocks for live prices
  - Include computed P&L for holdings-type portfolios

createCompany(portfolioId, data)
  - Check unique constraint (portfolio_id, isin)
  - Strip holding fields if portfolio type is watchlist

moveCompany(companyId, targetPortfolioId, additionalData?)
  - Deep copy in a database transaction:
    1. Insert new company in target portfolio (common fields)
    2. Copy financial_years -> new company_id
    3. Copy valuation_scenarios -> new company_id
    4. Copy timeline_entries -> new company_id
    5. Copy segment_valuations -> new company_id
    6. Copy market_perceptions -> new company_id
    7. If target is holdings and additionalData has transactions, insert those
    8. If target is watchlist, skip quantity/price fields
    9. Delete source company (CASCADE handles children)
  - Revalidate both portfolio paths
```

#### `transaction-actions.ts` (new)

```
addTransaction(companyId, { type, quantity, price, fees, date, notes })
  - Insert transaction
  - Recompute holdings on company (quantity, avg_buy_price)

getTransactions(companyId)
  - Chronological list

updateTransaction(id, data)
  - Update + recompute holdings

deleteTransaction(id)
  - Delete + recompute holdings

recomputeHoldings(companyId)
  - Query all transactions for company
  - quantity = SUM(BUY qty) - SUM(SELL qty)
  - avg_buy_price = weighted average of BUY transactions
  - Update company row
```

#### `pnl-actions.ts` (new)

```
getPortfolioPnL(portfolioId)
  - For each company in portfolio (holdings type only):
    - invested = avg_buy_price * quantity
    - current = indian_stocks.price * quantity
    - pnl = current - invested
  - Aggregate: total_invested, total_current, total_pnl, total_pnl_pct

getCompanyPnL(companyId)
  - Same as above for single company
  - Include per-transaction lot details
```

### Validation Rules

| Rule | Enforcement |
|------|-------------|
| Max portfolios per plan | Check `profiles.plan_limits.max_portfolios` in `createPortfolio` |
| Unique stock per portfolio | DB unique constraint on `(portfolio_id, isin)` |
| Can't delete default portfolio | Server action rejects; must set another as default first |
| Can't delete last portfolio | Server action rejects |
| Holdings fields ignored for watchlists | Server action strips quantity/price if portfolio type is `watchlist` |
| At least one portfolio | Prevent deletion of last portfolio |

### Import Support (Extensible)

The `transactions` table supports broker import:

```
importFromCSV(portfolioId, file):
  1. Parse CSV (Zerodha tradebook / Groww format)
  2. Match symbols to indian_stocks via isin/nse_symbol
  3. For each trade: find or create company in portfolio, insert transaction
  4. Recompute holdings for all affected companies
  5. Return summary (imported count, skipped, errors)
```

New broker formats = new CSV parser. No schema changes needed.

## UI Implementation

### Portfolio Dropdown (Header — `app-header.tsx`)

- Dropdown in header showing all portfolios with color dots
- Indicates type (watchlist icon) and default (star icon)
- Quick-create "New Portfolio" at bottom
- "Manage Portfolios" link to /settings
- Selection persisted in localStorage
- Falls back to default portfolio on first visit

### Dashboard Adaptations

**Holdings-type portfolios:**
- Portfolio-level P&L summary bar: Invested, Current Value, P&L, P&L%
- Table columns: Star, Name, Qty, Avg Buy, Current Price, P&L, P&L%, Base IRR
- Row actions: Move to another portfolio, Delete

**Watchlist-type portfolios:**
- No P&L summary bar
- Table columns: Star, Name, Current Price, Buy Zone, MoS%, Buy Signal, Base IRR
- No Qty, Avg Buy, P&L columns
- Focus on "when to buy"

### Move Stock Dialog

- Target portfolio dropdown
- Shows what carries over (thesis, financials, valuations, timeline)
- Shows what will be removed (transactions, holdings data)
- Adapts additional fields based on target portfolio type
- If target is holdings: optionally ask for buy details
- If target is watchlist: strip holding data

### Portfolio Management (Settings Page)

- List all portfolios with drag-to-reorder
- Per-portfolio actions: Rename, Color, Set Default, Delete
- Delete shows cascade summary before confirmation
- Can't delete default (must reassign first)
- Can't delete last portfolio
- Create Portfolio button at bottom

### Create Portfolio Dialog

- Fields: Name, Type (Holdings/Watchlist radio), Color picker, Description
- Accessible from both dropdown and settings page

### Add Stock Flow (Modified)

- Stock is added to the portfolio currently being viewed
- Stock search unchanged (searches `indian_stocks`)
- For holdings type: optionally add first transaction (buy date, qty, price)
- For watchlist type: just add the stock, no transaction fields

### Company Detail Page (Modified)

- New "Transactions" tab (only for holdings-type portfolios)
- Shows chronological transaction list with type, qty, price, fees, date
- Summary row: total quantity, weighted avg price, total fees
- P&L summary: Invested, Current Value, P&L, P&L%
- Add/edit/delete transaction actions
- Auto-recomputes holdings on changes

## P&L Computation (App Layer)

| Metric | Formula | Computed In |
|--------|---------|-------------|
| Unrealized P&L (stock) | `(current_price - avg_buy_price) * quantity` | Server Component |
| Unrealized P&L % | `(current_price - avg_buy_price) / avg_buy_price * 100` | Server Component |
| Portfolio P&L | `SUM(unrealized P&L)` across all companies | Server Component |
| Invested Value | `SUM(avg_buy_price * quantity)` | Server Component |
| Current Value | `SUM(current_price * quantity)` | Server Component |

## Migration Path

1. Run schema migrations (add columns to portfolios, companies; create transactions table)
2. Existing portfolios get `type = 'holdings'`, `is_default = true`
3. Existing companies get `quantity = null`, `avg_buy_price = null` (no transactions yet)
4. All existing server actions updated to require `portfolioId`
5. Dashboard updated to show portfolio dropdown and filter by selected portfolio
6. New portfolio CRUD UI in settings
7. New transaction management in company detail
8. Move stock functionality

## Future Extensions (Not in This Phase)

- Portfolio XIRR & per-stock XIRR
- Sector allocation pie chart
- Benchmark comparison (vs Nifty 50)
- Portfolio performance curve (daily value chart)
- Dividend income tracking
- Tax-lot tracking (FIFO for Indian LTCG/STCG)
- Target allocation & rebalancing
- Broker API integration (Kite Connect)
- Portfolio sharing (read-only public links)
- Portfolio daily snapshots for historical performance
