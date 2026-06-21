# Stock Autocomplete & Schema Normalization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace free-text company entry with autocomplete from a master `indian_stocks` table seeded from NSE/BSE data; normalize `companies` to remove duplicate stock metadata; merge `stock_prices` into `indian_stocks`.

**Architecture:** New `indian_stocks` master table (seeded from CSV) holds stock metadata + live prices. `companies` references it via `isin` FK. All stock name/symbol/sector/price lookups go through `indian_stocks`. Autocomplete uses server-side search with trigram index.

**Tech Stack:** Next.js 15 (App Router), Supabase (PostgreSQL + RLS), shadcn/ui Command (cmdk), TypeScript

---

### Task 1: Download and prepare NSE/BSE CSV data

**Files:**
- Create: `supabase/seed/raw/EQUITY_L.csv` (NSE)
- Create: `supabase/seed/raw/BSE_LIST.csv` (BSE)

**Step 1: Download NSE equity list**

Download the NSE equity list from `https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv`.
Save to `supabase/seed/raw/EQUITY_L.csv`.

If the direct download is blocked, manually download from NSE website: Market Data > Securities Available for Trading > Download CSV.

**Step 2: Download BSE listed securities**

Download BSE listed securities from BSE India website.
Save to `supabase/seed/raw/BSE_LIST.csv`.

If blocked, manually download from BSE website: Listed Companies > Download.

**Step 3: Commit raw CSVs**

```bash
git add supabase/seed/raw/
git commit -m "chore: add raw NSE/BSE listing CSVs"
```

---

### Task 2: Build CSV merge script

**Files:**
- Create: `scripts/merge-stock-lists.ts`
- Create: `supabase/seed/indian_stocks.csv`

**Step 1: Create the merge script**

```typescript
// scripts/merge-stock-lists.ts
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

interface NseRow {
  SYMBOL: string;
  "NAME OF COMPANY": string;
  " SERIES": string; // note leading space in NSE CSV
  " ISIN NUMBER": string;
  " FACE VALUE"?: string;
}

interface BseRow {
  "Security Code": string;
  "Security Id": string;
  "Security Name": string;
  "ISIN No": string;
  Industry?: string;
  "Sector Name"?: string;
}

interface MergedStock {
  isin: string;
  name: string;
  nse_symbol: string;
  bse_code: string;
  sector: string;
  industry: string;
  series: string;
  exchange: string;
}

const nseRaw = readFileSync("supabase/seed/raw/EQUITY_L.csv", "utf-8");
const nseRows: NseRow[] = parse(nseRaw, { columns: true, skip_empty_lines: true, trim: true });

// BSE CSV may have different encodings/delimiters — adjust if needed
const bseRaw = readFileSync("supabase/seed/raw/BSE_LIST.csv", "utf-8");
const bseRows: BseRow[] = parse(bseRaw, { columns: true, skip_empty_lines: true, trim: true });

const stockMap = new Map<string, MergedStock>();

// Process NSE first
for (const row of nseRows) {
  const isin = (row[" ISIN NUMBER"] || row["ISIN NUMBER"] || "").trim();
  if (!isin || !isin.startsWith("INE")) continue;

  const symbol = (row.SYMBOL || "").trim();
  const name = (row["NAME OF COMPANY"] || "").trim();
  const series = (row[" SERIES"] || row["SERIES"] || "").trim();

  // Only include EQ series (regular equity)
  if (series !== "EQ") continue;

  stockMap.set(isin, {
    isin,
    name,
    nse_symbol: symbol,
    bse_code: "",
    sector: "",
    industry: "",
    series,
    exchange: "NSE",
  });
}

// Process BSE and merge
for (const row of bseRows) {
  const isin = (row["ISIN No"] || "").trim();
  if (!isin || !isin.startsWith("INE")) continue;

  const bseCode = (row["Security Code"] || "").trim();
  const name = (row["Security Name"] || "").trim();
  const sector = (row["Sector Name"] || "").trim();
  const industry = (row["Industry"] || "").trim();

  const existing = stockMap.get(isin);
  if (existing) {
    // Dual-listed
    existing.bse_code = bseCode;
    existing.exchange = "BOTH";
    // Use BSE sector/industry if available (NSE CSV doesn't have it)
    if (sector) existing.sector = sector;
    if (industry) existing.industry = industry;
  } else {
    // BSE only
    stockMap.set(isin, {
      isin,
      name,
      nse_symbol: "",
      bse_code: bseCode,
      sector,
      industry,
      series: "",
      exchange: "BSE",
    });
  }
}

const merged = Array.from(stockMap.values()).sort((a, b) => a.name.localeCompare(b.name));

const csv = stringify(merged, {
  header: true,
  columns: ["isin", "name", "nse_symbol", "bse_code", "sector", "industry", "series", "exchange"],
});

mkdirSync("supabase/seed", { recursive: true });
writeFileSync("supabase/seed/indian_stocks.csv", csv);

console.log(`Merged ${merged.length} stocks (NSE-only: ${merged.filter(s => s.exchange === "NSE").length}, BSE-only: ${merged.filter(s => s.exchange === "BSE").length}, Both: ${merged.filter(s => s.exchange === "BOTH").length})`);
```

