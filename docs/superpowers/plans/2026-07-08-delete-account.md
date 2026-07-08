# Delete Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users permanently delete their account and all associated data from two places — the Settings page and the user dropdown — with a typed-confirmation dialog, synchronous deletion, then sign-out and redirect to `/`.

**Architecture:** A single `deleteAccount()` server action (using the existing admin client) deletes storage files then calls `auth.admin.deleteUser(userId)`, which cascades every user-owned DB row. A shared `DeleteAccountDialog` component handles confirmation in both uncontrolled (Settings) and controlled (dropdown) modes.

**Tech Stack:** Next.js 15 App Router server actions, Supabase admin client, base-ui AlertDialog, Sonner toasts, TypeScript.

## Global Constraints

- Return `ActionResult` (never throw to the client) — import `action`, `AppError`, `ActionResult` from `@/lib/action-result`.
- Surface errors via `toastError(result)` from `@/lib/toast-error`.
- All Supabase admin calls use `createAdminClient()` from `@/lib/supabase/admin`.
- Verification per task: `npm run lint && npm run typecheck` (no unit tests — the action is a thin adapter over the Supabase admin API with no pure logic to isolate).
- Commit messages end with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.

---

### Task 1: `deleteAccount` server action

**Files:**
- Create: `src/app/(authenticated)/actions/account-delete-actions.ts`

**Interfaces:**
- Consumes: `getAuthUser` from `@/lib/supabase/server`, `createAdminClient` from `@/lib/supabase/admin`, `action`, `AppError`, `ActionResult` from `@/lib/action-result`.
- Produces: `deleteAccount(): Promise<ActionResult<void>>` — exported named function, `"use server"`.

- [ ] **Step 1: Create the server action file**

Create `src/app/(authenticated)/actions/account-delete-actions.ts`:

```typescript
"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { action, AppError } from "@/lib/action-result";
import type { ActionResult } from "@/lib/action-result";

export async function deleteAccount(): Promise<ActionResult<void>> {
  return action(async () => {
    const { user } = await getAuthUser();
    const admin = createAdminClient();

    // Delete all storage files for this user before removing the auth row.
    // Storage does not cascade on user delete, so this must be explicit.
    const { data: files, error: listError } = await admin.storage
      .from("attachments")
      .list(user.id);

    if (listError && !listError.message.includes("not found")) {
      throw new AppError(
        "Couldn't remove your uploaded files.",
        "Please try again. If the problem continues, contact support."
      );
    }

    if (files && files.length > 0) {
      const paths = files.map((f) => `${user.id}/${f.name}`);
      const { error: removeError } = await admin.storage
        .from("attachments")
        .remove(paths);

      if (removeError) {
        throw new AppError(
          "Couldn't remove your uploaded files.",
          "Please try again. If the problem continues, contact support."
        );
      }
    }

    // deleteUser cascades: profiles, portfolios → companies → all research children,
    // accounts, holdings, import_holdings.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      throw new AppError(
        "Couldn't delete your account.",
        "Please try again. If the problem continues, contact support."
      );
    }
  });
}
```

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(authenticated\)/actions/account-delete-actions.ts
git commit -m "$(cat <<'EOF'
feat(account): add deleteAccount server action

Deletes storage files then calls auth.admin.deleteUser, cascading all
user-owned rows: profiles, portfolios, companies + research children,
accounts, holdings, import_holdings.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `DeleteAccountDialog` component

**Files:**
- Create: `src/components/settings/delete-account-dialog.tsx`

**Interfaces:**
- Consumes: `deleteAccount` from Task 1.
- Produces: `DeleteAccountDialog({ open?: boolean; onOpenChange?: (open: boolean) => void })` — default export. When `open` is `undefined`, renders its own trigger button (uncontrolled, used in Settings). When `open` is a boolean, omits the trigger and is controlled by the parent (used in user dropdown).

- [ ] **Step 1: Create the dialog component**

