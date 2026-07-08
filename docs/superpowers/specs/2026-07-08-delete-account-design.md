# Delete Account Feature — Design Spec

**Date:** 2026-07-08
**Status:** Approved

---

## Overview

Permanent, self-service account deletion. The user can trigger deletion from two places: the Settings page and the user dropdown in the app header. A typed-confirmation dialog warns clearly that all data is wiped. On confirm the deletion runs synchronously (≈300–500ms), then the client signs out and redirects to `/`.

---

## Data Deleted

`auth.admin.deleteUser(userId)` is the single deletion call. Everything cascades from it:

| Table | Cascade path |
|---|---|
| `profiles` | `auth.users → profiles` |
| `portfolios` | `auth.users → portfolios` |
| `companies` | `portfolios → companies` |
| `projection_models` | `companies → projection_models` |
| `financial_years` | `companies → financial_years` (also via `projection_models`) |
| `valuation_scenarios` | `companies → valuation_scenarios` (also via `projection_models`) |
| `timeline_entries` | `companies → timeline_entries` |
| `segment_valuations` | `companies → segment_valuations` |
| `market_perceptions` | `companies → market_perceptions` |
| `accounts` | `auth.users → accounts` |
| `holdings` | `auth.users → holdings` (also via `accounts`, `portfolios`) |
| `import_holdings` | `auth.users → import_holdings` |
| `storage.objects` (attachments bucket, `{user_id}/*`) | **Explicitly deleted before DB call** — storage does not cascade |

`holdings.import_holding_id` is `ON DELETE SET NULL` (not cascade), but the `holdings` row itself cascades via `auth.users → holdings`, so no orphan rows survive.

---

## Server Action

**File:** `src/app/(authenticated)/actions/account-delete-actions.ts`

```
deleteAccount() → ActionResult
  1. getAuthUser() — throws if session invalid
  2. createAdminClient() — service-role client
  3. supabase.storage.from('attachments').list(userId) — list user's files
  4. If files exist: supabase.storage.from('attachments').remove(filePaths)
  5. adminClient.auth.admin.deleteUser(userId) — cascades all DB rows
  6. return { success: true }
```

Returns `ActionResult` per project convention (mutations return result objects, don't throw to the caller). On any error, returns `{ success: false, error: message }`.

---

## Confirmation Dialog

**File:** `src/components/settings/delete-account-dialog.tsx`

### Trigger
A `<button variant="destructive" size="sm">Delete Account</button>` that opens the AlertDialog. Used in both Settings and the user dropdown.

### Dialog Content

**Title:** "Permanently delete your account?"

**Warning body:**
> This will immediately and permanently delete everything associated with your account — there is no undo, no recovery, and no grace period.
>
> What gets deleted:
> - All portfolios (holdings and watchlists)
> - All companies, research notes, financial models, and valuations
> - All accounts and holdings data
> - All import history
> - All uploaded files

**Typed confirmation:** An `<Input>` with label "Type DELETE to confirm". The "Delete my account" button is disabled until the input value is exactly `"DELETE"` (case-sensitive).

**Footer buttons:**
- Cancel (closes dialog, resets input)
- "Delete my account" — variant destructive, disabled until input matches, shows spinner + "Deleting…" during the call

### On Confirm Flow
1. Set `deleting = true`
2. `await deleteAccount()`
3. If error: `toastError(result.error)`, reset loading state, keep dialog open
4. If success: `supabase.auth.signOut()` (client-side) → `router.push('/')`

---

## UI Placement

### Settings Page (`src/app/(authenticated)/settings/page.tsx`)
Add a "Danger Zone" `<Card>` at the bottom of the page with `className="border-destructive/30"`:

```
<Card className="border-destructive/30 shadow-soft">
  <CardHeader>
    <CardTitle className="text-destructive">Danger Zone</CardTitle>
  </CardHeader>
  <CardContent className="flex items-center justify-between gap-4">
    <p className="text-sm text-muted-foreground">
      Permanently delete your account and all associated data.
      This action cannot be undone.
    </p>
    <DeleteAccountDialog />
  </CardContent>
</Card>
```

### User Dropdown (`src/components/auth/user-nav.tsx`)
Add above the existing "Sign out" item, with a separator between them:

```
<DropdownMenuSeparator />
<DropdownMenuItem variant="destructive" className="gap-2.5 py-2" onClick={openDeleteDialog}>
  <Trash2 aria-hidden="true" />
  Delete Account
</DropdownMenuItem>
<DropdownMenuSeparator />
<DropdownMenuItem variant="destructive" ...>Sign out</DropdownMenuItem>
```

Because `DeleteAccountDialog` controls its own open state via an AlertDialog, the dropdown item sets a `deleteOpen` boolean state that the `DeleteAccountDialog` accepts as a controlled `open` prop. This way the dialog renders outside the dropdown tree and avoids focus-trap conflicts.

---

## Error Handling

- Storage list/delete failures are non-fatal if files simply don't exist (treat as success).
- Storage deletion failures (network errors) are treated as fatal — surface via toast, abort before calling deleteUser.
- `deleteUser` failure: surface via toast, no partial state (DB untouched).
- If the session expires between the user clicking confirm and the action running: `getAuthUser()` throws → caught → `{ success: false, error: 'Session expired. Please sign in again.' }`.

---

## Out of Scope

- Email confirmation before deletion (not required)
- Grace period / soft delete (not required)
- Admin-side account recovery tooling