**Step 2: Install csv dependencies**

```bash
npm install csv-parse csv-stringify
npm install -D tsx
```

**Step 3: Run the merge script**

```bash
npx tsx scripts/merge-stock-lists.ts
```

Expected: prints merge stats, creates `supabase/seed/indian_stocks.csv`

**Step 4: Verify output**

Check `supabase/seed/indian_stocks.csv` has reasonable data (should be ~5000+ rows).

**Step 5: Commit**

```bash
git add scripts/merge-stock-lists.ts supabase/seed/indian_stocks.csv package.json package-lock.json
git commit -m "feat: merge NSE/BSE stock lists into unified CSV"
```

---

### Task 3: Create `indian_stocks` migration and seed

**Files:**
- Create: `supabase/migrations/004_indian_stocks.sql`

**Step 1: Write the migration SQL**

```sql
-- supabase/migrations/004_indian_stocks.sql

-- Enable trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Master stock listing table
CREATE TABLE indian_stocks (
  isin TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nse_symbol TEXT,
  bse_code TEXT,
  sector TEXT,
  industry TEXT,
  series TEXT,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE', 'BSE', 'BOTH')),
  -- Live price fields (populated by cron for tracked stocks only)
  price NUMERIC,
  change NUMERIC,
  change_pct NUMERIC,
  volume BIGINT,
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX idx_indian_stocks_nse_symbol ON indian_stocks(nse_symbol) WHERE nse_symbol IS NOT NULL AND nse_symbol != '';
CREATE UNIQUE INDEX idx_indian_stocks_bse_code ON indian_stocks(bse_code) WHERE bse_code IS NOT NULL AND bse_code != '';
CREATE INDEX idx_indian_stocks_name_trgm ON indian_stocks USING gin (name gin_trgm_ops);
CREATE INDEX idx_indian_stocks_sector ON indian_stocks(sector);
CREATE INDEX idx_indian_stocks_last_updated ON indian_stocks(last_updated) WHERE last_updated IS NOT NULL;

-- RLS: readable by all authenticated, writable only by service role
ALTER TABLE indian_stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read indian_stocks"
  ON indian_stocks FOR SELECT
  TO authenticated
  USING (true);

-- Add isin FK to companies (nullable initially for backfill)
ALTER TABLE companies ADD COLUMN isin TEXT REFERENCES indian_stocks(isin);
CREATE INDEX idx_companies_isin ON companies(isin);
```

**Step 2: Commit**

```bash
git add supabase/migrations/004_indian_stocks.sql
git commit -m "feat: add indian_stocks table with indexes and RLS"
```

---

### Task 4: Create seed script to load CSV into Supabase

**Files:**
- Create: `scripts/seed-indian-stocks.ts`

**Step 1: Write the seed script**

```typescript
// scripts/seed-indian-stocks.ts
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const csv = readFileSync("supabase/seed/indian_stocks.csv", "utf-8");
const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });

const BATCH_SIZE = 500;

async function seed() {
  console.log(`Seeding ${rows.length} stocks...`);
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((row: Record<string, string>) => ({
      isin: row.isin,
      name: row.name,
      nse_symbol: row.nse_symbol || null,
      bse_code: row.bse_code || null,
      sector: row.sector || null,
      industry: row.industry || null,
      series: row.series || null,
      exchange: row.exchange,
    }));

    const { error } = await supabase.from("indian_stocks").upsert(batch, { onConflict: "isin" });
    if (error) {
      console.error(`Batch ${i}-${i + BATCH_SIZE} failed:`, error.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`Seeded ${inserted} stocks successfully.`);
}

seed().catch(console.error);
```

