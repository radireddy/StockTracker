# Accounts in Settings + Account Linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all account management under Settings, let manual accounts carry a broker identity, and stop imports from silently creating duplicate accounts by adding a pre-flight detect + link step.

**Architecture:** Pure, unit-testable helpers in `src/lib` (account normalization, matching, backfill decision, statement parsing) wired thinly into server actions, an API route, and React components. Import gains a `select → review → importing → done` flow; a new parse-only detect endpoint feeds the review screen.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase, Tailwind v4, Vitest (jsdom), Zod.

## Global Constraints

- Mutations return `ActionResult` (`action()` wrapper) and use `AppError` / `describeDbError`; reads throw. (`src/lib/action-result.ts`)
- Tests live in `src/__tests__/`, mirror source paths, run with Vitest. `@` → `src` alias. Coverage thresholds are 95% (config `vitest.config.ts`).
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- No DB migration. Reuse `accounts.broker`, `accounts.client_id`, and the partial-unique index `(user_id, broker, client_id) WHERE client_id IS NOT NULL`.
- Account is still **required** for holdings companies/positions — only inline *creation* is removed, not selection.
- base-ui is used for Select elsewhere, but `AccountSelect` uses a native `<select>` — keep it native.

## Files Touched

- `src/lib/accounts.ts` — add `buildAccountUpdate`, `matchAccount`, `shouldBackfillClientId`, `classifyDetection` (Create-adjacent, pure).
- `src/lib/import/parse-statement.ts` — **new**: shared file-validate-and-parse helper.
- `src/app/(authenticated)/actions/account-actions.ts` — `updateAccount` accepts `broker`/`client_id`.
- `src/components/account/accounts-manager.tsx` — create/edit forms gain Broker + Client ID.
- `src/app/(authenticated)/settings/page.tsx` — mount Accounts card.
- `src/app/(authenticated)/import/page.tsx` — remove AccountsManager; add review phase.
- `src/components/account/account-select.tsx` — select-only + empty state.
- `src/components/company/company-form.tsx`, `src/components/company/holdings-tab.tsx`, `src/components/portfolio/move-stock-dialog.tsx` — drop inline creation.
- `src/app/api/import/detect/route.ts` — **new**: parse-only detect endpoint.
- `src/app/api/import/route.ts` — link + backfill on explicit account.
- Tests under `src/__tests__/`.

---

### Task 1: Account helper functions (pure logic)

**Files:**
- Modify: `src/lib/accounts.ts`
- Test: `src/__tests__/lib/accounts.test.ts`

