# Move-to-Holdings Account Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a company is moved from a watchlist into a holdings portfolio, require the user to pick an account (creating a zero-qty holdings row so the company belongs to that account); when moved out of holdings to a watchlist, unlink it by deleting its holdings.

**Architecture:** A pure helper decides when the move requires an account. A shared `resolveAccountId` helper (extracted from the add-company flow) creates/looks up the account. `moveCompany` gains an optional `position` and, when the moved company has no carried holdings and the target is holdings, inserts one holdings row under the resolved account (qty/price default 0). The `MoveStockDialog` reveals a Position section (account required, qty/price optional) when moving from a watchlist into holdings.

**Tech Stack:** Next.js 15 server actions, Supabase (`@supabase/supabase-js` client typing), Zod validation, Vitest (jsdom) unit tests.

## Global Constraints

- Account↔company link lives ONLY in a `holdings` row; there is no account column on `companies`.
- DB already permits `holdings.quantity >= 0` and `holdings.avg_buy_price >= 0` — NO migration.
- New manual holdings always use `source: 'manual'`, `import_holding_id: null`.
- New accounts created from a label use `broker: 'manual'`.
- Tests are lib-focused Vitest unit tests (no React Testing Library in this repo — do not add it). Mock Supabase with the builder pattern already used in `src/__tests__/lib/import/holdings-import-engine.test.ts` (supports `select/insert/update/delete/upsert/eq/order/maybeSingle/single/then`).
- Guard message, verbatim: `"Select an account to move this stock into holdings."`

---

### Task 1: `requiresAccountForMove` helper

Pure function deciding whether the move dialog must collect an account.

**Files:**
- Modify: `src/lib/holdings.ts` (append; currently exports `combineHoldingLots`)
- Test: `src/__tests__/lib/holdings.test.ts` (exists — add cases)