**Step 2: Add npm script**

Add to `package.json` scripts:

```json
"seed:stocks": "tsx scripts/seed-indian-stocks.ts"
```

**Step 3: Run the seed**

```bash
npm run seed:stocks
```

Expected: "Seeded XXXX stocks successfully."

**Step 4: Commit**

```bash
git add scripts/seed-indian-stocks.ts package.json
git commit -m "feat: add seed script for indian_stocks table"
```

---

### Task 5: Backfill `isin` on existing companies and migrate schema

**Files:**
- Create: `scripts/backfill-company-isin.ts`
- Create: `supabase/migrations/005_normalize_companies.sql`

**Step 1: Write the backfill script**

This runs BEFORE the schema migration to populate `isin` on existing companies.

```typescript
// scripts/backfill-company-isin.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function backfill() {
  // Get all companies without isin
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name, symbol")
    .is("isin", null);

  if (error) throw error;
  if (!companies?.length) {
    console.log("No companies to backfill.");
    return;
  }

  console.log(`Backfilling ${companies.length} companies...`);
  let matched = 0;
  const unmatched: string[] = [];

  for (const c of companies) {
    let isin: string | null = null;

    // Try matching by NSE symbol first
    if (c.symbol) {
      const { data } = await supabase
        .from("indian_stocks")
        .select("isin")
        .eq("nse_symbol", c.symbol.replace(/^NSE:/i, "").trim())
        .limit(1)
        .single();
      if (data) isin = data.isin;
    }

    // Fall back to name match (case-insensitive)
    if (!isin && c.name) {
      const { data } = await supabase
        .from("indian_stocks")
        .select("isin")
        .ilike("name", c.name.trim())
        .limit(1)
        .single();
      if (data) isin = data.isin;
    }

    if (isin) {
      await supabase.from("companies").update({ isin }).eq("id", c.id);
      matched++;
    } else {
      unmatched.push(`${c.name} (${c.symbol})`);
    }
  }

  console.log(`Matched: ${matched}/${companies.length}`);
  if (unmatched.length) {
    console.log("UNMATCHED (need manual resolution):");
    unmatched.forEach((u) => console.log(`  - ${u}`));
  }
}

backfill().catch(console.error);
```

**Step 2: Run backfill**

```bash
npx tsx scripts/backfill-company-isin.ts
```

Expected: All or most companies matched. Manually fix any unmatched ones.

**Step 3: Write the schema migration**

Only apply AFTER backfill is verified.

```sql
-- supabase/migrations/005_normalize_companies.sql

-- Make isin NOT NULL (backfill must be complete)
ALTER TABLE companies ALTER COLUMN isin SET NOT NULL;

-- Drop columns now resolved via indian_stocks
ALTER TABLE companies DROP COLUMN name;
ALTER TABLE companies DROP COLUMN symbol;
ALTER TABLE companies DROP COLUMN sector;
ALTER TABLE companies DROP COLUMN market_cap;
ALTER TABLE companies DROP COLUMN current_price;

-- Drop stock_prices table (replaced by indian_stocks price columns)
DROP POLICY IF EXISTS "Authenticated users can read stock prices" ON stock_prices;
DROP TABLE stock_prices;
```

**Step 4: Commit**

```bash
git add scripts/backfill-company-isin.ts supabase/migrations/005_normalize_companies.sql
git commit -m "feat: backfill isin and normalize companies schema"
```

---

### Task 6: Update TypeScript types

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Update types**

Replace the `Company` and `StockPrice` interfaces, add `IndianStock`:

```typescript
// In src/types/database.ts

export interface IndianStock {
  isin: string;
  name: string;
  nse_symbol: string | null;
  bse_code: string | null;
  sector: string | null;
  industry: string | null;
  series: string | null;
  exchange: "NSE" | "BSE" | "BOTH";
  price: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | null;
  last_updated: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  portfolio_id: string;
  user_id: string;
  isin: string;
  buy_price: number | null;
  star_rating: number | null;
  strategy: "core" | "satellite" | null;
  investment_horizon_years: number | null;
  expected_returns: number | null;
  thesis: string | null;
  highlights: string | null;
  created_at: string;
  updated_at: string;
  // Joined from indian_stocks
  indian_stocks?: IndianStock;
}
```