**Interfaces:**
- Produces:
  - `buildAccountUpdate(input: { label?: string; broker?: string; client_id?: string; pan_number?: string; mobile?: string }): Record<string, string | null>` — trims values; `client_id`/`pan_number`/`mobile` empty → `null`; `broker` empty → omitted (don't null a NOT-NULL-ish column); only includes keys present in input.
  - `matchAccount(accounts: Array<{ id: string; label: string; broker: string; client_id: string | null }>, broker: string, clientId: string | null): { id: string; label: string } | null` — exact `(broker, client_id)` match; returns null when `clientId` is null/empty or no match.
  - `shouldBackfillClientId(account: { client_id: string | null }, clientId: string | null): boolean` — true only when `account.client_id` is null/empty AND `clientId` is a non-empty string.
  - `classifyDetection(input: { clientId: string | null; matchedAccountId: string | null }): "matched" | "unmatched" | "no-client-id"` — `matchedAccountId` → "matched"; else non-empty `clientId` → "unmatched"; else "no-client-id".

- [ ] **Step 1: Write failing tests**

Append to `src/__tests__/lib/accounts.test.ts`:

```ts
import {
  buildAccountUpdate,
  matchAccount,
  shouldBackfillClientId,
  classifyDetection,
} from "@/lib/accounts";

describe("buildAccountUpdate", () => {
  it("trims label and includes only provided keys", () => {
    expect(buildAccountUpdate({ label: "  My Zerodha  " })).toEqual({ label: "My Zerodha" });
  });
  it("nulls empty client_id/pan/mobile", () => {
    expect(buildAccountUpdate({ client_id: "  ", pan_number: "", mobile: "" })).toEqual({
      client_id: null,
      pan_number: null,
      mobile: null,
    });
  });
  it("keeps a real client_id and omits empty broker", () => {
    expect(buildAccountUpdate({ client_id: " AB1234 ", broker: "  " })).toEqual({ client_id: "AB1234" });
  });
});

describe("matchAccount", () => {
  const accts = [
    { id: "a1", label: "My Zerodha", broker: "zerodha", client_id: "AB1234" },
    { id: "a2", label: "Manual", broker: "manual", client_id: null },
  ];
  it("matches on broker + client_id", () => {
    expect(matchAccount(accts, "zerodha", "AB1234")).toEqual({ id: "a1", label: "My Zerodha" });
  });
  it("returns null with no client id", () => {
    expect(matchAccount(accts, "zerodha", null)).toBeNull();
  });
  it("returns null when no account matches", () => {
    expect(matchAccount(accts, "zerodha", "ZZ0000")).toBeNull();
  });
});

describe("shouldBackfillClientId", () => {
  it("true when account has no client id and a client id is given", () => {
    expect(shouldBackfillClientId({ client_id: null }, "AB1234")).toBe(true);
  });
  it("false when account already has a client id", () => {
    expect(shouldBackfillClientId({ client_id: "AA1111" }, "AB1234")).toBe(false);
  });
  it("false when no client id given", () => {
    expect(shouldBackfillClientId({ client_id: null }, null)).toBe(false);
  });
});

describe("classifyDetection", () => {
  it("matched when an account id is present", () => {
    expect(classifyDetection({ clientId: "AB1234", matchedAccountId: "a1" })).toBe("matched");
  });
  it("unmatched when client id present but no match", () => {
    expect(classifyDetection({ clientId: "AB1234", matchedAccountId: null })).toBe("unmatched");
  });
  it("no-client-id when client id missing", () => {
    expect(classifyDetection({ clientId: null, matchedAccountId: null })).toBe("no-client-id");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- accounts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/accounts.ts`:

```ts
/** Build a normalized `accounts` update object from form input (trim; empty → null). */
export function buildAccountUpdate(input: {
  label?: string;
  broker?: string;
  client_id?: string;
  pan_number?: string;
  mobile?: string;
}): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (input.label !== undefined) out.label = input.label.trim();
  if (input.broker !== undefined && input.broker.trim()) out.broker = input.broker.trim();
  if (input.client_id !== undefined) out.client_id = input.client_id.trim() || null;
  if (input.pan_number !== undefined) out.pan_number = input.pan_number.trim() || null;
  if (input.mobile !== undefined) out.mobile = input.mobile.trim() || null;
  return out;
}

/** Find the account matching a statement's (broker, client_id). Null when no client id or no match. */
export function matchAccount(
  accounts: Array<{ id: string; label: string; broker: string; client_id: string | null }>,
  broker: string,
  clientId: string | null
): { id: string; label: string } | null {
  if (!clientId) return null;
  const hit = accounts.find((a) => a.broker === broker && a.client_id === clientId);
  return hit ? { id: hit.id, label: hit.label } : null;
}

/** Backfill a linked account's client_id only when it has none and the statement provides one. */
export function shouldBackfillClientId(account: { client_id: string | null }, clientId: string | null): boolean {
  return !account.client_id && !!clientId;
}

/** Classify a detected statement for the import review screen. */
export function classifyDetection(input: {
  clientId: string | null;
  matchedAccountId: string | null;
}): "matched" | "unmatched" | "no-client-id" {
  if (input.matchedAccountId) return "matched";
  if (input.clientId) return "unmatched";
  return "no-client-id";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- accounts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounts.ts src/__tests__/lib/accounts.test.ts
git commit -m "feat(accounts): pure helpers for update/match/backfill/classify

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `updateAccount` accepts broker + client_id

**Files:**
- Modify: `src/app/(authenticated)/actions/account-actions.ts:72-105`

**Interfaces:**
- Consumes: `buildAccountUpdate` (Task 1).
- Produces: `updateAccount(id, input: { label?; broker?; client_id?; pan_number?; mobile? }): Promise<ActionResult<Account>>`.

- [ ] **Step 1: Replace the update body to use `buildAccountUpdate` and validate**

In `src/app/(authenticated)/actions/account-actions.ts`, add the import:

```ts
import { buildAccountUpdate } from "@/lib/accounts";
```

Replace the `updateAccount` signature + `updateData` block:

```ts
export async function updateAccount(
  id: string,
  input: { label?: string; broker?: string; client_id?: string; pan_number?: string; mobile?: string }
): Promise<ActionResult<Account>> {
  return action(async () => {
    const { supabase } = await getAuthUser();

    const parsed = accountSchema.partial().safeParse(input);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0].message, "Correct the highlighted fields and try again.");
    }

    const updateData = buildAccountUpdate(input);
    if (Object.keys(updateData).length === 0) {
      throw new AppError("Nothing to update.", "Change a field and try again.");
    }

    const { data, error } = await supabase
      .from("accounts")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        const dupClientId = updateData.client_id != null;
        throw new AppError(
          dupClientId
            ? "Another account already uses that Client ID for this broker."
            : `An account named "${input.label}" already exists.`,
          dupClientId ? "Client IDs must be unique per broker." : "Choose a different account name."
        );
      }
      log.error("updateAccount failed", { error: error.message, id });
      throw describeDbError(error, "Couldn't update the account.");
    }

    revalidatePath("/");
    return data as Account;
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(authenticated)/actions/account-actions.ts"
git commit -m "feat(accounts): updateAccount accepts broker + client_id with dup-safe errors

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: AccountsManager — Broker + Client ID fields

