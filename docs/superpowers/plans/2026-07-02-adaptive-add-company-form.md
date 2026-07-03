# Adaptive Add-Company Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/company/new` portfolio-aware and branch by type — Holdings captures an optional all-or-nothing position (account + qty + avg price) plus collapsed research; Watchlist keeps research fields.

**Architecture:** A new Zod schema validates the combined create; a shared `AccountSelect` component (extracted from `holdings-tab.tsx`) provides the "select existing / + New account…" picker; a `createCompanyWithHolding` server action orchestrates account-resolve → company insert → optional holding insert; the rewritten `CompanyForm` reads portfolio context, shows a destination header with an inline switcher, and branches its content by portfolio type.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase server actions, base-ui `Select`, Zod, Vitest, sonner (toasts).

## Global Constraints

- Package manager: npm. Tests: `vitest run` via `npm test`.
- Coverage thresholds (95% statements/branches/functions/lines) apply ONLY to `src/lib/**` and `src/types/**` (see `vitest.config.ts`). New code in `src/lib/validations.ts` MUST be covered by tests. `src/components/**` and `src/app/**` are NOT coverage-gated.
- ISIN format: `/^INE[A-Z0-9]{9}$/` (via `isinSchema`).
- base-ui `Select` submits its value through native FormData when given a `name` prop; `onValueChange` yields `(value: string | null, …)` and needs null handling if used controlled.
- Holdings uniqueness: `holdings` has unique `(portfolio_id, account_id, company_id)`; `companies` has unique `(portfolio_id, isin)`.
- Manual holdings use `source: 'manual'`, `import_holding_id: null`.
- Every git commit message ends with the co-author trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: `companyWithHoldingSchema` validation + tests

**Files:**
- Modify: `src/lib/validations.ts` (append new schema after `companyCreateSchema`, ~line 21)
- Test: `src/__tests__/lib/validations.test.ts` (create)

**Interfaces:**
- Consumes: `uuidSchema`, `isinSchema` (already exported from `src/lib/validations.ts`)
- Produces: `companyWithHoldingSchema` — a Zod object with `.refine()` enforcing all-or-nothing position. Parsed shape:
  `{ portfolio_id: string; isin: string; strategy?: string|null; investment_horizon_years?: number; star_rating?: number; buy_price?: number|null; account_id?: string; new_account_label?: string; quantity?: number; avg_buy_price?: number }`.
  Refine rule: if ANY of {account_id or new_account_label present, quantity, avg_buy_price} is set, then ALL of {account present, quantity, avg_buy_price} must be set. Error message: `"Enter account, quantity and avg price together"`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/validations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { companyWithHoldingSchema } from "@/lib/validations";

const PID = "11111111-1111-1111-1111-111111111111";
const AID = "22222222-2222-2222-2222-222222222222";
const ISIN = "INE002A01018";