Remove the `StockPrice` interface entirely.

**Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "refactor: update types for indian_stocks normalization"
```

---

### Task 7: Create stock search server action

**Files:**
- Create: `src/app/(authenticated)/actions/stock-actions.ts`

**Step 1: Write the server action**

```typescript
// src/app/(authenticated)/actions/stock-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import type { IndianStock } from "@/types/database";

export async function searchStocks(query: string): Promise<IndianStock[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (!query || query.length < 2) return [];

  const q = query.trim();

  // Search by name (trigram), nse_symbol, or bse_code
  const { data, error } = await supabase
    .from("indian_stocks")
    .select("*")
    .or(`name.ilike.%${q}%,nse_symbol.ilike.%${q}%,bse_code.ilike.%${q}%`)
    .order("name")
    .limit(20);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getStockByIsin(isin: string): Promise<IndianStock | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("indian_stocks")
    .select("*")
    .eq("isin", isin)
    .single();

  if (error) return null;
  return data;
}
```

**Step 2: Commit**

```bash
git add src/app/\(authenticated\)/actions/stock-actions.ts
git commit -m "feat: add stock search server action"
```

---

### Task 8: Build StockSearch autocomplete component

**Files:**
- Create: `src/components/company/stock-search.tsx`

**Step 1: Write the component**

```tsx
// src/components/company/stock-search.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchStocks } from "@/app/(authenticated)/actions/stock-actions";
import type { IndianStock } from "@/types/database";
import { X } from "lucide-react";

interface StockSearchProps {
  onSelect: (stock: IndianStock) => void;
  selected?: IndianStock | null;
  onClear?: () => void;
  disabled?: boolean;
}