**Files:**
- Modify: `src/components/account/accounts-manager.tsx`

**Interfaces:**
- Consumes: `createAccount`, `updateAccount` (accept `broker`, `client_id`).

- [ ] **Step 1: Add broker + client_id to create and edit state and forms**

In `accounts-manager.tsx`, extend the create form (currently only `newLabel`) with `newBroker` and `newClientId` state, and the edit form (currently `editLabel`) with `editBroker`/`editClientId`. Render two extra inputs in both the create block (`showCreate`) and the inline edit block:

```tsx
// create state
const [newBroker, setNewBroker] = useState("");
const [newClientId, setNewClientId] = useState("");
// edit state
const [editBroker, setEditBroker] = useState("");
const [editClientId, setEditClientId] = useState("");
```

Update `handleCreate` to pass the new fields:

```tsx
const res = await createAccount({
  label: newLabel.trim(),
  broker: newBroker.trim() || "manual",
  client_id: newClientId.trim() || undefined,
});
```

Update `handleRename` (rename to `handleSaveEdit`) to send broker + client_id:

```tsx
const res = await updateAccount(id, {
  label: editLabel.trim(),
  broker: editBroker.trim() || undefined,
  client_id: editClientId.trim(),
});
```

When entering edit mode, seed the fields from the account:

```tsx
onClick={() => {
  setEditingId(a.id);
  setEditLabel(a.label);
  setEditBroker(a.broker === "manual" ? "" : a.broker);
  setEditClientId(a.client_id ?? "");
}}
```

Add the inputs to the create block (below the label input) and the edit block, with a short helper caption:

```tsx
<Input placeholder="Broker (e.g. zerodha)" value={newBroker} onChange={(e) => setNewBroker(e.target.value)} className="h-8" />
<Input placeholder="Client ID (e.g. AB1234)" value={newClientId} onChange={(e) => setNewClientId(e.target.value)} className="h-8" />
```

(For edit, bind to `editBroker`/`editClientId`.) Add a caption under the create block:

```tsx
<p className="text-xs text-muted-foreground">
  Set the broker + Client ID to have imports auto-detect this account.
</p>
```

- [ ] **Step 2: Verify build + typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/account/accounts-manager.tsx
git commit -m "feat(accounts): edit broker + client ID in AccountsManager

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Move AccountsManager to Settings; remove from Import

**Files:**
- Modify: `src/app/(authenticated)/settings/page.tsx`
- Modify: `src/app/(authenticated)/import/page.tsx`

- [ ] **Step 1: Add Accounts card to Settings**

In `settings/page.tsx`, add the import and a card after the Portfolios card. `AccountsManager` is a client component with its own card chrome, so mount it directly (not inside another `<Card>`):

```tsx
import { AccountsManager } from "@/components/account/accounts-manager";
```

```tsx
      <AccountsManager />
```

(Place it as the last child inside the `max-w-2xl` wrapper, after the Portfolios `<Card>`.)

- [ ] **Step 2: Remove AccountsManager from Import**

In `import/page.tsx`:
- Delete the import line `import { AccountsManager } from "@/components/account/accounts-manager";`.
- Delete the `<AccountsManager onChanged={...} />` mount (around line 352).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (no unused-import errors).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(authenticated)/settings/page.tsx" "src/app/(authenticated)/import/page.tsx"
git commit -m "feat(accounts): manage accounts under Settings, not Import

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: AccountSelect — select-only + empty state

**Files:**
- Modify: `src/components/account/account-select.tsx`