**Interfaces:**
- Consumes: nothing.
- Produces: `requiresAccountForMove(currentType: "holdings" | "watchlist", targetType: "holdings" | "watchlist"): boolean` — returns `true` only when moving from a watchlist into holdings.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/lib/holdings.test.ts` (import alongside the existing `combineHoldingLots` import — change the import line to `import { combineHoldingLots, requiresAccountForMove } from "@/lib/holdings";`):

```ts
describe("requiresAccountForMove", () => {
  it("requires an account moving watchlist -> holdings", () => {
    expect(requiresAccountForMove("watchlist", "holdings")).toBe(true);
  });
  it("does not require one moving holdings -> holdings (positions carry over)", () => {
    expect(requiresAccountForMove("holdings", "holdings")).toBe(false);
  });
  it("does not require one when the target is a watchlist", () => {
    expect(requiresAccountForMove("watchlist", "watchlist")).toBe(false);
    expect(requiresAccountForMove("holdings", "watchlist")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/holdings.test.ts`
Expected: FAIL — `requiresAccountForMove is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/holdings.ts`:

```ts
/**
 * Whether moving a company into `targetType` from `currentType` must prompt for
 * an account. Only the watchlist -> holdings move needs one: there is no
 * position to carry, so an account is required to create the initial holdings
 * row. Holdings -> holdings carries existing positions (with their own
 * accounts), and watchlist targets hold no positions at all.
 */
export function requiresAccountForMove(
  currentType: "holdings" | "watchlist",
  targetType: "holdings" | "watchlist"
): boolean {
  return currentType === "watchlist" && targetType === "holdings";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/holdings.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/holdings.ts src/__tests__/lib/holdings.test.ts
git commit -m "feat: requiresAccountForMove helper for move-to-holdings gating

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `moveToHoldingsSchema` validation

Validate the position collected by the move dialog: account required, qty/price optional.

**Files:**
- Modify: `src/lib/validations.ts` (add after `companyWithHoldingSchema`)
- Test: `src/__tests__/lib/validations.test.ts` (exists — add a `describe` block)

**Interfaces:**
- Consumes: nothing.
- Produces: `moveToHoldingsSchema` — a Zod schema over `{ account_id?, new_account_label?, quantity?, avg_buy_price? }` that requires an account (existing id OR new label), rejects non-positive `quantity` when present, and rejects negative `avg_buy_price` when present. Parsed type: `{ account_id?: string; new_account_label?: string; quantity?: number; avg_buy_price?: number }`.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/lib/validations.test.ts` (ensure `moveToHoldingsSchema` is added to the existing import from `@/lib/validations`):

```ts
describe("moveToHoldingsSchema", () => {
  const AID = "550e8400-e29b-41d4-a716-446655440001";

  it("accepts an existing account with no qty/price", () => {
    expect(moveToHoldingsSchema.safeParse({ account_id: AID }).success).toBe(true);
  });
  it("accepts a new account label with qty and price", () => {
    const r = moveToHoldingsSchema.safeParse({
      new_account_label: "Father – Groww",
      quantity: 10,
      avg_buy_price: 245.5,
    });
    expect(r.success).toBe(true);
  });
  it("rejects when no account is provided", () => {
    expect(moveToHoldingsSchema.safeParse({ quantity: 10 }).success).toBe(false);
  });
  it("rejects a non-positive quantity", () => {
    expect(moveToHoldingsSchema.safeParse({ account_id: AID, quantity: 0 }).success).toBe(false);
  });
  it("rejects a negative avg price", () => {
    expect(
      moveToHoldingsSchema.safeParse({ account_id: AID, avg_buy_price: -1 }).success
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/validations.test.ts`
Expected: FAIL — `moveToHoldingsSchema` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/validations.ts` immediately after `companyWithHoldingSchema`:

```ts
/**
 * The position collected when moving a company into a Holdings portfolio.
 * Account is mandatory (existing `account_id` or a `new_account_label`);
 * quantity and avg_buy_price are optional and default to 0 when omitted.
 */
export const moveToHoldingsSchema = z
  .object({
    account_id: uuidSchema.optional(),
    new_account_label: z.string().min(1).max(100).optional(),
    quantity: z.number().positive("Quantity must be positive").optional(),
    avg_buy_price: z.number().nonnegative("Average price cannot be negative").optional(),
  })
  .refine((d) => Boolean(d.account_id || d.new_account_label), {
    message: "Account is required",
    path: ["account_id"],
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/validations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations.ts src/__tests__/lib/validations.test.ts
git commit -m "feat: moveToHoldingsSchema for move-to-holdings position

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Extract shared `resolveAccountId` helper

DRY the account create/lookup logic out of `createCompanyWithHolding` so `moveCompany` can reuse it.

**Files:**
- Create: `src/lib/accounts.ts`
- Modify: `src/app/(authenticated)/actions/holdings-actions.ts` (replace the inline account-resolution block in `createCompanyWithHolding`, ~lines 184-200)
- Test: `src/__tests__/lib/create-company-with-holding.test.ts` (exists — must still pass unchanged; it exercises this path)

**Interfaces:**
- Consumes: `SupabaseClient` from `@supabase/supabase-js`.
- Produces: `resolveAccountId(supabase: SupabaseClient, userId: string, input: { account_id?: string | null; new_account_label?: string | null }): Promise<string>` — returns the id of the existing account, or creates a `broker: 'manual'` account from `new_account_label` and returns its id; throws `"Account is required"` when neither is given, and `` `An account named "${label}" already exists` `` on unique-violation (`23505`).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/accounts.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { resolveAccountId } from "@/lib/accounts";

const USER = "user-1";
const AID = "acc-123";

function clientReturningInsert(result: { data?: unknown; error?: unknown }) {
  return {
    from() {
      const b: Record<string, unknown> = {
        insert() { return b; },
        select() { return b; },
        single() { return Promise.resolve(result); },
      };
      return b;
    },
  } as never;
}

describe("resolveAccountId", () => {
  it("returns an existing account id without touching the db", async () => {
    const spy = vi.fn();
    const client = { from: spy } as never;
    await expect(resolveAccountId(client, USER, { account_id: AID })).resolves.toBe(AID);
    expect(spy).not.toHaveBeenCalled();
  });

  it("creates a manual account from a new label", async () => {
    const client = clientReturningInsert({ data: { id: "new-acc" }, error: null });
    await expect(
      resolveAccountId(client, USER, { new_account_label: "  Father – Groww  " })
    ).resolves.toBe("new-acc");
  });

  it("throws a friendly message on duplicate label", async () => {
    const client = clientReturningInsert({ data: null, error: { code: "23505" } });
    await expect(
      resolveAccountId(client, USER, { new_account_label: "Dup" })
    ).rejects.toThrow(/already exists/);
  });

  it("throws when neither id nor label is given", async () => {
    const client = { from: vi.fn() } as never;
    await expect(resolveAccountId(client, USER, {})).rejects.toThrow("Account is required");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/accounts.test.ts`
Expected: FAIL — cannot resolve `@/lib/accounts`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/accounts.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the account id for a manual position: return an existing
 * `account_id`, or create a `broker: 'manual'` account from
 * `new_account_label` and return its id. Throws when neither is provided.
 */
export async function resolveAccountId(
  supabase: SupabaseClient,
  userId: string,
  input: { account_id?: string | null; new_account_label?: string | null }
): Promise<string> {
  if (input.new_account_label) {
    const label = input.new_account_label.trim();
    const { data, error } = await supabase
      .from("accounts")
      .insert({ user_id: userId, label, broker: "manual" })
      .select("id")
      .single();
    if (error) {
      throw new Error(
        (error as { code?: string }).code === "23505"
          ? `An account named "${label}" already exists`
          : (error as { message?: string }).message ?? "Failed to create account"
      );
    }
    return (data as { id: string }).id;
  }
  if (input.account_id) return input.account_id;
  throw new Error("Account is required");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/accounts.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `createCompanyWithHolding` to use the helper**

In `src/app/(authenticated)/actions/holdings-actions.ts`, add the import near the top:

```ts
import { resolveAccountId } from "@/lib/accounts";
```

Replace the account-resolution block (currently step "2. Resolve the account (create it if a new label was given)." — the `let accountId = ...` through the `accountId = acct!.id;` closing brace) with:

```ts
  // 2. Resolve the account (create it if a new label was given).
  const accountId = hasPosition
    ? await resolveAccountId(supabase, user.id, {
        account_id: d.account_id,
        new_account_label: d.new_account_label,
      })
    : null;
```

- [ ] **Step 6: Run the affected suites to verify no regression**

Run: `npm test -- src/__tests__/lib/create-company-with-holding.test.ts src/__tests__/lib/accounts.test.ts`
Expected: PASS (both suites).

- [ ] **Step 7: Commit**

```bash
git add src/lib/accounts.ts src/__tests__/lib/accounts.test.ts "src/app/(authenticated)/actions/holdings-actions.ts"
git commit -m "refactor: extract shared resolveAccountId helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Extend `moveCompany` with position + guard + unlink test

Create the initial holdings row (or reject) when moving into holdings with no carried positions; keep the watchlist unlink and lock it with a test.

**Files:**
- Modify: `src/app/(authenticated)/actions/company-actions.ts` (`moveCompany`, signature + the holdings branch at ~lines 142-215)
- Test: `src/__tests__/lib/move-company.test.ts` (create)

**Interfaces:**
- Consumes: `moveToHoldingsSchema` (Task 2), `resolveAccountId` (Task 3).
- Produces: `moveCompany(companyId: string, targetPortfolioId: string, additionalData?: { notes?: string; position?: { account_id?: string; new_account_label?: string; quantity?: number; avg_buy_price?: number } }): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/move-company.test.ts`. This mock captures inserts/deletes/updates against `holdings` and returns empty results for the research child-copy tables. Source company has NO holdings unless `existingHoldings` is set.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const USER = { id: "user-1" };
const SRC_CO = "co-src";
const TARGET_PID = "550e8400-e29b-41d4-a716-446655440000";
const AID = "550e8400-e29b-41d4-a716-446655440001";
const ISIN = "INE002A01018";

type Op = {
  table: string;
  insert?: Record<string, unknown>;
  update?: Record<string, unknown>;
  delete?: boolean;
  eq: Array<[string, unknown]>;
};

let targetType: "holdings" | "watchlist";
let existingHoldings: number;
let captured: { holdingInserts: Op[]; holdingDeletes: Op[]; holdingUpdates: Op[]; accountInserts: Op[] };

function makeClient() {
  return {
    from(table: string) {
      const op: Op = { table, eq: [] };
      const b: Record<string, unknown> = {
        select() { return b; },
        insert(v: Record<string, unknown>) { op.insert = v; return b; },
        update(v: Record<string, unknown>) { op.update = v; return b; },
        delete() { op.delete = true; return b; },
        eq(c: string, v: unknown) { op.eq.push([c, v]); return b; },
        maybeSingle() { return resolve(); },
        single() { return resolve(); },
        then(f: (x: unknown) => unknown, r?: (e: unknown) => unknown) {
          return Promise.resolve(resolve()).then(f, r);
        },
      };
      function resolve(): { data?: unknown; error?: unknown } {
        if (table === "companies") {
          // source fetch (.single after select.eq), duplicate check (.maybeSingle),
          // and target insert (.single) all land here.
          if (op.insert) return { data: { id: "co-new" }, error: null };
          const isDup = op.eq.some(([c]) => c === "portfolio_id");
          if (isDup) return { data: null }; // no duplicate in target
          return { data: { id: SRC_CO, isin: ISIN, buy_price: null, star_rating: 2 } };
        }
        if (table === "portfolios") return { data: { type: targetType } };
        if (table === "holdings") {
          if (op.insert) { captured.holdingInserts.push(op); return { error: null }; }
          if (op.delete) { captured.holdingDeletes.push(op); return { error: null }; }
          if (op.update) { captured.holdingUpdates.push(op); return { error: null }; }
          // select of source holdings
          return { data: Array.from({ length: existingHoldings }, (_, i) => ({ id: `h${i}` })) };
        }
        if (table === "accounts") { captured.accountInserts.push(op); return { data: { id: "new-acc" }, error: null }; }
        // research child tables copied by moveCompany
        return { data: [] };
      }
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

import { moveCompany } from "@/app/(authenticated)/actions/company-actions";

beforeEach(() => {
  targetType = "holdings";
  existingHoldings = 0;
  captured = { holdingInserts: [], holdingDeletes: [], holdingUpdates: [], accountInserts: [] };
});

describe("moveCompany — into holdings", () => {
  it("creates a zero-qty holding under the chosen account when none carry over", async () => {
    await moveCompany(SRC_CO, TARGET_PID, { position: { account_id: AID } });
    expect(captured.holdingInserts).toHaveLength(1);
    const row = captured.holdingInserts[0].insert!;
    expect(row.account_id).toBe(AID);
    expect(row.company_id).toBe("co-new");
    expect(row.quantity).toBe(0);
    expect(row.avg_buy_price).toBe(0);
    expect(row.source).toBe("manual");
  });

  it("creates a holding with the provided qty and price", async () => {
    await moveCompany(SRC_CO, TARGET_PID, { position: { account_id: AID, quantity: 10, avg_buy_price: 245.5 } });
    const row = captured.holdingInserts[0].insert!;
    expect(row.quantity).toBe(10);
    expect(row.avg_buy_price).toBe(245.5);
  });

  it("rejects when no account is supplied and nothing carries over", async () => {
    await expect(moveCompany(SRC_CO, TARGET_PID, {})).rejects.toThrow(
      "Select an account to move this stock into holdings."
    );
    expect(captured.holdingInserts).toHaveLength(0);
  });

  it("carries existing positions over without prompting for an account", async () => {
    existingHoldings = 2;
    await moveCompany(SRC_CO, TARGET_PID, {});
    expect(captured.holdingUpdates).toHaveLength(1);
    expect(captured.holdingUpdates[0].update).toMatchObject({ company_id: "co-new", portfolio_id: TARGET_PID });
    expect(captured.holdingInserts).toHaveLength(0);
  });
});

describe("moveCompany — out of holdings", () => {
  it("deletes holdings (unlinks the account) when target is a watchlist", async () => {
    targetType = "watchlist";
    existingHoldings = 3;
    await moveCompany(SRC_CO, TARGET_PID, {});
    expect(captured.holdingDeletes).toHaveLength(1);
    expect(captured.holdingDeletes[0].eq).toContainEqual(["company_id", SRC_CO]);
    expect(captured.holdingInserts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/move-company.test.ts`
Expected: FAIL — the zero-qty insert / guard behavior does not exist yet (e.g. `holdingInserts` empty, or no throw).

- [ ] **Step 3: Update the imports and signature**

In `src/app/(authenticated)/actions/company-actions.ts`, add imports near the top (alongside the existing `companyCreateSchema` import):

```ts
import { moveToHoldingsSchema } from "@/lib/validations";
import { resolveAccountId } from "@/lib/accounts";
```

Change the `moveCompany` signature to accept a `position`:

```ts
export async function moveCompany(
  companyId: string,
  targetPortfolioId: string,
  additionalData?: {
    notes?: string;
    position?: {
      account_id?: string;
      new_account_label?: string;
      quantity?: number;
      avg_buy_price?: number;
    };
  }
) {
```

- [ ] **Step 4: Replace the holdings branch**

Replace the block currently reading (step "4b."):

```ts
  // 4b. Move holdings to the target portfolio/company (drop them for a watchlist target).
  if (isWatchlist) {
    await supabase.from("holdings").delete().eq("company_id", companyId);
  } else {
    await supabase
      .from("holdings")
      .update({ company_id: newCompany.id, portfolio_id: targetPortfolioId })
      .eq("company_id", companyId);
  }
```

with:

```ts
  // 4b. Reconcile holdings for the move.
  const { data: sourceHoldings } = await supabase
    .from("holdings")
    .select("id")
    .eq("company_id", companyId);
  const carriesHoldings = (sourceHoldings?.length ?? 0) > 0;

  if (isWatchlist) {
    // Moving out of holdings — unlink by dropping every position.
    await supabase.from("holdings").delete().eq("company_id", companyId);
  } else if (carriesHoldings) {
    // Existing positions move with the stock, keeping their own accounts.
    await supabase
      .from("holdings")
      .update({ company_id: newCompany.id, portfolio_id: targetPortfolioId })
      .eq("company_id", companyId);
  } else {
    // No position to carry — an account is required to create the initial
    // (possibly zero-qty) holding so the company belongs to an account.
    const parsed = moveToHoldingsSchema.safeParse(additionalData?.position ?? {});
    if (!parsed.success) {
      throw new Error("Select an account to move this stock into holdings.");
    }
    const p = parsed.data;
    const accountId = await resolveAccountId(supabase, user.id, {
      account_id: p.account_id,
      new_account_label: p.new_account_label,
    });
    const { error: holdErr } = await supabase.from("holdings").insert({
      user_id: user.id,
      portfolio_id: targetPortfolioId,
      account_id: accountId,
      company_id: newCompany.id,
      isin: source.isin,
      quantity: p.quantity ?? 0,
      avg_buy_price: p.avg_buy_price ?? 0,
      source: "manual",
      import_holding_id: null,
    });
    if (holdErr) throw new Error(holdErr.message);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/move-company.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(authenticated)/actions/company-actions.ts" src/__tests__/lib/move-company.test.ts
git commit -m "feat: moveCompany requires an account for watchlist->holdings moves

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Add the account picker to `MoveStockDialog`

Reveal a Position section (account required, qty/price optional) when moving from a watchlist into holdings, and pass the position to `moveCompany`.

**Files:**
- Modify: `src/components/portfolio/move-stock-dialog.tsx`
- (No unit test — no RTL in repo; gating logic is covered by Task 1's `requiresAccountForMove` test. Verify manually per Step 6.)

**Interfaces:**
- Consumes: `moveCompany` (Task 4 signature), `requiresAccountForMove` (Task 1), `AccountSelect` + `NEW_ACCOUNT` (`src/components/account/account-select.tsx`), `getAccounts` (`src/app/(authenticated)/actions/account-actions.ts`), `Account` type (`@/types/database`).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add imports**

At the top of `src/components/portfolio/move-stock-dialog.tsx`, add:

```ts
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { AccountSelect, NEW_ACCOUNT } from "@/components/account/account-select";
import { getAccounts } from "@/app/(authenticated)/actions/account-actions";
import { requiresAccountForMove } from "@/lib/holdings";
import type { Account } from "@/types/database";
```

(Merge the `useEffect` into the existing `import { useState } from "react";` line so it reads `import { useState, useEffect } from "react";`.)

- [ ] **Step 2: Add state and derive the gate**

Inside the component, after the existing `const [error, setError] = useState<string | null>(null);`, add:

```ts
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [newAccountLabel, setNewAccountLabel] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [avgPrice, setAvgPrice] = useState<string>("");
```

After `const isTargetHoldings = targetPortfolio?.type === "holdings";`, add:

```ts
  const currentType = portfolios.find((p) => p.id === currentPortfolioId)?.type ?? "watchlist";
  const needsAccount =
    !!targetPortfolio && requiresAccountForMove(currentType, targetPortfolio.type);

  useEffect(() => {
    if (open && needsAccount && accounts.length === 0) {
      getAccounts().then(setAccounts).catch(() => {});
    }
  }, [open, needsAccount, accounts.length]);
```

- [ ] **Step 3: Build and pass the position in `handleMove`**

Replace the body of `handleMove` (currently `if (!targetId) return; ... await moveCompany(companyId, targetId); ...`) with:

```ts
  async function handleMove() {
    if (!targetId) return;

    let position:
      | { account_id?: string; new_account_label?: string; quantity?: number; avg_buy_price?: number }
      | undefined;

    if (needsAccount) {
      const accountOk =
        (accountId && accountId !== NEW_ACCOUNT) ||
        (accountId === NEW_ACCOUNT && newAccountLabel.trim());
      if (!accountOk) {
        setError("Account is required");
        return;
      }
      if (quantity && !(Number(quantity) > 0)) {
        setError("Quantity must be positive");
        return;
      }
      if (avgPrice && Number(avgPrice) < 0) {
        setError("Average price cannot be negative");
        return;
      }
      position = {
        ...(accountId === NEW_ACCOUNT
          ? { new_account_label: newAccountLabel.trim() }
          : { account_id: accountId }),
        ...(quantity ? { quantity: Number(quantity) } : {}),
        ...(avgPrice ? { avg_buy_price: Number(avgPrice) } : {}),
      };
    }

    setPending(true);
    setError(null);

    try {
      await moveCompany(companyId, targetId, position ? { position } : undefined);
      invalidate();
      onOpenChange(false);
      onMoved?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to move company";
      setError(message);
    } finally {
      setPending(false);
    }
  }
```

- [ ] **Step 4: Render the Position section**

In the JSX, immediately after the closing `</div>` of the "Target Portfolio" block (before the `<div className="text-xs text-muted-foreground space-y-1">` notes block), insert:

```tsx
          {needsAccount && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="text-sm font-medium">
                Position{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (account required; qty &amp; price can be added later)
                </span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Account *</Label>
                <AccountSelect
                  accounts={accounts}
                  value={accountId}
                  onChange={setAccountId}
                  newLabel={newAccountLabel}
                  onNewLabelChange={setNewAccountLabel}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Quantity</Label>
                  <Input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Avg Buy Price (₹)</Label>
                  <Input
                    value={avgPrice}
                    onChange={(e) => setAvgPrice(e.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 245.50"
                  />
                </div>
              </div>
            </div>
          )}
```

- [ ] **Step 5: Disable the Move button until an account is chosen**

Change the Move button's `disabled` prop from `disabled={pending || !targetId}` to:

```tsx
          <Button
            onClick={handleMove}
            disabled={pending || !targetId || (needsAccount && !accountId)}
          >
```

- [ ] **Step 6: Verify build + lint + full test suite + manual check**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: lint clean, no type errors, all suites PASS.

Manual check (dev server): from a **watchlist** portfolio, open a company's ⋯ → Move, pick a **holdings** target → the Position section appears, Move is disabled until an account is chosen; moving with account-only lands the stock in holdings under that account with a 0 position. From a **holdings** portfolio, moving to a **watchlist** removes it from holdings (no positions remain).

- [ ] **Step 7: Commit**

```bash
git add src/components/portfolio/move-stock-dialog.tsx
git commit -m "feat: prompt for account when moving a stock into holdings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Zero-qty holdings row representation → Task 4 (insert `quantity ?? 0`).
- Account mandatory / qty-price optional → Task 2 schema + Task 5 UI + Task 4 guard.
- `MoveStockDialog` account picker shown for watchlist→holdings → Task 5 (gated by Task 1 helper).
- `moveCompany` position arg + carry-over + guard → Task 4.
- Move-out unlink (holdings→watchlist delete) → Task 4 (kept + tested).
- Shared account-resolution logic → Task 3.
- Tests enumerated in the spec → Tasks 1–4.
- "No migration" and DB `>= 0` constraint → Global Constraints (no migration task).
- Known minor gap (research-only-in-holdings → holdings via server guard) → server guard in Task 4 covers correctness; no inline picker by design.

**Placeholder scan:** No TBD/TODO; every code step shows complete code.

**Type consistency:** `moveCompany(..., { position })` shape matches between Task 4 signature, Task 4 test, and Task 5 caller. `resolveAccountId(supabase, userId, { account_id?, new_account_label? })` matches between Task 3 definition, Task 3 refactor call, and Task 4 call. `requiresAccountForMove(currentType, targetType)` matches between Task 1 and Task 5. `moveToHoldingsSchema` fields match between Task 2 and Task 4 usage.