Create `src/components/settings/delete-account-dialog.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { toastError } from "@/lib/toast-error";
import { deleteAccount } from "@/app/(authenticated)/actions/account-delete-actions";

interface DeleteAccountDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmation === "DELETE";

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setConfirmation("");
    onOpenChange?.(isOpen);
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      const result = await deleteAccount();
      if (!result.ok) {
        toastError(result);
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
    } finally {
      setDeleting(false);
    }
  };

  const isControlled = open !== undefined;

  return (
    <>
      <AlertDialog open={isControlled ? open : undefined} onOpenChange={handleOpenChange}>
        {!isControlled && (
          <AlertDialogTrigger
            render={<Button variant="destructive" size="sm" className="gap-1.5 shrink-0" />}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Account
          </AlertDialogTrigger>
        )}
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  This will immediately and permanently delete everything associated with
                  your account — there is no undo, no recovery, and no grace period.
                </p>
                <ul className="mt-3 list-disc pl-4 space-y-1 text-left text-sm">
                  <li>All portfolios (holdings and watchlists)</li>
                  <li>All companies, research notes, financial models, and valuations</li>
                  <li>All accounts and holdings data</li>
                  <li>All import history</li>
                  <li>All uploaded files</li>
                </ul>
                <div className="mt-4 space-y-1.5">
                  <Label htmlFor="delete-confirm" className="text-foreground">
                    Type <span className="font-mono font-bold">DELETE</span> to confirm
                  </Label>
                  <Input
                    id="delete-confirm"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    placeholder="DELETE"
                    autoComplete="off"
                    disabled={deleting}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={!canDelete || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {deleting ? "Deleting…" : "Delete my account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/delete-account-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(account): add DeleteAccountDialog with typed confirmation

Shows a full data-deletion warning, requires typing DELETE, then calls
deleteAccount(), signs out, and redirects to /. Supports uncontrolled
(Settings trigger) and controlled (dropdown) open modes.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Settings page — Danger Zone card

**Files:**
- Modify: `src/app/(authenticated)/settings/page.tsx`

**Interfaces:**
- Consumes: `DeleteAccountDialog` from Task 2.
- Produces: A "Danger Zone" card rendered at the bottom of the Settings page.

- [ ] **Step 1: Add the import and Danger Zone card**

In `src/app/(authenticated)/settings/page.tsx`:

Add the import after the existing imports:

```typescript
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
```

Add this card at the very end of the `<div className="mx-auto max-w-2xl space-y-6">`, after `<AccountsManager />`:

```tsx
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

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(authenticated\)/settings/page.tsx
git commit -m "$(cat <<'EOF'
feat(settings): add Danger Zone card with delete account option

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: User dropdown — Delete Account item

**Files:**
- Modify: `src/components/auth/user-nav.tsx`

**Interfaces:**
- Consumes: `DeleteAccountDialog` from Task 2.
- Produces: A "Delete Account" destructive dropdown item that opens `DeleteAccountDialog` in controlled mode (rendered outside the dropdown tree to avoid focus-trap conflicts).

- [ ] **Step 1: Update user-nav.tsx**

In `src/components/auth/user-nav.tsx`, make the following changes:

1. Add `useState` to the React import and add `Trash2` to the lucide import:

```typescript
import { useState } from "react";
// existing: import { LayoutDashboard, Upload, Settings, LogOut } from "lucide-react";
import { LayoutDashboard, Upload, Settings, LogOut, Trash2 } from "lucide-react";
```

2. Add the import for `DeleteAccountDialog` after the existing imports:

```typescript
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
```

3. Inside the `UserNav` component body, add state for the dialog:

```typescript
const [deleteOpen, setDeleteOpen] = useState(false);
```

4. Inside the `DropdownMenuContent`, add the Delete Account item between the `<ThemeToggle />` separator and the final Sign out separator. The section currently looks like:

```tsx
<DropdownMenuSeparator />

<ThemeToggle />

<DropdownMenuSeparator />

<DropdownMenuItem
  variant="destructive"
  className="gap-2.5 py-2"
  onClick={handleSignOut}
>
  <LogOut aria-hidden="true" />
  Sign out
</DropdownMenuItem>
```

Replace with:

```tsx
<DropdownMenuSeparator />

<ThemeToggle />

<DropdownMenuSeparator />

<DropdownMenuItem
  variant="destructive"
  className="gap-2.5 py-2"
  onClick={() => setDeleteOpen(true)}
>
  <Trash2 aria-hidden="true" />
  Delete Account
</DropdownMenuItem>

<DropdownMenuSeparator />

<DropdownMenuItem
  variant="destructive"
  className="gap-2.5 py-2"
  onClick={handleSignOut}
>
  <LogOut aria-hidden="true" />
  Sign out
</DropdownMenuItem>
```

5. After the closing `</DropdownMenu>` tag (at the end of the return), render the controlled dialog:

```tsx
    </DropdownMenu>
    <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
  );
```

The full updated return should end with:

```tsx
  return (
    <>
      <DropdownMenu>
        {/* ... existing content ... */}
      </DropdownMenu>
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
```

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/user-nav.tsx
git commit -m "$(cat <<'EOF'
feat(nav): add Delete Account item to user dropdown

Opens DeleteAccountDialog in controlled mode outside the dropdown tree
to avoid focus-trap conflicts with the confirmation input.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Manual Verification Checklist

After all tasks are complete, verify end-to-end in the browser:

- [ ] Settings page shows "Danger Zone" card at the bottom with a red-bordered card
- [ ] Clicking "Delete Account" in Settings opens the confirmation dialog
- [ ] The warning lists all 5 data categories
- [ ] "Delete my account" button is disabled until exactly `DELETE` is typed (case-sensitive)
- [ ] Cancel closes the dialog and clears the input
- [ ] User dropdown shows "Delete Account" above "Sign out" with a separator between them
- [ ] Clicking "Delete Account" in the dropdown opens the same confirmation dialog
- [ ] On confirm, the button shows "Deleting…" with a spinner
- [ ] After deletion completes: user is signed out and lands on the home page `/`
- [ ] Attempting to sign back in with the deleted account fails (account no longer exists in Supabase)
