"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAccounts, createAccount, updateAccount, deleteAccount } from "@/app/(authenticated)/actions/account-actions";
import type { Account } from "@/types/database";
import { Users, Plus, Loader2, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";

/** Manage broker accounts: rename, delete, and create manual accounts. */
export function AccountsManager({
  onChanged,
  initialAccounts,
}: {
  onChanged?: () => void;
  /** When provided (server-seeded), the on-mount fetch is skipped. */
  initialAccounts?: Account[];
}) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts ?? []);
  const [loading, setLoading] = useState(initialAccounts === undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async function load() {
    setLoading(true);
    try {
      setAccounts(await getAccounts());
    } catch (err) {
      setAccounts([]);
      toastError(err, { message: "Couldn't load your accounts.", retry: load });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip the fetch when the parent already seeded accounts from the server.
    if (initialAccounts === undefined) load();
  }, [load, initialAccounts]);

  // Re-fetch after a successful change (already confirmed to the user). If the
  // refetch itself fails, warn that the list may be stale and offer a retry.
  const refresh = async function refresh() {
    try {
      setAccounts(await getAccounts());
    } catch (err) {
      toastError(err, { message: "The account list may be out of date.", retry: refresh });
    }
    onChanged?.();
  };

  const handleRename = async (id: string) => {
    if (!editLabel.trim()) return;
    setBusy(true);
    const res = await updateAccount(id, { label: editLabel.trim() });
    setBusy(false);
    if (!res.ok) return toastError(res);
    setEditingId(null);
    await refresh();
    toast.success("Account renamed");
  };

  const handleDelete = async (acct: Account) => {
    if (!confirm(`Delete account "${acct.label}"? This removes its holdings from all portfolios.`)) return;
    setBusy(true);
    const res = await deleteAccount(acct.id);
    setBusy(false);
    if (!res.ok) return toastError(res);
    await refresh();
    toast.success("Account deleted");
  };

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    setBusy(true);
    const res = await createAccount({ label: newLabel.trim(), broker: "manual" });
    setBusy(false);
    if (!res.ok) return toastError(res);
    setNewLabel("");
    setShowCreate(false);
    await refresh();
    toast.success("Account created");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Accounts
          </CardTitle>
          {!showCreate && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add account
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading accounts…
          </div>
        ) : accounts.length === 0 && !showCreate ? (
          <p className="text-sm text-muted-foreground py-2">
            No accounts yet. They&rsquo;re created automatically when you import a statement.
          </p>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2">
              {editingId === a.id ? (
                <>
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRename(a.id)}
                    autoFocus
                    className="h-8"
                  />
                  <Button size="icon" variant="ghost" aria-label="Save account name" className="h-8 w-8" disabled={busy} onClick={() => handleRename(a.id)}>
                    <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Cancel editing" className="h-8 w-8" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.label}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {a.broker}
                      {a.client_id ? ` · ${a.client_id}` : ""}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Rename ${a.label}`}
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => {
                      setEditingId(a.id);
                      setEditLabel(a.label);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${a.label}`}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    onClick={() => handleDelete(a)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </>
              )}
            </div>
          ))
        )}

        {showCreate && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <Input
              placeholder="Account label (e.g. Wife – Groww)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
              className="h-8"
            />
            <Button size="sm" disabled={!newLabel.trim() || busy} onClick={handleCreate}>
              {busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowCreate(false);
                setNewLabel("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
