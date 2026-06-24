# Multiple Portfolios Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-portfolio support — users can create, manage, and switch between multiple portfolios (holdings + watchlists) with independent research, transaction tracking, and P&L computation.

**Architecture:** Pragmatic evolution of existing schema. Add columns to `portfolios` and `companies` tables, create new `transactions` table. Portfolio dropdown in header for switching. Dashboard adapts columns based on portfolio type. Move-stock deep copies research data between portfolios.

**Tech Stack:** Next.js 15 (App Router), Supabase PostgreSQL + RLS, React 19, shadcn/ui, Tailwind CSS v4, Server Actions

**Design Doc:** `docs/plans/2026-06-23-multiple-portfolios-design.md`

---

## Task 1: Database Migration — Modify `portfolios` Table

**Files:**
- Create: `supabase/migrations/008_multiple_portfolios.sql`

**Step 1: Write the migration**

```sql
-- Add portfolio type, ordering, and visual customization columns
ALTER TABLE portfolios
  ADD COLUMN type TEXT NOT NULL DEFAULT 'holdings'
    CHECK (type IN ('holdings', 'watchlist')),
  ADD COLUMN sort_order INTEGER DEFAULT 0,
  ADD COLUMN color TEXT,
  ADD COLUMN icon TEXT;

-- Ensure only one default portfolio per user (partial unique index)
CREATE UNIQUE INDEX idx_portfolios_user_default
  ON portfolios (user_id) WHERE is_default = true;
```

**Step 2: Apply the migration**

Run: `npx supabase db push` or apply via Supabase dashboard.

**Step 3: Commit**

```bash
git add supabase/migrations/008_multiple_portfolios.sql
git commit -m "feat: add type, sort_order, color, icon columns to portfolios table"
```

---

## Task 2: Database Migration — Modify `companies` Table

**Files:**
- Create: `supabase/migrations/009_company_holdings_fields.sql`

**Step 1: Write the migration**

```sql
-- Add holding-specific fields to companies (nullable — unused for watchlists)
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

**Step 2: Apply the migration**

Run: `npx supabase db push` or apply via Supabase dashboard.

**Step 3: Commit**

```bash
git add supabase/migrations/009_company_holdings_fields.sql
git commit -m "feat: add quantity, avg_buy_price, buy_date, notes to companies table"
```

---

## Task 3: Database Migration — Create `transactions` Table

**Files:**
- Create: `supabase/migrations/010_transactions.sql`

**Step 1: Write the migration**

```sql
-- Immutable transaction log for buy/sell activity
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  price NUMERIC NOT NULL CHECK (price >= 0),
  fees NUMERIC DEFAULT 0 CHECK (fees >= 0),
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_transactions_company_date ON transactions (company_id, date);
CREATE INDEX idx_transactions_user ON transactions (user_id);

-- RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own transactions"
  ON transactions FOR ALL
  USING (auth.uid() = user_id);

-- Reuse existing trigger function for updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**Step 2: Apply the migration**

Run: `npx supabase db push` or apply via Supabase dashboard.

**Step 3: Commit**

```bash
git add supabase/migrations/010_transactions.sql
git commit -m "feat: create transactions table with RLS and indexes"
```

---

## Task 4: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Update `Portfolio` type (line 18-26)**

Add the new fields after `is_default`:

```typescript
export type Portfolio = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  type: 'holdings' | 'watchlist';
  sort_order: number;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
};
```

**Step 2: Update `Company` type (line 46-62)**

Add holding fields after `highlights`:

```typescript
export type Company = {
  id: string;
  portfolio_id: string;
  user_id: string;
  isin: string;
  buy_price: number | null;
  star_rating: number;
  strategy: string | null;
  investment_horizon_years: number | null;
  expected_returns: number | null;
  thesis: string | null;
  highlights: string | null;
  quantity: number | null;
  avg_buy_price: number | null;
  buy_date: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  indian_stocks?: IndianStock;
};
```

**Step 3: Add `Transaction` type**

Add at end of file:

```typescript
export type Transaction = {
  id: string;
  company_id: string;
  user_id: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  fees: number;
  date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
```

**Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: update Portfolio, Company types and add Transaction type"
```

---

## Task 5: Expand Portfolio Server Actions

**Files:**
- Modify: `src/app/(authenticated)/actions/portfolio-actions.ts`

**Step 1: Rewrite `portfolio-actions.ts`**

Replace the entire file. The existing functions (`createPortfolio`, `getPortfolios`, `ensureDefaultPortfolio`) are expanded with new ones added:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import type { Portfolio } from "@/types/database";

const log = createLogger("portfolio-actions");

// --- READ ---

export async function getPortfolios(): Promise<
  (Portfolio & { company_count: number })[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("portfolios")
    .select("*, companies(count)")
    .eq("user_id", user.id)
    .order("sort_order")
    .order("created_at");

  if (error) {
    log.error("Failed to fetch portfolios", error);
    throw error;
  }

  return (data ?? []).map((p: any) => ({
    ...p,
    company_count: p.companies?.[0]?.count ?? 0,
  }));
}

export async function getPortfolio(id: string): Promise<Portfolio | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    log.error("Failed to fetch portfolio", error);
    return null;
  }
  return data;
}

export async function getDefaultPortfolioId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Try to find existing default
  const { data: existing } = await supabase
    .from("portfolios")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  if (existing) return existing.id;

  // No default — find any portfolio and make it default
  const { data: any_portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  if (any_portfolio) {
    await supabase
      .from("portfolios")
      .update({ is_default: true })
      .eq("id", any_portfolio.id);
    return any_portfolio.id;
  }

  // No portfolios at all — create default
  const { data: created, error } = await supabase
    .from("portfolios")
    .insert({
      user_id: user.id,
      name: "My Portfolio",
      type: "holdings",
      is_default: true,
      sort_order: 0,
    })
    .select("id")
    .single();

  if (error || !created) {
    log.error("Failed to create default portfolio", error);
    throw error ?? new Error("Failed to create default portfolio");
  }

  return created.id;
}

export async function getPortfolioDeletionSummary(id: string) {
  const supabase = await createClient();

  const [companies, transactions] = await Promise.all([
    supabase
      .from("companies")
      .select("id", { count: "exact" })
      .eq("portfolio_id", id),
    supabase
      .from("transactions")
      .select("id", { count: "exact" })
      .in(
        "company_id",
        (
          await supabase
            .from("companies")
            .select("id")
            .eq("portfolio_id", id)
        ).data?.map((c: any) => c.id) ?? []
      ),
  ]);

  return {
    companies: companies.count ?? 0,
    transactions: transactions.count ?? 0,
  };
}

// --- WRITE ---

export async function createPortfolio(data: {
  name: string;
  type: "holdings" | "watchlist";
  description?: string;
  color?: string;
  icon?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check plan limits
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan_limits")
    .eq("id", user.id)
    .single();

  const maxPortfolios = profile?.plan_limits?.max_portfolios ?? 5;

  const { count } = await supabase
    .from("portfolios")
    .select("id", { count: "exact" })
    .eq("user_id", user.id);

  if ((count ?? 0) >= maxPortfolios) {
    throw new Error(
      `Portfolio limit reached (${maxPortfolios}). Upgrade your plan for more.`
    );
  }

  // Get next sort_order
  const { data: last } = await supabase
    .from("portfolios")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextSort = (last?.sort_order ?? -1) + 1;

  // If first portfolio, make it default
  const isFirst = (count ?? 0) === 0;

  const { error } = await supabase.from("portfolios").insert({
    user_id: user.id,
    name: data.name,
    type: data.type,
    description: data.description ?? null,
    color: data.color ?? null,
    icon: data.icon ?? null,
    is_default: isFirst,
    sort_order: nextSort,
  });

  if (error) {
    log.error("Failed to create portfolio", error);
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/settings");
}

export async function updatePortfolio(
  id: string,
  data: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("portfolios")
    .update(data)
    .eq("id", id);

  if (error) {
    log.error("Failed to update portfolio", error);
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/settings");
}

export async function setDefaultPortfolio(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Unset current default
  await supabase
    .from("portfolios")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("is_default", true);

  // Set new default
  const { error } = await supabase
    .from("portfolios")
    .update({ is_default: true })
    .eq("id", id);

  if (error) {
    log.error("Failed to set default portfolio", error);
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/settings");
}

export async function deletePortfolio(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check: can't delete default
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("is_default")
    .eq("id", id)
    .single();

  if (portfolio?.is_default) {
    throw new Error("Cannot delete the default portfolio. Set another as default first.");
  }

  // Check: can't delete last portfolio
  const { count } = await supabase
    .from("portfolios")
    .select("id", { count: "exact" })
    .eq("user_id", user.id);

  if ((count ?? 0) <= 1) {
    throw new Error("Cannot delete your only portfolio.");
  }

  // CASCADE delete (companies + children + transactions)
  const { error } = await supabase
    .from("portfolios")
    .delete()
    .eq("id", id);

  if (error) {
    log.error("Failed to delete portfolio", error);
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/settings");
}

export async function reorderPortfolios(orderedIds: string[]) {
  const supabase = await createClient();

  const updates = orderedIds.map((id, index) =>
    supabase.from("portfolios").update({ sort_order: index }).eq("id", id)
  );

  await Promise.all(updates);
  revalidatePath("/");
  revalidatePath("/settings");
}
```