**Interfaces:**
- Produces: `AccountSelect({ accounts, value, onChange, className?, id? })` — no more `NEW_ACCOUNT` export, no `newLabel`/`onNewLabelChange`. When `accounts.length === 0`, renders a Settings link instead of a select.

- [ ] **Step 1: Rewrite AccountSelect select-only**

Replace the file body with:

```tsx
"use client";

import Link from "next/link";
import type { Account } from "@/types/database";

/**
 * Controlled account picker: choose an existing account. Accounts are created
 * only in Settings; when the user has none, this points them there.
 */
export function AccountSelect({
  accounts,
  value,
  onChange,
  className,
  id,
}: {
  accounts: Account[];
  value: string; // "" | <account id>
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No accounts yet.{" "}
        <Link href="/settings" className="text-primary underline underline-offset-2">
          Add one in Settings
        </Link>
        .
      </p>
    );
  }
  return (
    <select
      id={id}
      aria-label="Account"
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
    </select>
  );
}
```

- [ ] **Step 2: Typecheck (expect consumer errors — fixed in Task 6)**

Run: `npx tsc --noEmit`
Expected: errors in `company-form.tsx`, `holdings-tab.tsx`, `move-stock-dialog.tsx` referencing `NEW_ACCOUNT` / removed props. That's expected — Task 6 fixes them. Do NOT commit yet; combine with Task 6.

---

### Task 6: Remove inline creation from all consumers

**Files:**
- Modify: `src/components/company/company-form.tsx`
- Modify: `src/components/company/holdings-tab.tsx`
- Modify: `src/components/portfolio/move-stock-dialog.tsx`

**Interfaces:**
- Consumes: `AccountSelect` (select-only, Task 5).

- [ ] **Step 1: company-form.tsx**

- Change import to `import { AccountSelect } from "@/components/account/account-select";` (drop `NEW_ACCOUNT`).
- Remove `newAccountLabel` state and `onNewLabelChange`/`newLabel` props on `<AccountSelect>`.
- Replace the account-required check:

```tsx
const accountOk = !!accountId; // a real account id must be selected
if (isHoldings && !accountOk) {
  toast.error("Account is required.", { description: "Select an account, or add one in Settings." });
  return;
}
```

- Remove the `if (accountId === NEW_ACCOUNT) fd.set("new_account_label", ...)` branch; always `fd.set("account_id", accountId)`.

- [ ] **Step 2: holdings-tab.tsx**

- Change import to drop `NEW_ACCOUNT`; drop unused `createAccount` from the actions import.
- Remove `newAccountLabel` state and the `NEW_ACCOUNT` branch in the add handler; the guard becomes:

```tsx
if (!addAccountId) {
  toast.error("Select an account.", { description: "Choose which account this holding belongs to, or add one in Settings." });
  return;
}
const accountId = addAccountId;
```

- Remove the `<AccountSelect>` `newLabel`/`onNewLabelChange` props.

- [ ] **Step 3: move-stock-dialog.tsx**

- Drop `NEW_ACCOUNT` from the import.
- Remove `newAccountLabel` state, the `NEW_ACCOUNT` branch building `new_account_label`, and the `newLabel`/`onNewLabelChange` props.
- The account payload becomes `account_id: accountId` only; the submit-disabled check becomes `!accountId`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Update tests referencing NEW_ACCOUNT / inline creation**

Run: `grep -rn "NEW_ACCOUNT\|new_account_label" src/__tests__` and update or remove any assertions that expect inline creation in these components. (`resolveAccountId` tests stay — the server helper is unchanged.)

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit (Tasks 5 + 6 together)**