describe("companyWithHoldingSchema", () => {
  it("accepts research-only (no position)", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: ISIN, star_rating: 3 });
    expect(r.success).toBe(true);
  });

  it("accepts a full position with an existing account", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: ISIN, account_id: AID, quantity: 10, avg_buy_price: 100,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a full position with a new account label", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: ISIN, new_account_label: "Dad – Groww", quantity: 5, avg_buy_price: 50,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a partial position (qty only)", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: ISIN, quantity: 10 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("Enter account, quantity and avg price together");
    }
  });

  it("rejects a partial position (account only)", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: ISIN, account_id: AID });
    expect(r.success).toBe(false);
  });

  it("rejects a bad ISIN", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: "BAD" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/validations.test.ts`
Expected: FAIL — `companyWithHoldingSchema` is not exported (import error / undefined).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/validations.ts`, add after `companyCreateSchema` (after line 21):

```ts
/**
 * Add a company with an OPTIONAL, all-or-nothing holding position.
 * Research fields are all optional. If any position field is provided,
 * account + quantity + avg_buy_price must all be provided together.
 */
export const companyWithHoldingSchema = z
  .object({
    portfolio_id: uuidSchema,
    isin: isinSchema,
    // research (all optional)
    strategy: z.string().max(100).optional().nullable(),
    investment_horizon_years: z.number().int().min(0).max(30).optional(),
    star_rating: z.number().int().min(1).max(5).optional(),
    buy_price: z.number().nonnegative().optional().nullable(),
    // position (all-or-nothing)
    account_id: uuidSchema.optional(),
    new_account_label: z.string().min(1).max(100).optional(),
    quantity: z.number().positive().optional(),
    avg_buy_price: z.number().nonnegative().optional(),
  })
  .refine(
    (d) => {
      const hasAccount = Boolean(d.account_id || d.new_account_label);
      const hasQty = d.quantity !== undefined;
      const hasPrice = d.avg_buy_price !== undefined;
      const some = hasAccount || hasQty || hasPrice;
      const all = hasAccount && hasQty && hasPrice;
      return !some || all;
    },
    { message: "Enter account, quantity and avg price together" }
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/validations.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations.ts src/__tests__/lib/validations.test.ts
git commit -m "feat: companyWithHoldingSchema for all-or-nothing position validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shared `AccountSelect` component + refactor `holdings-tab.tsx`

**Files:**
- Create: `src/components/account/account-select.tsx`
- Modify: `src/components/company/holdings-tab.tsx` (replace inline account `<select>` + new-label `<Input>` at lines ~274-309; update `handleAdd` to import `NEW_ACCOUNT`)

**Interfaces:**
- Consumes: `Account` type from `@/types/database`; `Input` from `@/components/ui/input`.
- Produces:
  - `NEW_ACCOUNT` constant (string `"__new__"`).
  - `AccountSelect` component with props `{ accounts: Account[]; value: string; onChange: (v: string) => void; newLabel: string; onNewLabelChange: (v: string) => void; className?: string }`. Renders a native `<select>` of existing accounts plus a `+ New account…` option (`value=NEW_ACCOUNT`); when `value === NEW_ACCOUNT`, renders the inline label `<Input>`.

> No unit test: this file is in `src/components/**` (not coverage-gated) and `@testing-library/react` is not installed. Verified via typecheck + lint + existing tests + manual smoke.

- [ ] **Step 1: Create the component**

Create `src/components/account/account-select.tsx`:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import type { Account } from "@/types/database";

/** Sentinel value meaning "create a new account". */
export const NEW_ACCOUNT = "__new__";

/**
 * Controlled account picker: choose an existing account or "+ New account…".
 * When "+ New account…" is chosen, an inline name input appears.
 */
export function AccountSelect({
  accounts,
  value,
  onChange,
  newLabel,
  onNewLabelChange,
  className,
}: {
  accounts: Account[];
  value: string; // "" | <account id> | NEW_ACCOUNT
  onChange: (value: string) => void;
  newLabel: string;
  onNewLabelChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ${className ?? ""}`}
      >
        <option value="" disabled>
          Select account…
        </option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
        <option value={NEW_ACCOUNT}>+ New account…</option>
      </select>
      {value === NEW_ACCOUNT && (
        <Input
          placeholder="New account name (e.g. Father – Groww)"
          value={newLabel}
          onChange={(e) => onNewLabelChange(e.target.value)}
          className="h-9"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Refactor `holdings-tab.tsx` to consume it**

In `src/components/company/holdings-tab.tsx`:

Add the import near the other component imports (after line 15):

```tsx
import { AccountSelect, NEW_ACCOUNT } from "@/components/account/account-select";
```

In `handleAdd`, replace the literal `"__new__"` comparison (line ~112) with the constant:

```tsx
      if (accountId === NEW_ACCOUNT) {
```

Replace the account `<div className="space-y-1">…</div>` block containing the inline `<select>` (lines ~275-292) with:

```tsx
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Account</label>
                  <AccountSelect
                    accounts={accounts}
                    value={addAccountId}
                    onChange={setAddAccountId}
                    newLabel={newAccountLabel}
                    onNewLabelChange={setNewAccountLabel}
                  />
                </div>
```

Delete the now-duplicated standalone new-account `<Input>` block (lines ~302-309, the `{addAccountId === "__new__" && ( <Input placeholder="New account name…" … /> )}`), since `AccountSelect` now renders it.

- [ ] **Step 3: Typecheck, lint, and run the suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors; lint clean; all existing tests PASS (behavior of holdings-tab is unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/components/account/account-select.tsx src/components/company/holdings-tab.tsx
git commit -m "refactor: extract shared AccountSelect and use it in holdings tab

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `createCompanyWithHolding` server action + orchestration test

**Files:**
- Modify: `src/app/(authenticated)/actions/holdings-actions.ts` (add imports + new exported action)
- Test: `src/__tests__/lib/create-company-with-holding.test.ts` (create)

**Interfaces:**
- Consumes: `getAuthUser` (`@/lib/supabase/server`), `revalidatePath` (`next/cache`), `createLogger` (`@/lib/logger`), `companyWithHoldingSchema` (`@/lib/validations`), `fetchStockPrice` (`@/app/(authenticated)/actions/price-actions`).
- Produces: `createCompanyWithHolding(formData: FormData): Promise<string>` — returns the new company id. Reads FormData keys: `portfolio_id`, `isin`, `strategy`, `investment_horizon_years`, `star_rating`, `buy_price`, `account_id`, `new_account_label`, `quantity`, `avg_buy_price`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/create-company-with-holding.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const USER = { id: "user-1" };
const PID = "11111111-1111-1111-1111-111111111111";
const AID = "22222222-2222-2222-2222-222222222222";
const ISIN = "INE002A01018";

// table -> resolver(op) -> { data?, error? }
type Op = { table: string; select?: unknown; insert?: unknown; eq: Array<[string, unknown]> };
let handlers: Record<string, (op: Op) => { data?: unknown; error?: unknown }>;
const fromCalls: Record<string, number> = {};

function makeClient() {
  return {
    from(table: string) {
      fromCalls[table] = (fromCalls[table] ?? 0) + 1;
      const op: Op = { table, eq: [] };
      const b: Record<string, unknown> = {
        select(c: unknown) { op.select = c; return b; },
        insert(v: unknown) { op.insert = v; return b; },
        eq(c: string, v: unknown) { op.eq.push([c, v]); return b; },
        maybeSingle() { return Promise.resolve(handlers[table]?.(op) ?? { data: null }); },
        single() { return Promise.resolve(handlers[table]?.(op) ?? { data: null }); },
        then(f: (x: unknown) => unknown, r?: (e: unknown) => unknown) {
          return Promise.resolve(handlers[table]?.(op) ?? { data: null, error: null }).then(f, r);
        },
      };
      return b;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getAuthUser: async () => ({ supabase: makeClient(), user: USER }),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/(authenticated)/actions/price-actions", () => ({
  fetchStockPrice: vi.fn(async () => {}),
}));

import { createCompanyWithHolding } from "@/app/(authenticated)/actions/holdings-actions";

function mkForm(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  for (const k of Object.keys(fromCalls)) delete fromCalls[k];
  handlers = {
    // dup-check uses select+maybeSingle (no insert) -> return no existing row;
    // company insert uses .insert().single() -> return the new id.
    companies: (op) => (op.insert ? { data: { id: "co-1" }, error: null } : { data: null }),
    accounts: () => ({ data: { id: "acc-new" }, error: null }),
    holdings: () => ({ data: null, error: null }),
  };
});

describe("createCompanyWithHolding", () => {
  it("creates a research-only company (no position, no holding)", async () => {
    const id = await createCompanyWithHolding(mkForm({ portfolio_id: PID, isin: ISIN, star_rating: "3" }));
    expect(id).toBe("co-1");
    expect(fromCalls.holdings ?? 0).toBe(0);
    expect(fromCalls.accounts ?? 0).toBe(0);
  });

  it("creates a company + holding with an existing account", async () => {
    const id = await createCompanyWithHolding(
      mkForm({ portfolio_id: PID, isin: ISIN, account_id: AID, quantity: "10", avg_buy_price: "100" })
    );
    expect(id).toBe("co-1");
    expect(fromCalls.holdings).toBe(1);
    expect(fromCalls.accounts ?? 0).toBe(0);
  });

  it("creates the new account then the company + holding", async () => {
    const id = await createCompanyWithHolding(
      mkForm({ portfolio_id: PID, isin: ISIN, new_account_label: "Dad – Groww", quantity: "5", avg_buy_price: "50" })
    );
    expect(id).toBe("co-1");
    expect(fromCalls.accounts).toBe(1);
    expect(fromCalls.holdings).toBe(1);
  });

  it("rejects a duplicate stock in the portfolio", async () => {
    handlers.companies = (op) => (op.insert ? { data: { id: "co-1" } } : { data: { id: "existing" } });
    await expect(
      createCompanyWithHolding(mkForm({ portfolio_id: PID, isin: ISIN }))
    ).rejects.toThrow(/already in this portfolio/i);
  });

  it("rejects a partial position", async () => {
    await expect(
      createCompanyWithHolding(mkForm({ portfolio_id: PID, isin: ISIN, quantity: "10" }))
    ).rejects.toThrow(/together/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/create-company-with-holding.test.ts`
Expected: FAIL — `createCompanyWithHolding` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/app/(authenticated)/actions/holdings-actions.ts`, update the imports at the top:

```ts
import { holdingSchema, companyWithHoldingSchema } from "@/lib/validations";
import { fetchStockPrice } from "@/app/(authenticated)/actions/price-actions";
```

(Keep the existing `type { Holding }` import; add `companyWithHoldingSchema` alongside the existing `holdingSchema` import and drop the standalone `holdingSchema`-only line.)

Append this exported action at the end of the file:

```ts
/**
 * Add a company to a portfolio, optionally with a holding position.
 * Research-only, position-only, and both are all valid. When a `+New`
 * account label is given, the account is created first. Duplicate stocks
 * in the same portfolio are rejected before anything is created.
 */
export async function createCompanyWithHolding(formData: FormData): Promise<string> {
  const { supabase, user } = await getAuthUser();

  const num = (k: string) => (formData.get(k) ? Number(formData.get(k)) : undefined);
  const str = (k: string) => (formData.get(k) as string) || undefined;

  const parsed = companyWithHoldingSchema.safeParse({
    portfolio_id: formData.get("portfolio_id"),
    isin: formData.get("isin"),
    strategy: str("strategy"),
    investment_horizon_years: num("investment_horizon_years"),
    star_rating: num("star_rating"),
    buy_price: num("buy_price"),
    account_id: str("account_id"),
    new_account_label: str("new_account_label"),
    quantity: num("quantity"),
    avg_buy_price: num("avg_buy_price"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const d = parsed.data;

  // 1. Reject duplicate stock in this portfolio.
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("portfolio_id", d.portfolio_id)
    .eq("isin", d.isin)
    .maybeSingle();
  if (existing) throw new Error("This stock is already in this portfolio.");

  const hasPosition = Boolean(d.account_id || d.new_account_label);

  // 2. Resolve the account (create it if a new label was given).
  let accountId = d.account_id ?? null;
  if (hasPosition && d.new_account_label) {
    const label = d.new_account_label.trim();
    const { data: acct, error: acctErr } = await supabase
      .from("accounts")
      .insert({ user_id: user.id, label, broker: "manual" })
      .select("id")
      .single();
    if (acctErr) {
      throw new Error(
        acctErr.code === "23505"
          ? `An account named "${label}" already exists`
          : acctErr.message
      );
    }
    accountId = acct!.id;
  }

  // 3. Insert the company (research stub; defaults applied).
  const { data: company, error: compErr } = await supabase
    .from("companies")
    .insert({
      user_id: user.id,
      portfolio_id: d.portfolio_id,
      isin: d.isin,
      buy_price: d.buy_price ?? null,
      star_rating: d.star_rating ?? 2,
      strategy: (d.strategy as "core" | "satellite" | null) ?? null,
      investment_horizon_years: d.investment_horizon_years ?? 0,
    })
    .select("id")
    .single();
  if (compErr || !company) {
    throw new Error(
      compErr?.code === "23503"
        ? "That stock is not in the database yet. Import a statement containing it first."
        : compErr?.message ?? "Failed to create company"
    );
  }

  // 4. Insert the holding when a position was provided.
  if (hasPosition && accountId) {
    const { error: holdErr } = await supabase.from("holdings").insert({
      user_id: user.id,
      portfolio_id: d.portfolio_id,
      account_id: accountId,
      company_id: company.id,
      isin: d.isin,
      quantity: d.quantity!,
      avg_buy_price: d.avg_buy_price!,
      source: "manual",
      import_holding_id: null,
    });
    if (holdErr) throw new Error(holdErr.message);
  }

  await fetchStockPrice(d.isin);
  revalidatePath("/");
  log.info("Company created with holding", { isin: d.isin, hasPosition });
  return company.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/create-company-with-holding.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(authenticated\)/actions/holdings-actions.ts src/__tests__/lib/create-company-with-holding.test.ts
git commit -m "feat: createCompanyWithHolding server action

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Rewrite `CompanyForm` (destination header + branching) and simplify the page

**Files:**
- Modify (rewrite): `src/components/company/company-form.tsx`
- Modify: `src/app/(authenticated)/company/new/page.tsx`

**Interfaces:**
- Consumes: `usePortfolioContext` (`{ selectedId, selectedPortfolio, portfolios, select }`), `createCompany` (`@/app/(authenticated)/actions/company-actions`), `createCompanyWithHolding` (Task 3), `getAccounts` (`@/app/(authenticated)/actions/account-actions`), `AccountSelect` + `NEW_ACCOUNT` (Task 2), `StockSearch`, `roundPrice`, `useInvalidateDashboard`, sonner `toast`.
- Produces: `CompanyForm` now takes NO props (reads context). The page renders `<CompanyForm />`.

> No unit test: `src/components/**` and `src/app/**` are not coverage-gated and `@testing-library/react` is not installed. Verified via typecheck + lint + manual smoke (steps below).

- [ ] **Step 1: Rewrite the form**

Replace the entire contents of `src/components/company/company-form.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AccountSelect, NEW_ACCOUNT } from "@/components/account/account-select";
import { StockSearch } from "@/components/company/stock-search";
import { createCompany } from "@/app/(authenticated)/actions/company-actions";
import { createCompanyWithHolding } from "@/app/(authenticated)/actions/holdings-actions";
import { getAccounts } from "@/app/(authenticated)/actions/account-actions";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { roundPrice } from "@/lib/utils/calculations";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import type { IndianStock, Account } from "@/types/database";
import { Building2, TrendingUp, Star, Wallet } from "lucide-react";

export function CompanyForm() {
  const router = useRouter();
  const { selectedId, selectedPortfolio, portfolios, select } = usePortfolioContext();
  const invalidate = useInvalidateDashboard();

  const isHoldings = (selectedPortfolio?.type ?? "holdings") === "holdings";

  const [pending, setPending] = useState(false);
  const [selectedStock, setSelectedStock] = useState<IndianStock | null>(null);

  // Position (holdings only)
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgPrice, setAvgPrice] = useState("");

  useEffect(() => {
    if (isHoldings) getAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, [isHoldings]);

  const hasAnyPosition = Boolean(accountId || quantity || avgPrice);

  const done = () => {
    invalidate();
    toast.success("Company added");
    router.push("/");
  };
  const fail = (err: unknown) => {
    toast.error((err as Error).message);
    setPending(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStock) return;

    // Research fields come from the form's native/base-ui inputs (name attrs).
    const fd = new FormData(e.currentTarget);
    fd.set("portfolio_id", selectedId);
    fd.set("isin", selectedStock.isin);
    const bp = fd.get("buy_price");
    if (bp) fd.set("buy_price", String(roundPrice(Number(bp))));

    if (!isHoldings) {
      setPending(true);
      try {
        await createCompany(fd);
        done();
      } catch (err) {
        fail(err);
      }
      return;
    }

    // Holdings: enforce all-or-nothing position.
    if (hasAnyPosition) {
      const accountOk =
        (accountId && accountId !== NEW_ACCOUNT) ||
        (accountId === NEW_ACCOUNT && newAccountLabel.trim());
      if (!accountOk || !quantity || !avgPrice) {
        toast.error("Enter account, quantity and avg price together");
        return;
      }
      if (accountId === NEW_ACCOUNT) fd.set("new_account_label", newAccountLabel.trim());
      else fd.set("account_id", accountId);
      fd.set("quantity", quantity);
      fd.set("avg_buy_price", avgPrice);
    }

    setPending(true);
    try {
      await createCompanyWithHolding(fd);
      done();
    } catch (err) {
      fail(err);
    }
  };

  const researchFields = (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="buy_price" className="text-sm">Target Buy Price (₹)</Label>
        <Input id="buy_price" name="buy_price" type="number" step="0.01" placeholder="Target buy price" className="bg-background" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="star_rating" className="text-sm">Star Rating</Label>
        <Select name="star_rating" defaultValue="2">
          <SelectTrigger className="bg-background"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4].map((s) => (
              <SelectItem key={s} value={String(s)}>
                {"★".repeat(s)}{"☆".repeat(4 - s)} ({s})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="strategy" className="text-sm">Strategy</Label>
        <Select name="strategy" defaultValue="core">
          <SelectTrigger className="bg-background"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="core">Core</SelectItem>
            <SelectItem value="satellite">Satellite</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="investment_horizon_years" className="text-sm">Horizon (years)</Label>
        <Input id="investment_horizon_years" name="investment_horizon_years" type="number" min="0" step="1" placeholder="e.g. 3" className="bg-background" />
        <p className="text-xs text-muted-foreground">Sets default estimate years in Financial Model</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl">
      {/* Header with destination + inline switcher */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/15 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground">Add New Company</h1>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Adding to</span>
              <select
                value={selectedId}
                onChange={(e) => select(e.target.value)}
                className="h-7 rounded-md border border-input bg-background px-2 text-sm font-medium"
              >
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Badge variant={isHoldings ? "default" : "secondary"} className="capitalize">
                {isHoldings ? "Holdings" : "Watchlist"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Stock Search */}
        <Card className="border-primary/10 shadow-sm overflow-visible">
          <CardContent className="pt-5 pb-5">
            <Label className="text-sm font-medium mb-2 block">Stock *</Label>
            <StockSearch
              onSelect={setSelectedStock}
              selected={selectedStock}
              onClear={() => setSelectedStock(null)}
            />
            {selectedStock && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 text-sm">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="font-medium">{selectedStock.name}</span>
                {selectedStock.nse_symbol && (
                  <span className="text-muted-foreground">({selectedStock.nse_symbol})</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Holdings: Position card (optional, all-or-nothing) */}
        {isHoldings && (
          <Card className="shadow-sm">
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Position</span>
                <span className="text-xs text-muted-foreground">(optional — fill account, qty & price together)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Account</Label>
                  <AccountSelect
                    accounts={accounts}
                    value={accountId}
                    onChange={setAccountId}
                    newLabel={newAccountLabel}
                    onNewLabelChange={setNewAccountLabel}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Quantity</Label>
                  <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="e.g. 100" className="bg-background" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Avg Buy Price (₹)</Label>
                  <Input value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} inputMode="decimal" placeholder="e.g. 245.50" className="bg-background" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Research fields: always shown for watchlist; collapsed for holdings */}
        {isHoldings ? (
          <Card className="shadow-sm">
            <CardContent className="pt-4 pb-4">
              <details>
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Star className="h-4 w-4 text-primary" />
                  Add research details (optional)
                </summary>
                <div className="pt-4">{researchFields}</div>
              </details>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm">
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Star className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Company Details</span>
              </div>
              {researchFields}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={pending || !selectedStock} className="px-6">
            {pending ? "Creating..." : isHoldings ? "Add to Holdings" : "Add to Watchlist"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Simplify the page**

Replace the contents of `src/app/(authenticated)/company/new/page.tsx` with:

```tsx
"use client";

import { CompanyForm } from "@/components/company/company-form";

export default function NewCompanyPage() {
  return (
    <div>
      <CompanyForm />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint, and run the suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors; lint clean; all tests PASS.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, then in the browser:
1. Select a **Watchlist** portfolio → `+ Add Company`. Header shows "Adding to `<name>`" + a **Watchlist** badge. Only Stock + Company Details show (no Position card). Pick a stock → **Add to Watchlist** → lands on dashboard with the company present.
2. Select a **Holdings** portfolio → `+ Add Company`. Header shows the **Holdings** badge and the Position card. 
   - **Research-only:** pick a stock, leave Position blank, **Add to Holdings** → company appears, no position.
   - **Full:** pick a stock, choose an account (or `+ New account…` + name), enter qty + avg price → company appears with the holding on its Holdings tab.
   - **Partial:** fill qty only → submit shows the toast "Enter account, quantity and avg price together".
   - **Switcher:** change the portfolio dropdown in the header from Holdings to Watchlist → the Position card disappears and the button label changes.

Expected: all behaviors as described.

- [ ] **Step 5: Commit**

```bash
git add src/components/company/company-form.tsx src/app/\(authenticated\)/company/new/page.tsx
git commit -m "feat: adaptive add-company form with destination switcher and holdings position

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review notes

- **Spec coverage:** A=destination header/switcher (Task 4 Step 1); B=type branching + Position card + collapsed research + Target Buy Price rename (Task 4); C=shared AccountSelect (Task 2); D=createCompanyWithHolding (Task 3); E=companyWithHoldingSchema (Task 1); F=error toasts (Task 3 messages + Task 4 all-or-nothing toast); G=tests (Tasks 1 & 3). All covered.
- **Type consistency:** `NEW_ACCOUNT` and `AccountSelect` prop names are identical across Tasks 2 and 4. `createCompanyWithHolding(formData)` signature and FormData keys match between Tasks 3 and 4. Schema field names match between Tasks 1 and 3.
- **Watchlist path unchanged:** still calls `createCompany`; star_rating always submitted (default "2") so the existing action's default holds.
- **Coverage gate:** only Task 1 adds `src/lib/**` code and it is fully tested; Task 3's action lives under `src/app/**` (not gated) but is still tested.