**Step 2: Verify the app still builds**

Run: `npm run build`
Expected: No type errors related to portfolio actions.

**Step 3: Commit**

```bash
git add src/app/(authenticated)/actions/portfolio-actions.ts
git commit -m "feat: expand portfolio server actions with full CRUD, default management, plan limits"
```

---

## Task 6: Create Transaction Server Actions

**Files:**
- Create: `src/app/(authenticated)/actions/transaction-actions.ts`

**Step 1: Create the file**

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import type { Transaction } from "@/types/database";

const log = createLogger("transaction-actions");

export async function getTransactions(
  companyId: string
): Promise<Transaction[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("company_id", companyId)
    .order("date")
    .order("created_at");

  if (error) {
    log.error("Failed to fetch transactions", error);
    throw error;
  }

  return data ?? [];
}

export async function addTransaction(
  companyId: string,
  input: {
    type: "BUY" | "SELL";
    quantity: number;
    price: number;
    fees?: number;
    date: string;
    notes?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("transactions").insert({
    company_id: companyId,
    user_id: user.id,
    type: input.type,
    quantity: input.quantity,
    price: input.price,
    fees: input.fees ?? 0,
    date: input.date,
    notes: input.notes ?? null,
  });

  if (error) {
    log.error("Failed to add transaction", error);
    throw error;
  }

  await recomputeHoldings(companyId);
  revalidatePath("/");
}

export async function updateTransaction(
  id: string,
  data: {
    type?: "BUY" | "SELL";
    quantity?: number;
    price?: number;
    fees?: number;
    date?: string;
    notes?: string;
  }
) {
  const supabase = await createClient();

  // Get company_id before update for recomputation
  const { data: txn } = await supabase
    .from("transactions")
    .select("company_id")
    .eq("id", id)
    .single();

  if (!txn) throw new Error("Transaction not found");

  const { error } = await supabase
    .from("transactions")
    .update(data)
    .eq("id", id);

  if (error) {
    log.error("Failed to update transaction", error);
    throw error;
  }

  await recomputeHoldings(txn.company_id);
  revalidatePath("/");
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient();

  // Get company_id before delete for recomputation
  const { data: txn } = await supabase
    .from("transactions")
    .select("company_id")
    .eq("id", id)
    .single();

  if (!txn) throw new Error("Transaction not found");

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id);

  if (error) {
    log.error("Failed to delete transaction", error);
    throw error;
  }

  await recomputeHoldings(txn.company_id);
  revalidatePath("/");
}