```bash
git add src/components/account/account-select.tsx src/components/company/company-form.tsx src/components/company/holdings-tab.tsx src/components/portfolio/move-stock-dialog.tsx src/__tests__
git commit -m "feat(accounts): select-only account picker; create only in Settings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Shared statement parse helper

**Files:**
- Create: `src/lib/import/parse-statement.ts`
- Modify: `src/app/api/import/route.ts:54-100` (use the helper)

**Interfaces:**
- Produces:
  - `type ParsedStatement = { ok: true; adapter: BrokerAdapter; parseResult: HoldingsParseResult } | { ok: false; status: number; error: string }`
  - `parseStatementBuffer(buffer: ArrayBuffer, brokerHint: BrokerType | null): ParsedStatement` — runs the zip-magic check, size check, adapter detection, parse, empty-holdings check, and the `MAX_HOLDINGS_PER_IMPORT` check; returns a discriminated result. (Pull the exact checks currently inline in `route.ts` lines 54–100.) The adapter type is `BrokerAdapter` (exported from `src/lib/import/types.ts:48`).

- [ ] **Step 1: Create the helper**

Create `src/lib/import/parse-statement.ts` moving the existing validation/parse logic out of `route.ts` (zip magic bytes, 5MB size cap, `detectBroker`/`getBrokerAdapter`, `adapter.parse`, empty check, `MAX_HOLDINGS_PER_IMPORT`). Return `{ ok: false, status, error }` for each failure and `{ ok: true, adapter, parseResult }` on success. Import types from `./types` and `./broker-registry`. Use the `BrokerAdapter` type from `./types` (confirm its exact export name; if it is `HoldingsBrokerAdapter`, use that).

- [ ] **Step 2: Use it in POST /api/import**

Replace lines 54–100 of `route.ts` with:

```ts
const buffer = await file.arrayBuffer();
const parsed = parseStatementBuffer(buffer, brokerHint);
if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
const { adapter, parseResult } = parsed;
```

Add `import { parseStatementBuffer } from "@/lib/import/parse-statement";`.

- [ ] **Step 3: Typecheck + test**

Run: `npx tsc --noEmit && npm test -- import`
Expected: no type errors; existing import tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/import/parse-statement.ts "src/app/api/import/route.ts"
git commit -m "refactor(import): extract shared statement parse/validate helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Detect endpoint

**Files:**
- Create: `src/app/api/import/detect/route.ts`

**Interfaces:**
- Consumes: `parseStatementBuffer` (Task 7), `matchAccount` (Task 1).
- Produces: `POST /api/import/detect` → `{ results: DetectResult[] }` where
  `DetectResult = { file_name: string; broker: string | null; client_id: string | null; statement_date: string | null; stock_count: number; matched_account: { id: string; label: string } | null; parse_error: string | null }`.

- [ ] **Step 1: Implement the route (parse-only, no writes)**

Create `src/app/api/import/detect/route.ts`:

```ts
import { getAuthUserOrNull } from "@/lib/supabase/server";
import { parseStatementBuffer } from "@/lib/import/parse-statement";
import { matchAccount } from "@/lib/accounts";
import { type BrokerType } from "@/lib/import/types";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, RATE_LIMITS.import);
  if (!rl.success) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const brokerHint = (formData.get("broker") as BrokerType | null) ?? null;
  if (files.length === 0) return NextResponse.json({ error: "No files provided" }, { status: 400 });

  const { data: accounts } = await supabase.from("accounts").select("id, label, broker, client_id");
  const accountList = (accounts ?? []) as Array<{ id: string; label: string; broker: string; client_id: string | null }>;

  const results = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const parsed = parseStatementBuffer(buffer, brokerHint);
    if (!parsed.ok) {
      results.push({ file_name: file.name, broker: null, client_id: null, statement_date: null, stock_count: 0, matched_account: null, parse_error: parsed.error });
      continue;
    }
    const broker = parsed.adapter.broker;
    const clientId = parsed.parseResult.metadata.client_id;
    results.push({
      file_name: file.name,
      broker,
      client_id: clientId,
      statement_date: parsed.parseResult.metadata.statement_date,
      stock_count: parsed.parseResult.holdings.length,
      matched_account: matchAccount(accountList, broker, clientId),
      parse_error: null,
    });
  }

  return NextResponse.json({ results });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Adjust `getAll("files")` field name to whatever the import page sends in Task 9 — keep them consistent.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/import/detect/route.ts"
git commit -m "feat(import): parse-only detect endpoint for account matching

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Import page review phase

**Files:**
- Modify: `src/app/(authenticated)/import/page.tsx`

**Interfaces:**
- Consumes: `POST /api/import/detect`, `getAccounts`, `classifyDetection`.
- Per-file resolution passed to commit: `{ mode: "matched" | "create" | "link"; accountId?: string; accountLabel?: string }`.

- [ ] **Step 1: Add phase + detect fetch**

- Extend `type Phase = "select" | "review" | "importing" | "done";`.
- Add state: `detections: DetectResult[]`, `resolutions: Record<string, Resolution>` keyed by file name, `accounts: Account[]` (fetched via `getAccounts`).
- Change the primary select-phase button from opening the AlertDialog directly to a **Continue** handler that POSTs all files to `/api/import/detect` (field name `files`), stores results, seeds default resolutions (matched→matched, unmatched→create with default label `${client_id} (${broker displayName})`, no-client-id→link/unset), and sets phase to `review`.

