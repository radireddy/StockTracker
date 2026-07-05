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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getAccounts, createAccount, updateAccount, deleteAccount } from "@/app/(authenticated)/actions/account-actions";
import type { Account } from "@/types/database";
import { Users, Plus, Loader2, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";

/** Manage broker accounts: rename, delete, and create manual accounts. */
export function AccountsManager({ onChanged }: { onChanged?: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editBroker, setEditBroker] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newBroker, setNewBroker] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

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
    load();
  }, [load]);

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

  const handleSaveEdit = async (id: string) => {
    if (!editLabel.trim()) return;
    setBusy(true);
    const res = await updateAccount(id, {
      label: editLabel.trim(),
      broker: editBroker.trim() || undefined,
      client_id: editClientId.trim(),
    });
    setBusy(false);
    if (!res.ok) return toastError(res);
    setEditingId(null);
    await refresh();
    toast.success("Account updated");
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const res = await deleteAccount(deleteTarget.id);
    setBusy(false);
    if (!res.ok) return toastError(res);
    setDeleteTarget(null);
    await refresh();
    toast.success("Account deleted");
  };

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    setBusy(true);
    const res = await createAccount({
      label: newLabel.trim(),
      broker: newBroker.trim() || "manual",
      client_id: newClientId.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) return toastError(res);
    setNewLabel("");
    setNewBroker("");
    setNewClientId("");
    setShowCreate(false);
    await refresh();
    toast.success("Account created");
  };

  return (
    <Card className="shadow-soft">
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
            <div key={a.id} className="rounded-md border border-border/60 px-3 py-2">
              {editingId === a.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(a.id)}
                      placeholder="Account label"
                      autoFocus
                      className="h-8"
                    />
                    <Button size="icon" variant="ghost" aria-label="Save account" className="h-8 w-8" disabled={busy} onClick={() => handleSaveEdit(a.id)}>
                      <Check className="h-4 w-4 text-positive" aria-hidden="true" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Cancel editing" className="h-8 w-8" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={editBroker}
                      onChange={(e) => setEditBroker(e.target.value)}
                      placeholder="Broker (e.g. zerodha)"
                      className="h-8"
                    />
                    <Input
                      value={editClientId}
                      onChange={(e) => setEditClientId(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(a.id)}
                      placeholder="Client ID (e.g. AB1234)"
                      className="h-8"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Set the broker + Client ID so imports auto-detect this account.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.label}</p>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        <span className="text-muted-foreground/70">Broker:</span>{" "}
                        <span className="capitalize">{a.broker}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground/70">Client ID:</span>{" "}
                        {a.client_id || "—"}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Rename ${a.label}`}
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => {
                      setEditingId(a.id);
                      setEditLabel(a.label);
                      setEditBroker(a.broker === "manual" ? "" : a.broker);
                      setEditClientId(a.client_id ?? "");
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
                    onClick={() => setDeleteTarget(a)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          ))
        )}

        {showCreate && (
          <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2">
            <Input
              placeholder="Account label (e.g. Wife – Groww)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
              className="h-8"
            />
            <div className="flex items-center gap-2">
              <Input
                placeholder="Broker (e.g. zerodha)"
                value={newBroker}
                onChange={(e) => setNewBroker(e.target.value)}
                className="h-8"
              />
              <Input
                placeholder="Client ID (e.g. AB1234)"
                value={newClientId}
                onChange={(e) => setNewClientId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="h-8"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Set the broker + Client ID so imports auto-detect this account.
            </p>
            <div className="flex items-center gap-2">
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
                  setNewBroker("");
                  setNewClientId("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{deleteTarget?.label}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes its holdings from all portfolios. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