export async function recomputeHoldings(companyId: string) {
  const supabase = await createClient();

  const { data: transactions } = await supabase
    .from("transactions")
    .select("type, quantity, price")
    .eq("company_id", companyId)
    .order("date");

  if (!transactions || transactions.length === 0) {
    // No transactions — clear holding fields
    await supabase
      .from("companies")
      .update({ quantity: null, avg_buy_price: null, buy_date: null })
      .eq("id", companyId);
    return;
  }

  let totalQty = 0;
  let totalCost = 0;

  for (const txn of transactions) {
    if (txn.type === "BUY") {
      totalCost += txn.quantity * txn.price;
      totalQty += txn.quantity;
    } else {
      // SELL — reduce quantity, keep avg cost unchanged
      totalQty -= txn.quantity;
    }
  }

  const avgPrice = totalQty > 0 ? totalCost / totalQty : null;

  // Get earliest BUY date
  const { data: firstBuy } = await supabase
    .from("transactions")
    .select("date")
    .eq("company_id", companyId)
    .eq("type", "BUY")
    .order("date")
    .limit(1)
    .single();

  await supabase
    .from("companies")
    .update({
      quantity: totalQty > 0 ? totalQty : null,
      avg_buy_price: avgPrice,
      buy_date: firstBuy?.date ?? null,
    })
    .eq("id", companyId);
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/(authenticated)/actions/transaction-actions.ts
git commit -m "feat: add transaction server actions with auto holdings recomputation"
```

---

## Task 7: Create P&L Server Actions

**Files:**
- Create: `src/app/(authenticated)/actions/pnl-actions.ts`

**Step 1: Create the file**

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("pnl-actions");

export type PortfolioPnL = {
  total_invested: number;
  total_current: number;
  total_pnl: number;
  total_pnl_pct: number;
};

export type CompanyPnL = {
  invested: number;
  current: number;
  pnl: number;
  pnl_pct: number;
};

export async function getPortfolioPnL(
  portfolioId: string
): Promise<PortfolioPnL> {
  const supabase = await createClient();

  const { data: companies, error } = await supabase
    .from("companies")
    .select("quantity, avg_buy_price, isin, indian_stocks(price)")
    .eq("portfolio_id", portfolioId)
    .not("quantity", "is", null)
    .not("avg_buy_price", "is", null);

  if (error) {
    log.error("Failed to compute portfolio P&L", error);
    throw error;
  }

  let totalInvested = 0;
  let totalCurrent = 0;

  for (const c of companies ?? []) {
    const qty = c.quantity ?? 0;
    const avgPrice = c.avg_buy_price ?? 0;
    const currentPrice = (c.indian_stocks as any)?.price ?? 0;

    totalInvested += avgPrice * qty;
    totalCurrent += currentPrice * qty;
  }

  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct =
    totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return {
    total_invested: totalInvested,
    total_current: totalCurrent,
    total_pnl: totalPnl,
    total_pnl_pct: totalPnlPct,
  };
}

export async function getCompanyPnL(companyId: string): Promise<CompanyPnL> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("companies")
    .select("quantity, avg_buy_price, indian_stocks(price)")
    .eq("id", companyId)
    .single();

  if (error || !data) {
    log.error("Failed to compute company P&L", error);
    throw error ?? new Error("Company not found");
  }

  const qty = data.quantity ?? 0;
  const avgPrice = data.avg_buy_price ?? 0;
  const currentPrice = (data.indian_stocks as any)?.price ?? 0;

  const invested = avgPrice * qty;
  const current = currentPrice * qty;
  const pnl = current - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

  return { invested, current, pnl, pnl_pct: pnlPct };
}
```

**Step 2: Commit**

```bash
git add src/app/(authenticated)/actions/pnl-actions.ts
git commit -m "feat: add P&L computation server actions for portfolio and company level"
```

---

## Task 8: Update `company-actions.ts` — Portfolio-Aware Queries

**Files:**
- Modify: `src/app/(authenticated)/actions/company-actions.ts`

**Step 1: Make `portfolioId` required in `getCompanies` (line 21)**

Change signature from `async (portfolioId?: string)` to `async (portfolioId: string)`. Remove the optional filter conditional — always filter by portfolio:

```typescript
export async function getCompanies(portfolioId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "*, indian_stocks(*), projection_models(*, valuation_scenarios(*))"
    )
    .eq("portfolio_id", portfolioId)
    .order("created_at");

  if (error) {
    log.error("Failed to fetch companies", error);
    throw error;
  }
  return data ?? [];
}
```

**Step 2: Add `moveCompany` function**

Add at end of file:

```typescript
export async function moveCompany(
  companyId: string,
  targetPortfolioId: string,
  additionalData?: {
    quantity?: number;
    avg_buy_price?: number;
    buy_date?: string;
    notes?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // 1. Fetch source company
  const { data: source, error: fetchError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (fetchError || !source) throw new Error("Company not found");

  // 2. Get target portfolio type
  const { data: targetPortfolio } = await supabase
    .from("portfolios")
    .select("type")
    .eq("id", targetPortfolioId)
    .single();

  if (!targetPortfolio) throw new Error("Target portfolio not found");

  // 3. Check for duplicate in target portfolio
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("portfolio_id", targetPortfolioId)
    .eq("isin", source.isin)
    .maybeSingle();

  if (existing) {
    throw new Error("This stock already exists in the target portfolio.");
  }

  // 4. Insert new company in target (copy common fields)
  const isWatchlist = targetPortfolio.type === "watchlist";

  const { data: newCompany, error: insertError } = await supabase
    .from("companies")
    .insert({
      portfolio_id: targetPortfolioId,
      user_id: user.id,
      isin: source.isin,
      buy_price: source.buy_price,
      star_rating: source.star_rating,
      strategy: source.strategy,
      investment_horizon_years: source.investment_horizon_years,
      expected_returns: source.expected_returns,
      thesis: source.thesis,
      highlights: source.highlights,
      // Holding fields: only for holdings-type target
      quantity: isWatchlist ? null : (additionalData?.quantity ?? null),
      avg_buy_price: isWatchlist
        ? null
        : (additionalData?.avg_buy_price ?? null),
      buy_date: isWatchlist ? null : (additionalData?.buy_date ?? null),
      notes: additionalData?.notes ?? null,
    })
    .select("id")
    .single();

  if (insertError || !newCompany) {
    log.error("Failed to insert company in target portfolio", insertError);
    throw insertError ?? new Error("Failed to move company");
  }

  // 5. Copy child records: financial_years, valuation_scenarios, timeline_entries, etc.
  // First get projection_models to copy
  const { data: sourceModels } = await supabase
    .from("projection_models")
    .select("*, financial_years(*), valuation_scenarios(*)")
    .eq("company_id", companyId);

  for (const model of sourceModels ?? []) {
    const { data: newModel } = await supabase
      .from("projection_models")
      .insert({
        company_id: newCompany.id,
        user_id: user.id,
        projection_type: model.projection_type,
        name: model.name,
        is_default: model.is_default,
        sort_order: model.sort_order,
      })
      .select("id")
      .single();

    if (!newModel) continue;

    // Copy financial years
    if (model.financial_years?.length) {
      await supabase.from("financial_years").insert(
        model.financial_years.map((fy: any) => ({
          company_id: newCompany.id,
          projection_model_id: newModel.id,
          user_id: user.id,
          year: fy.year,
          is_estimate: fy.is_estimate,
          revenue: fy.revenue,
          revenue_growth_pct: fy.revenue_growth_pct,
          ebitda: fy.ebitda,
          ebitda_margin_pct: fy.ebitda_margin_pct,
          ebitda_growth_pct: fy.ebitda_growth_pct,
          depreciation: fy.depreciation,
          finance_cost: fy.finance_cost,
          other_income: fy.other_income,
          exceptional_items: fy.exceptional_items,
          pbt: fy.pbt,
          tax_pct: fy.tax_pct,
          pat: fy.pat,
          pat_growth_pct: fy.pat_growth_pct,
          pat_margin_pct: fy.pat_margin_pct,
          minority_interest: fy.minority_interest,
          pat_for_shareholders: fy.pat_for_shareholders,
          pe: fy.pe,
          peg: fy.peg,
          net_debt: fy.net_debt,
          lease_liability: fy.lease_liability,
          total_debt: fy.total_debt,
          ev_ebitda_ratio: fy.ev_ebitda_ratio,
          sort_order: fy.sort_order,
        }))
      );
    }

    // Copy valuation scenarios
    if (model.valuation_scenarios?.length) {
      await supabase.from("valuation_scenarios").insert(
        model.valuation_scenarios.map((vs: any) => ({
          company_id: newCompany.id,
          projection_model_id: newModel.id,
          user_id: user.id,
          scenario_type: vs.scenario_type,
          target_pe: vs.target_pe,
          target_market_cap: vs.target_market_cap,
          irr: vs.irr,
          buying_market_cap: vs.buying_market_cap,
          buy_price: vs.buy_price,
          target_ev_ebitda_ratio: vs.target_ev_ebitda_ratio,
          expected_ev: vs.expected_ev,
          net_debt_terminal: vs.net_debt_terminal,
        }))
      );
    }
  }

  // Copy timeline entries
  const { data: timelineEntries } = await supabase
    .from("timeline_entries")
    .select("*")
    .eq("company_id", companyId);

  if (timelineEntries?.length) {
    await supabase.from("timeline_entries").insert(
      timelineEntries.map((te: any) => ({
        company_id: newCompany.id,
        user_id: user.id,
        quarter: te.quarter,
        entry_date: te.entry_date,
        content: te.content,
        sort_order: te.sort_order,
      }))
    );
  }

  // Copy segment valuations
  const { data: segments } = await supabase
    .from("segment_valuations")
    .select("*")
    .eq("company_id", companyId);

  if (segments?.length) {
    await supabase.from("segment_valuations").insert(
      segments.map((s: any) => ({
        company_id: newCompany.id,
        user_id: user.id,
        segment_name: s.segment_name,
        management_signal: s.management_signal,
        metrics: s.metrics,
        multiple: s.multiple,
        estimated_value: s.estimated_value,
        sort_order: s.sort_order,
      }))
    );
  }

  // Copy market perceptions
  const { data: perceptions } = await supabase
    .from("market_perceptions")
    .select("*")
    .eq("company_id", companyId);

  if (perceptions?.length) {
    await supabase.from("market_perceptions").insert(
      perceptions.map((mp: any) => ({
        company_id: newCompany.id,
        user_id: user.id,
        perception: mp.perception,
        own_view: mp.own_view,
        sort_order: mp.sort_order,
      }))
    );
  }

  // 6. Delete source company (CASCADE handles children + transactions)
  await supabase.from("companies").delete().eq("id", companyId);

  revalidatePath("/");
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: No errors (dashboard page may need fixing — that's Task 10).

**Step 4: Commit**

```bash
git add src/app/(authenticated)/actions/company-actions.ts
git commit -m "feat: make getCompanies portfolio-aware, add moveCompany with deep copy"
```

---

## Task 9: Portfolio Context — localStorage Hook

**Files:**
- Create: `src/hooks/use-selected-portfolio.ts`

**Step 1: Create the hook**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "stocktracker_selected_portfolio";

export function useSelectedPortfolio(defaultPortfolioId: string) {
  const [selectedId, setSelectedId] = useState<string>(defaultPortfolioId);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSelectedId(stored);
    } else {
      setSelectedId(defaultPortfolioId);
    }
  }, [defaultPortfolioId]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSelectedId(defaultPortfolioId);
  }, [defaultPortfolioId]);

  return { selectedId, select, clear };
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-selected-portfolio.ts
git commit -m "feat: add useSelectedPortfolio hook with localStorage persistence"
```

---

## Task 10: Portfolio Dropdown Component

**Files:**
- Create: `src/components/portfolio/portfolio-dropdown.tsx`
- Create: `src/components/portfolio/create-portfolio-dialog.tsx`

**Step 1: Create the portfolio dropdown**

```typescript
"use client";

import { useState } from "react";
import { Check, ChevronDown, Eye, Plus, Settings, Star } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Portfolio } from "@/types/database";
import { CreatePortfolioDialog } from "./create-portfolio-dialog";

type PortfolioWithCount = Portfolio & { company_count: number };

export function PortfolioDropdown({
  portfolios,
  selectedId,
  onSelect,
}: {
  portfolios: PortfolioWithCount[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const selected = portfolios.find((p) => p.id === selectedId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            {selected?.color && (
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: selected.color }}
              />
            )}
            <span className="max-w-[180px] truncate">
              {selected?.name ?? "Select Portfolio"}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px]">
          {portfolios.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex items-center gap-2"
            >
              {p.color && (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
              )}
              <span className="truncate flex-1">{p.name}</span>
              {p.type === "watchlist" && (
                <Eye className="h-3.5 w-3.5 opacity-50 shrink-0" />
              )}
              {p.is_default && (
                <Star className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
              )}
              {p.id === selectedId && (
                <Check className="h-4 w-4 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Portfolio
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/settings">
              <Settings className="h-4 w-4 mr-2" />
              Manage Portfolios
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreatePortfolioDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  );
}
```

**Step 2: Create the create-portfolio dialog**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createPortfolio } from "@/app/(authenticated)/actions/portfolio-actions";