export function StockSearch({ onSelect, selected, onClear, disabled }: StockSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IndianStock[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchStocks(query);
        setResults(data);
        setIsOpen(data.length > 0);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function formatExchange(stock: IndianStock): string {
    const parts: string[] = [];
    if (stock.nse_symbol) parts.push(`NSE: ${stock.nse_symbol}`);
    if (stock.bse_code) parts.push(`BSE: ${stock.bse_code}`);
    return parts.join(" / ");
  }

  if (selected) {
    return (
      <div>
        <Label>Stock *</Label>
        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/30">
          <div className="flex-1 min-w-0">
            <span className="font-medium">{selected.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              ({formatExchange(selected)})
            </span>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                onClear?.();
                setQuery("");
              }}
              className="p-0.5 rounded hover:bg-muted"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        {selected.sector && (
          <p className="text-xs text-muted-foreground mt-1">
            Sector: {selected.sector}
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Label>Search Stock *</Label>
      <Input
        placeholder="Type company name or symbol..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {loading && (
        <p className="text-xs text-muted-foreground mt-1">Searching...</p>
      )}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-auto border rounded-md bg-popover shadow-md">
          {results.map((stock) => (
            <button
              key={stock.isin}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm border-b border-border/20 last:border-0"
              onClick={() => {
                onSelect(stock);
                setIsOpen(false);
                setQuery("");
              }}
            >
              <div className="font-medium">{stock.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatExchange(stock)}
                {stock.sector && ` · ${stock.sector}`}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/company/stock-search.tsx
git commit -m "feat: add StockSearch autocomplete component"
```

---

### Task 9: Update company form (create)

**Files:**
- Modify: `src/components/company/company-form.tsx`

**Step 1: Rewrite company form**

Replace the current form to use StockSearch instead of manual name/symbol/sector fields. Remove market_cap and current_price fields.

```tsx
// src/components/company/company-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StockSearch } from "@/components/company/stock-search";
import { createCompany } from "@/app/(authenticated)/actions/company-actions";
import { roundPrice } from "@/lib/utils/calculations";
import type { IndianStock } from "@/types/database";

export function CompanyForm({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [selectedStock, setSelectedStock] = useState<IndianStock | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStock) return;
    setPending(true);
    const formData = new FormData(e.currentTarget);
    formData.set("portfolio_id", portfolioId);
    formData.set("isin", selectedStock.isin);
    const bp = formData.get("buy_price");
    if (bp) formData.set("buy_price", String(roundPrice(Number(bp))));
    await createCompany(formData);
    setPending(false);
    router.push("/");
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Add New Company</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <StockSearch
            onSelect={setSelectedStock}
            selected={selectedStock}
            onClear={() => setSelectedStock(null)}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="buy_price">Buy Price (₹)</Label>
              <Input id="buy_price" name="buy_price" type="number" step="0.01" />
            </div>
            <div>
              <Label htmlFor="star_rating">Star Rating *</Label>
              <Select name="star_rating" defaultValue="2" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s} Star{s > 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="strategy">Strategy</Label>
              <Select name="strategy">
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="satellite">Satellite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="investment_horizon_years">Horizon (years)</Label>
              <Input
                id="investment_horizon_years"
                name="investment_horizon_years"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 3"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Sets default estimate years in Financial Model
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !selectedStock}>
              {pending ? "Creating..." : "Create Company"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/company/company-form.tsx
git commit -m "refactor: company form uses StockSearch autocomplete"
```

---

### Task 10: Update company server actions

**Files:**
- Modify: `src/app/(authenticated)/actions/company-actions.ts`

**Step 1: Update createCompany**

Change `createCompany` to use `isin` instead of name/symbol/sector/market_cap/current_price:

```typescript
export async function createCompany(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("companies").insert({
    user_id: user.id,
    portfolio_id: formData.get("portfolio_id") as string,
    isin: formData.get("isin") as string,
    buy_price: formData.get("buy_price") ? Number(formData.get("buy_price")) : null,
    star_rating: Number(formData.get("star_rating")) || 2,
    strategy: formData.get("strategy") as "core" | "satellite" | null,
    investment_horizon_years: formData.get("investment_horizon_years") ? Number(formData.get("investment_horizon_years")) : 0,
    thesis: sanitizeHtml(formData.get("thesis") as string | null),
    highlights: sanitizeHtml(formData.get("highlights") as string | null),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
}
```

**Step 2: Update getCompanies**

Join with `indian_stocks`:

```typescript
export async function getCompanies(portfolioId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  let query = supabase
    .from("companies")
    .select("*, indian_stocks(*), projection_models(*, valuation_scenarios(*))")
    .order("indian_stocks(name)");

  if (portfolioId) {
    query = query.eq("portfolio_id", portfolioId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
```

**Step 3: Update getCompany**

```typescript
export async function getCompany(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("companies")
    .select(`
      *,
      indian_stocks(*),
      projection_models(*, financial_years(*), valuation_scenarios(*)),
      timeline_entries(*),
      segment_valuations(*),
      market_perceptions(*)
    `)
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}
```

**Step 4: Update updateCompany**

Remove name/symbol/sector/market_cap/current_price from the data it accepts. The function body stays the same (generic update), but callers will no longer send those fields.

**Step 5: Commit**

```bash
git add src/app/\(authenticated\)/actions/company-actions.ts
git commit -m "refactor: company actions use isin FK and join indian_stocks"
```

---

### Task 11: Update dashboard page and CompaniesTable

**Files:**
- Modify: `src/app/(authenticated)/page.tsx`
- Modify: `src/components/dashboard/companies-table.tsx`

**Step 1: Update dashboard query**

In `src/app/(authenticated)/page.tsx`, update the Supabase query to join `indian_stocks`:

```typescript
const { data: companies } = await supabase
  .from("companies")
  .select("*, indian_stocks(*), projection_models(*, valuation_scenarios(*))")
  .order("indian_stocks(name)");
```

**Step 2: Update CompaniesTable**

Update the `CompanyWithProjections` type to include `indian_stocks`. Replace all `company.name` with `company.indian_stocks?.name`, `company.symbol` with `company.indian_stocks?.nse_symbol`, `company.sector` with `company.indian_stocks?.sector`, `company.current_price` with `company.indian_stocks?.price`, `company.market_cap` with `company.indian_stocks?.price` (market_cap will need to come from a different source or be removed from the table — use price for now).

Key changes in the table:
- Name column: `company.indian_stocks?.name` with `company.indian_stocks?.nse_symbol` as subtitle
- Sector column: `company.indian_stocks?.sector`
- CMP column: `company.indian_stocks?.price`
- MCap column: remove or show "-" (market_cap is no longer stored; can be added to `indian_stocks` later)
- Search filter: search on `company.indian_stocks?.name` and `company.indian_stocks?.nse_symbol`
- Sort field mapping: update `name` → `indian_stocks.name`, `sector` → `indian_stocks.sector`, `current_price` → `indian_stocks.price`

**Step 3: Commit**

```bash
git add src/app/\(authenticated\)/page.tsx src/components/dashboard/companies-table.tsx
git commit -m "refactor: dashboard reads stock data from indian_stocks join"
```

---

### Task 12: Update company detail page and CompanyHeader

**Files:**
- Modify: `src/app/(authenticated)/company/[id]/page.tsx`
- Modify: `src/components/company/company-header.tsx`

**Step 1: Update company detail page query**

In `src/app/(authenticated)/company/[id]/page.tsx`, the query already uses `select(*)` which will now include `isin`. Add `indian_stocks(*)` join:

```typescript
const { data: company, error } = await supabase
  .from("companies")
  .select(`
    *,
    indian_stocks(*),
    projection_models(*, financial_years(*), valuation_scenarios(*)),
    timeline_entries(*),
    segment_valuations(*),
    market_perceptions(*)
  `)
  .eq("id", id)
  .single();
```

**Step 2: Update CompanyHeader**

Replace references:
- `company.name` → `company.indian_stocks?.name`
- `company.symbol` → `company.indian_stocks?.nse_symbol`
- `company.market_cap` → remove or show from `indian_stocks` if available
- `company.current_price` → `company.indian_stocks?.price`

**Step 3: Update DeleteCompanyButton**

Pass `company.indian_stocks?.name` instead of `company.name`:

```tsx
<DeleteCompanyButton companyId={company.id} companyName={company.indian_stocks?.name ?? "Unknown"} />
```

**Step 4: Commit**

```bash
git add src/app/\(authenticated\)/company/\[id\]/page.tsx src/components/company/company-header.tsx
git commit -m "refactor: company detail page reads from indian_stocks"
```

---

### Task 13: Update edit company dialog and edit tab

**Files:**
- Modify: `src/components/company/edit-company-dialog.tsx`
- Modify: `src/components/company/edit-company-tab.tsx`

**Step 1: Update EditCompanyDialog**

Remove name, symbol, sector, market_cap, current_price fields. Show the stock as a read-only display at the top. Keep buy_price, star_rating, strategy fields.

Update the `handleSubmit` to only send editable fields:

```typescript
await updateCompany(company.id, {
  buy_price: fd.get("buy_price") ? Number(fd.get("buy_price")) : null,
  star_rating: Number(fd.get("star_rating")) || 2,
  strategy: (fd.get("strategy") as "core" | "satellite") || null,
});
```

Add a read-only stock info section at top:

```tsx
<div className="px-3 py-2 bg-muted/30 rounded-md mb-4">
  <p className="font-medium">{company.indian_stocks?.name}</p>
  <p className="text-xs text-muted-foreground">
    {company.indian_stocks?.nse_symbol && `NSE: ${company.indian_stocks.nse_symbol}`}
    {company.indian_stocks?.bse_code && ` / BSE: ${company.indian_stocks.bse_code}`}
    {company.indian_stocks?.sector && ` · ${company.indian_stocks.sector}`}
  </p>
</div>
```

**Step 2: Update EditCompanyTab**

Same changes as EditCompanyDialog — remove name/symbol/sector/market_cap/current_price fields, add read-only stock display, keep editable fields (buy_price, star_rating, strategy).

Remove imports of `roundMarketCap` from both files.

**Step 3: Commit**

```bash
git add src/components/company/edit-company-dialog.tsx src/components/company/edit-company-tab.tsx
git commit -m "refactor: edit forms show stock info as read-only, remove dropped fields"
```

---

### Task 14: Update price refresh (cron and manual)

**Files:**
- Modify: `src/lib/services/price-refresh.ts`
- Modify: `src/app/(authenticated)/actions/price-actions.ts`
- Modify: `src/app/api/cron/refresh-prices/route.ts` (no changes needed, just verify)

**Step 1: Update price-refresh.ts**

Rewrite `refreshPrices` to query `indian_stocks` via companies join:

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import { YahooFinanceProvider } from "@/lib/providers/stock-price/yahoo-finance-provider";

const provider = new YahooFinanceProvider();

export function isIndianTradingHours(): boolean {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const hour = ist.getHours();
  return hour >= 9 && hour < 16;
}

export async function refreshPrices(
  adminClient: SupabaseClient
): Promise<{ updated: number; failed: string[]; totalSymbols: number }> {
  // Get distinct ISINs from companies, then fetch their stock info
  const { data: tracked, error } = await adminClient
    .from("companies")
    .select("isin, indian_stocks(nse_symbol, bse_code)")
    .not("isin", "is", null);

  if (error) throw new Error(`Failed to fetch tracked stocks: ${error.message}`);

  // Build unique symbol map: isin -> yahoo symbol
  const symbolMap = new Map<string, string>();
  for (const row of tracked ?? []) {
    if (symbolMap.has(row.isin)) continue;
    const stock = row.indian_stocks as { nse_symbol: string | null; bse_code: string | null } | null;
    if (!stock) continue;
    // Prefer NSE symbol
    if (stock.nse_symbol) {
      symbolMap.set(row.isin, stock.nse_symbol);
    } else if (stock.bse_code) {
      symbolMap.set(row.isin, stock.bse_code);
    }
  }

  if (symbolMap.size === 0) {
    return { updated: 0, failed: [], totalSymbols: 0 };
  }

  // Fetch quotes using yahoo symbols
  const yahooSymbols = Array.from(symbolMap.values());
  const quotes = await provider.fetchBulkQuotes(yahooSymbols);

  let updated = 0;
  const failed: string[] = [];

  for (const [isin, symbol] of symbolMap) {
    const quote = quotes.get(symbol);
    if (!quote) {
      failed.push(symbol);
      continue;
    }

    const { error: upsertError } = await adminClient
      .from("indian_stocks")
      .update({
        price: quote.price,
        change: quote.change,
        change_pct: quote.changePct,
        volume: quote.volume ?? null,
        last_updated: new Date().toISOString(),
      })
      .eq("isin", isin);

    if (upsertError) {
      console.error(`Failed to update price for ${symbol} (${isin}):`, upsertError);
      failed.push(symbol);
    } else {
      updated++;
    }
  }

  return { updated, failed, totalSymbols: symbolMap.size };
}
```

**Step 2: Update price-actions.ts (manual refresh)**

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isIndianTradingHours } from "@/lib/services/price-refresh";
import { YahooFinanceProvider } from "@/lib/providers/stock-price/yahoo-finance-provider";
import { revalidatePath } from "next/cache";

const provider = new YahooFinanceProvider();

export async function manualRefreshPrices() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Get user's tracked stocks via companies (RLS scoped)
  const { data: companies, error } = await supabase
    .from("companies")
    .select("isin, indian_stocks(nse_symbol, bse_code)")
    .not("isin", "is", null);

  if (error) throw new Error(error.message);

  const symbolMap = new Map<string, string>();
  for (const row of companies ?? []) {
    if (symbolMap.has(row.isin)) continue;
    const stock = row.indian_stocks as { nse_symbol: string | null; bse_code: string | null } | null;
    if (!stock) continue;
    if (stock.nse_symbol) symbolMap.set(row.isin, stock.nse_symbol);
    else if (stock.bse_code) symbolMap.set(row.isin, stock.bse_code);
  }

  if (symbolMap.size === 0) {
    return { updated: 0, failed: [], totalSymbols: 0, outsideTradingHours: !isIndianTradingHours() };
  }

  const quotes = await provider.fetchBulkQuotes(Array.from(symbolMap.values()));
  const adminClient = createAdminClient();
  let updated = 0;
  const failed: string[] = [];

  for (const [isin, symbol] of symbolMap) {
    const quote = quotes.get(symbol);
    if (!quote) { failed.push(symbol); continue; }

    const { error: upsertError } = await adminClient
      .from("indian_stocks")
      .update({
        price: quote.price,
        change: quote.change,
        change_pct: quote.changePct,
        volume: quote.volume ?? null,
        last_updated: new Date().toISOString(),
      })
      .eq("isin", isin);

    if (upsertError) { failed.push(symbol); } else { updated++; }
  }

  revalidatePath("/");
  return { updated, failed, totalSymbols: symbolMap.size, outsideTradingHours: !isIndianTradingHours() };
}
```

**Step 3: Verify cron route**

`src/app/api/cron/refresh-prices/route.ts` calls `refreshPrices(adminClient)` — no changes needed since the function signature is unchanged.

**Step 4: Commit**

```bash
git add src/lib/services/price-refresh.ts src/app/\(authenticated\)/actions/price-actions.ts
git commit -m "refactor: price refresh updates indian_stocks instead of stock_prices"
```

---

### Task 15: Update Excel import route

**Files:**
- Modify: `src/app/api/import/route.ts`

**Step 1: Update import to resolve ISIN**

The import needs to match Excel company symbols to `indian_stocks` ISINs. Update the company insert to use `isin` instead of name/symbol/sector/etc:

```typescript
// Inside the for loop, before inserting the company:
// Try to find the ISIN from the symbol
let isin: string | null = null;
const cleanSymbol = c.symbol?.replace(/^NSE:/i, "").trim();
if (cleanSymbol) {
  const { data: stock } = await supabase
    .from("indian_stocks")
    .select("isin")
    .eq("nse_symbol", cleanSymbol)
    .single();
  isin = stock?.isin ?? null;
}
// Fall back to name match
if (!isin) {
  const { data: stock } = await supabase
    .from("indian_stocks")
    .select("isin")
    .ilike("name", c.name.trim())
    .limit(1)
    .single();
  isin = stock?.isin ?? null;
}

if (!isin) {
  errors.push(`${c.name}: No matching stock found in indian_stocks`);
  continue;
}

const { data: company, error: compErr } = await supabase
  .from("companies")
  .insert({
    user_id: user.id,
    portfolio_id: portfolio!.id,
    isin,
    buy_price: c.buy_price != null ? Math.round(c.buy_price * 100) / 100 : null,
    star_rating: c.star_rating,
    strategy: c.strategy,
    investment_horizon_years: Math.max(0, c.financial_years.filter((fy) => fy.is_estimate).length),
    expected_returns: c.expected_returns,
    thesis: c.thesis,
    highlights: c.highlights,
  })
  .select("id")
  .single();
```

**Step 2: Commit**

```bash
git add src/app/api/import/route.ts
git commit -m "refactor: excel import resolves ISIN from indian_stocks"
```

---

### Task 16: Update CompanyTabs and remaining components

**Files:**
- Modify: `src/components/company/company-tabs.tsx`
- Modify: `src/components/company/thesis-tab.tsx` (if it uses company.name)
- Modify: `src/components/company/highlights-section.tsx` (if it uses company.name)

**Step 1: Check and update CompanyTabs**

Update the type annotation to include `indian_stocks`:

```typescript
export function CompanyTabs({
  company,
  projectionModels,
  timelineEntries,
}: {
  company: Company & { indian_stocks?: IndianStock; segment_valuations: any[]; market_perceptions: any[] };
  projectionModels: ProjectionModel[];
  timelineEntries: TimelineEntry[];
})
```

**Step 2: Check thesis-tab and highlights-section**

Read these files. If they reference `company.name`, update to `company.indian_stocks?.name`.

**Step 3: Commit**

```bash
git add src/components/company/
git commit -m "refactor: update remaining components for indian_stocks"
```

---

### Task 17: Clean up unused code

**Files:**
- Modify: `src/lib/utils/calculations.ts` (remove `roundMarketCap` if no longer used)
- Modify: `src/types/database.ts` (verify `StockPrice` is removed)
- Delete: any orphaned references to `stock_prices`

**Step 1: Remove roundMarketCap**

If `roundMarketCap` is no longer called anywhere (market_cap removed from company forms), remove it from `src/lib/utils/calculations.ts`.

**Step 2: Search for remaining `stock_prices` references**

```bash
grep -r "stock_prices" src/ --include="*.ts" --include="*.tsx"
```

Fix any remaining references.

**Step 3: Search for remaining old field references**

```bash
grep -rn "company\.name\b" src/ --include="*.ts" --include="*.tsx"
grep -rn "company\.symbol\b" src/ --include="*.ts" --include="*.tsx"
grep -rn "company\.sector\b" src/ --include="*.ts" --include="*.tsx"
grep -rn "company\.current_price\b" src/ --include="*.ts" --include="*.tsx"
grep -rn "company\.market_cap\b" src/ --include="*.ts" --include="*.tsx"
```

Fix any remaining references to use `company.indian_stocks?.xxx`.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up unused code and stale references"
```

---

### Task 18: Build and verify

**Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

**Step 2: Run the dev server**

```bash
npm run dev
```

Verify:
- Dashboard loads and shows companies with names from `indian_stocks`
- "Add Company" page shows the StockSearch autocomplete
- Searching for a company name returns results
- Selecting a stock and creating a company works
- Company detail page loads correctly
- Edit dialog shows stock info as read-only
- Price refresh works (manual button)

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build and runtime issues"
```