- [ ] **Step 2: Render the review list**

For each detection render a row:
- `parse_error` → red text, excluded from commit.
- `matched` → "→ will update **{matched_account.label}**".
- `unmatched` → radio: "Create new account" (editable label input, default `${client_id} (${broker})`) vs "Link to existing" (a `<select>` of `accounts`).
- `no-client-id` → required `<select>` of `accounts` (mode `link`); commit blocked until chosen.

Keep the existing "replace can't be undone" copy near the commit button. Commit button disabled until every non-error row is resolved (every `unmatched`/`no-client-id` link row has an `accountId`).

- [ ] **Step 3: Wire commit to send resolution per file**

Update `importOne(file)` to append the resolution to the FormData:
- `link` → `formData.append("account_id", resolution.accountId)`.
- `create` → `formData.append("account_label", resolution.accountLabel)` (no account_id).
- `matched` → send nothing extra (server re-matches by client_id).

- [ ] **Step 4: Typecheck + manual smoke (dev server)**

Run: `npx tsc --noEmit`
Then `npm run dev` and confirm the select → review → import flow renders (link + create options appear for an unmatched file). Record what you observed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(authenticated)/import/page.tsx"
git commit -m "feat(import): review step to link or create accounts before writing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Commit route — link + backfill client_id

**Files:**
- Modify: `src/app/api/import/route.ts:110-147`

**Interfaces:**
- Consumes: `shouldBackfillClientId` (Task 1).

- [ ] **Step 1: Backfill on explicit-account link**

In the `explicitAccountId` branch of `POST /api/import`, select `client_id` as well, and after resolving the account, backfill when appropriate:

```ts
if (explicitAccountId) {
  const { data: acct, error } = await supabase
    .from("accounts")
    .select("id, label, client_id")
    .eq("id", explicitAccountId)
    .single();
  if (error || !acct) return NextResponse.json({ error: "Selected account not found" }, { status: 404 });
  accountId = acct.id;
  accountLabel = acct.label;

  if (shouldBackfillClientId(acct, clientId)) {
    const { error: upErr } = await supabase
      .from("accounts")
      .update({ broker, client_id: clientId })
      .eq("id", accountId);
    if (upErr && upErr.code === "23505") {
      return NextResponse.json(
        { error: "Another account already uses that Client ID for this broker. Rename or merge before linking." },
        { status: 409 }
      );
    }
    if (upErr) return NextResponse.json({ error: `Failed to link account: ${upErr.message}` }, { status: 500 });
  }
}
```

Add `import { shouldBackfillClientId } from "@/lib/accounts";`.

- [ ] **Step 2: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: no errors; suite passes.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/import/route.ts"
git commit -m "feat(import): backfill client_id when linking a statement to an account

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Full verification

- [ ] **Step 1: Lint, typecheck, test, build**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: all pass. Fix any coverage regressions (thresholds 95%) by adding tests for new pure logic.

- [ ] **Step 2: Manual end-to-end (dev)**

With `npm run dev`:
1. Settings → Accounts: create "My Zerodha", edit it to broker `zerodha` + client ID from your test statement.
2. Import that statement → review shows "will update My Zerodha" (matched).
3. Create a fresh manual account with no client ID; import a *different* statement → review shows unmatched → choose "Link to existing" → after import, verify that account now carries the client ID (re-import → matched).
4. Company → new / Holdings tab / Move stock: confirm no "+ New account…" option; empty state links to Settings when no accounts exist.

Record observations. No commit (verification only).

---

## Self-Review

**Spec coverage:**
- Part 1 (Settings) → Tasks 3, 4. ✓
- Part 2 (editable broker/client_id) → Tasks 1, 2, 3. ✓
- Part 3 (remove inline creation) → Tasks 5, 6. ✓
- Part 4 (detect + link + backfill) → Tasks 1, 7, 8, 9, 10. ✓

**Type consistency:** `matchAccount`/`shouldBackfillClientId`/`classifyDetection`/`buildAccountUpdate` signatures defined in Task 1 are used verbatim in Tasks 2, 8, 10. `DetectResult` shape defined in Task 8 is consumed in Task 9. `parseStatementBuffer` result shape defined in Task 7 is consumed in Tasks 8 and the POST route.

**Confirmed:** the adapter type is `BrokerAdapter` (`src/lib/import/types.ts:48`), used in Task 7's helper.