const COLORS = [
  "#22c55e", "#3b82f6", "#eab308", "#f97316",
  "#ef4444", "#a855f7", "#6b7280", "#14b8a6",
];

export function CreatePortfolioDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"holdings" | "watchlist">("holdings");
  const [color, setColor] = useState(COLORS[0]);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) return;
    setPending(true);
    setError(null);

    try {
      await createPortfolio({
        name: name.trim(),
        type,
        color,
        description: description.trim() || undefined,
      });
      onOpenChange(false);
      setName("");
      setDescription("");
      setType("holdings");
      setColor(COLORS[0]);
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Failed to create portfolio");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Portfolio</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Core Holdings"
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as "holdings" | "watchlist")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="holdings" id="type-holdings" />
                <Label htmlFor="type-holdings">Holdings</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="watchlist" id="type-watchlist" />
                <Label htmlFor="type-watchlist">Watchlist</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-7 w-7 rounded-full border-2 transition-all ${
                    color === c
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Description (optional)</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !name.trim()}
          >
            {pending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/portfolio/
git commit -m "feat: add portfolio dropdown and create portfolio dialog components"
```

---

## Task 11: Update App Header with Portfolio Dropdown

**Files:**
- Modify: `src/components/layout/app-header.tsx`
- Modify: `src/app/(authenticated)/layout.tsx`

**Step 1: Update `app-header.tsx`**

The header needs to accept portfolios, selected ID, and onSelect callback. Read the current file first, then modify to add the portfolio dropdown between logo and nav links.

Key changes:
- Add props: `portfolios`, `selectedPortfolioId`, `onSelect`
- Import and render `PortfolioDropdown` component after the logo
- Pass through the portfolio state

**Step 2: Update `layout.tsx`**

The layout needs to:
- Call `getPortfolios()` and `getDefaultPortfolioId()` server-side
- Pass portfolios to a new client wrapper that manages selected state
- The client wrapper renders `AppHeader` + children with selected portfolio context

Create a new client component `src/components/layout/authenticated-shell.tsx` that:
- Receives `portfolios`, `defaultPortfolioId`, `profile`, `children`
- Uses `useSelectedPortfolio` hook
- Validates selected portfolio still exists (falls back to default)
- Renders `AppHeader` with dropdown + `LivePricesProvider` + children
- Provides selected portfolio ID to children via React context or URL param

**Step 3: Create portfolio context**

Create `src/hooks/use-portfolio-context.tsx`:

```typescript
"use client";

import { createContext, useContext } from "react";
import type { Portfolio } from "@/types/database";

type PortfolioContextValue = {
  selectedId: string;
  select: (id: string) => void;
  portfolios: (Portfolio & { company_count: number })[];
  selectedPortfolio: (Portfolio & { company_count: number }) | undefined;
};

export const PortfolioContext = createContext<PortfolioContextValue | null>(
  null
);

export function usePortfolioContext() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolioContext must be within provider");
  return ctx;
}
```

**Step 4: Commit**

```bash
git add src/components/layout/ src/hooks/use-portfolio-context.tsx
git commit -m "feat: integrate portfolio dropdown into app header with context provider"
```

---

## Task 12: Update Dashboard Page — Portfolio-Filtered View

**Files:**
- Modify: `src/app/(authenticated)/page.tsx`
- Modify: `src/components/dashboard/companies-table.tsx`

**Step 1: Update dashboard page**

The dashboard currently fetches all companies. Change it to:
- Accept portfolio ID from search params or context
- Fetch companies filtered by portfolio
- Fetch portfolio details to determine type (holdings vs watchlist)
- Pass portfolio type to `CompaniesTable`
- Show P&L summary bar for holdings-type portfolios

**Step 2: Update `CompaniesTable`**

Add a `portfolioType` prop. Conditionally show/hide columns:
- `holdings`: Show Qty, Avg Buy, P&L, P&L% columns
- `watchlist`: Show Buy Zone, MoS%, Buy Signal columns (current behavior)

Add row action buttons: "Move to..." which opens the move dialog.

**Step 3: Create P&L summary bar component**

Create `src/components/dashboard/portfolio-pnl-bar.tsx`:
- Shows: Invested, Current Value, P&L amount, P&L %
- Color-coded: green for profit, red for loss
- Only rendered for holdings-type portfolios

**Step 4: Commit**

```bash
git add src/app/(authenticated)/page.tsx src/components/dashboard/
git commit -m "feat: filter dashboard by selected portfolio, adapt columns by type, add P&L bar"
```

---

## Task 13: Move Stock Dialog

**Files:**
- Create: `src/components/portfolio/move-stock-dialog.tsx`

**Step 1: Create the dialog**

The dialog:
- Receives `companyId`, `companyName`, `currentPortfolioId`, `portfolios`
- Shows target portfolio dropdown (excludes current)
- Shows summary of what carries over vs what's removed
- Adapts additional fields based on target type
- Calls `moveCompany` server action on confirm

**Step 2: Integrate into `CompaniesTable`**

Add "Move to..." button in each row's action menu. On click, open the move dialog.

**Step 3: Commit**

```bash
git add src/components/portfolio/move-stock-dialog.tsx src/components/dashboard/companies-table.tsx
git commit -m "feat: add move stock dialog with deep copy and portfolio-aware fields"
```

---

## Task 14: Update Settings Page — Portfolio Management

**Files:**
- Modify: `src/app/(authenticated)/settings/page.tsx`
- Create: `src/components/settings/portfolio-manager.tsx`

**Step 1: Create `PortfolioManager` client component**

Features:
- Lists all portfolios with drag-to-reorder (use `@dnd-kit/sortable` or simple move up/down buttons)
- Per-portfolio: color dot, name, type badge, stock count, default star
- Actions: Rename (inline edit), Color picker, Set Default, Delete
- Delete: calls `getPortfolioDeletionSummary()` then shows confirmation dialog with counts
- Validation: can't delete default, can't delete last

**Step 2: Update settings page**

Replace the read-only portfolio list with the interactive `PortfolioManager` component.

**Step 3: Commit**

```bash
git add src/app/(authenticated)/settings/page.tsx src/components/settings/portfolio-manager.tsx
git commit -m "feat: add interactive portfolio management in settings with reorder, rename, delete"
```

---

## Task 15: Update Company Creation Flow

**Files:**
- Modify: `src/app/(authenticated)/company/new/page.tsx`
- Modify: `src/components/company/company-form.tsx`

**Step 1: Update `new/page.tsx`**

Change from `ensureDefaultPortfolio()` to accepting portfolio ID from search params:
- URL: `/company/new?portfolio=<id>`
- If no param, use default portfolio
- Fetch portfolio to determine type

**Step 2: Update `CompanyForm`**

- Accept `portfolioType` prop in addition to `portfolioId`
- For `holdings` type: show optional "First Transaction" section below stock search (date, quantity, price, fees)
- For `watchlist` type: no transaction fields
- On submit: create company, then optionally create first transaction via `addTransaction`

**Step 3: Commit**

```bash
git add src/app/(authenticated)/company/new/ src/components/company/company-form.tsx
git commit -m "feat: portfolio-aware company creation with optional first transaction"
```

---

## Task 16: Transactions Tab in Company Detail

**Files:**
- Create: `src/components/company/transactions-tab.tsx`
- Create: `src/components/company/add-transaction-dialog.tsx`
- Modify: `src/components/company/company-tabs.tsx` (line 12-18)
- Modify: `src/components/company/company-page-client.tsx` (line 8-18)
- Modify: `src/app/(authenticated)/company/[id]/page.tsx`

**Step 1: Create `TransactionsTab` component**

Features:
- Fetches transactions for company via `getTransactions(companyId)`
- Displays table: Date, Type (BUY/SELL badge), Qty, Price, Fees, Notes
- Summary row: Total qty, weighted avg, total fees
- P&L summary using `getCompanyPnL(companyId)`
- "Add Transaction" button opens dialog

**Step 2: Create `AddTransactionDialog`**

Form fields: Type (BUY/SELL toggle), Quantity, Price, Fees (optional), Date, Notes (optional).
Calls `addTransaction()` on submit.

**Step 3: Update `company-tabs.tsx`**

Add "Transactions" tab to the TABS array (line 12-18). Only include it when portfolio type is `holdings`.

**Step 4: Update `company-page-client.tsx`**

Pass portfolio type as prop. Conditionally render `TransactionsTab`.

**Step 5: Update company detail page**

Fetch the portfolio type for the company's portfolio. Pass to `CompanyPageClient`.

**Step 6: Commit**

```bash
git add src/components/company/ src/app/(authenticated)/company/
git commit -m "feat: add transactions tab with CRUD and P&L display in company detail"
```

---

## Task 17: Update Add Stock Button on Dashboard

**Files:**
- Modify: `src/app/(authenticated)/page.tsx`

**Step 1: Update "Add Stock" link**

Change the "Add Stock" link/button to include the currently selected portfolio ID:
- From: `/company/new`
- To: `/company/new?portfolio=<selectedPortfolioId>`

This ensures new stocks are added to the currently viewed portfolio.

**Step 2: Commit**

```bash
git add src/app/(authenticated)/page.tsx
git commit -m "feat: pass selected portfolio ID to add stock flow"
```

---

## Task 18: Update Import Flow for Portfolio Awareness

**Files:**
- Modify: `src/app/(authenticated)/import/page.tsx` (if exists)
- Modify: `src/app/api/import/route.ts`

**Step 1: Update import page**

Add portfolio selector to the import page. User chooses which portfolio to import into.

**Step 2: Update import API route**

Accept `portfolioId` in the request body. Ensure imported companies are created in the specified portfolio.

**Step 3: Commit**

```bash
git add src/app/(authenticated)/import/ src/app/api/import/
git commit -m "feat: make import flow portfolio-aware"
```

---

## Task 19: End-to-End Testing & Polish

**Step 1: Manual test checklist**

- [ ] Create a new holdings portfolio
- [ ] Create a new watchlist portfolio
- [ ] Switch between portfolios via dropdown
- [ ] Add stock to holdings portfolio — see transaction fields
- [ ] Add stock to watchlist — no transaction fields
- [ ] Add transaction to existing stock
- [ ] Verify P&L computes correctly at stock and portfolio level
- [ ] Move stock from watchlist to holdings — verify research carries over
- [ ] Move stock from holdings to watchlist — verify transactions removed
- [ ] Rename portfolio in settings
- [ ] Change portfolio color
- [ ] Set a different default portfolio
- [ ] Delete a non-default portfolio — verify cascade
- [ ] Try to delete default — verify rejection
- [ ] Try to delete last portfolio — verify rejection
- [ ] Verify localStorage remembers selected portfolio across page reloads
- [ ] Verify dashboard shows correct columns per portfolio type
- [ ] Verify price auto-refresh still works

**Step 2: Fix any issues found**

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: polish multi-portfolio feature after E2E testing"
```

---

## Summary

| Task | Description | Dependencies |
|------|-------------|--------------|
| 1 | Migration: portfolios columns | None |
| 2 | Migration: companies columns | None |
| 3 | Migration: transactions table | None |
| 4 | Update TypeScript types | Tasks 1-3 |
| 5 | Portfolio server actions | Task 4 |
| 6 | Transaction server actions | Task 4 |
| 7 | P&L server actions | Task 4 |
| 8 | Update company-actions (portfolio-aware + moveCompany) | Tasks 4-5 |
| 9 | useSelectedPortfolio hook | None |
| 10 | Portfolio dropdown + create dialog | Task 5 |
| 11 | Update header + layout + context | Tasks 9-10 |
| 12 | Update dashboard (filtered, adaptive columns, P&L bar) | Tasks 5, 7, 8, 11 |
| 13 | Move stock dialog | Tasks 8, 10 |
| 14 | Settings portfolio management | Task 5 |
| 15 | Update company creation flow | Tasks 5, 6 |
| 16 | Transactions tab in company detail | Tasks 6, 7 |
| 17 | Update add stock button | Task 11 |
| 18 | Update import flow | Task 5 |
| 19 | E2E testing & polish | All |
