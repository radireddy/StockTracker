"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getHoldingsForCompany,
  addHolding,
  updateHolding,
  deleteHolding,
} from "@/app/(authenticated)/actions/holdings-actions";
import { getAccounts, createAccount } from "@/app/(authenticated)/actions/account-actions";
import type { Holding, Account } from "@/types/database";
import { Pencil, Trash2, Check, X, Plus, Loader2, Info } from "lucide-react";
import { AccountSelect, NEW_ACCOUNT } from "@/components/account/account-select";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";

const fmt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

/**
 * Per-account holdings for a single company. All edits are account-scoped
 * (add / change quantity / remove); there is no consolidated-level editing.
 * A statement reimport for an account replaces its rows here.
 */
export function HoldingsTab({
  companyId,
  portfolioId,
  isin,
}: {
  companyId: string;
  portfolioId: string;
  isin: string;
}) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [addAccountId, setAddAccountId] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addPrice, setAddPrice] = useState("");

  const refresh = useCallback(function refresh() {
    setLoading(true);
    Promise.all([getHoldingsForCompany(companyId), getAccounts()])
      .then(([h, a]) => {
        setHoldings(h);
        setAccounts(a);
      })
      .catch((err) => {
        setHoldings([]);
        setAccounts([]);
        toastError(err, { message: "Couldn't load holdings for this stock.", retry: refresh });
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    // On-mount / companyId-change data fetch; setState inside refresh is the
    // intended effect behaviour, not a cascading-render bug.
    refresh();
  }, [refresh]);

  const totalQty = holdings.reduce((s, h) => s + h.quantity, 0);
  const totalCost = holdings.reduce((s, h) => s + h.quantity * h.avg_buy_price, 0);
  const weightedAvg = totalQty > 0 ? totalCost / totalQty : 0;

  // A holding this account already has for this stock. Adding to it merges the
  // new lot in (quantity summed, avg buy price recalculated as a weighted avg).
  const existingLot =
    addAccountId && addAccountId !== NEW_ACCOUNT
      ? holdings.find((h) => h.account_id === addAccountId) ?? null
      : null;

  const handleUpdate = async (id: string) => {
    const qty = parseFloat(editQty);
    const price = parseFloat(editPrice);
    if (isNaN(qty) || isNaN(price)) {
      toast.error("Enter a valid quantity and average price.", {
        description: "Both fields must be numbers.",
      });
      return;
    }
    setBusy(true);
    const res = await updateHolding(id, { quantity: qty, avg_buy_price: price });
    setBusy(false);
    if (!res.ok) return toastError(res);
    setEditingId(null);
    refresh();
    toast.success("Holding updated");
  };

  const handleDelete = async (h: Holding) => {
    if (!confirm(`Remove this stock from ${h.accounts?.label ?? "this account"}?`)) return;
    setBusy(true);
    const res = await deleteHolding(h.id);
    setBusy(false);
    if (!res.ok) return toastError(res);
    refresh();
    toast.success("Holding removed");
  };

  const handleAdd = async () => {
    const qty = parseFloat(addQty);
    const price = parseFloat(addPrice);
    if (isNaN(qty) || isNaN(price)) {
      toast.error("Enter a valid quantity and average price.", {
        description: "Both fields must be numbers.",
      });
      return;
    }

    let accountId = addAccountId;
    if (accountId === NEW_ACCOUNT && !newAccountLabel.trim()) {
      toast.error("Enter a name for the new account.", { description: "The account needs a label." });
      return;
    }
    if (!accountId) {
      toast.error("Select an account.", { description: "Choose which account this holding belongs to." });
      return;
    }

    setBusy(true);
    if (accountId === NEW_ACCOUNT) {
      const created = await createAccount({ label: newAccountLabel.trim(), broker: "manual" });
      if (!created.ok) {
        setBusy(false);
        return toastError(created);
      }
      accountId = created.data.id;
    }
    const res = await addHolding(portfolioId, { account_id: accountId, isin, quantity: qty, avg_buy_price: price });
    setBusy(false);
    if (!res.ok) return toastError(res);
    setShowAdd(false);
    setAddAccountId("");
    setNewAccountLabel("");
    setAddQty("");
    setAddPrice("");
    refresh();
    toast.success("Holding added");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Holdings by account</h2>
        {!showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add to account
          </Button>
        )}
      </div>

      {loading ? (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {holdings.length > 0 && (
            <div className="flex gap-6 text-sm border rounded-lg px-4 py-2.5 bg-muted/20">
              <div>
                <span className="text-muted-foreground">Total Qty:</span>{" "}
                <span className="font-medium tabular-nums">{fmt(totalQty)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Avg Price:</span>{" "}
                <span className="font-medium tabular-nums">₹{fmt(weightedAvg)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Cost:</span>{" "}
                <span className="font-medium tabular-nums">₹{fmt(Math.round(totalCost))}</span>
              </div>
            </div>
          )}

          {holdings.length === 0 && !showAdd ? (
            <p className="text-sm text-muted-foreground">
              No holdings for this stock yet. Import a statement or add one to an account.
            </p>
          ) : (
            holdings.length > 0 && (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th scope="col" className="text-left px-3 py-2 font-medium">Account</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">Qty</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">Avg Price</th>
                      <th scope="col" className="text-center px-3 py-2 font-medium">Source</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => (
                      <tr key={h.id} className="border-b border-border/20">
                        <th scope="row" className="px-3 py-2 text-left font-normal">{h.accounts?.label ?? "—"}</th>
                        {editingId === h.id ? (
                          <>
                            <td className="px-3 py-2 text-right">
                              <Input
                                value={editQty}
                                onChange={(e) => setEditQty(e.target.value)}
                                className="h-8 w-24 ml-auto text-right"
                                inputMode="decimal"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Input
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                className="h-8 w-28 ml-auto text-right"
                                inputMode="decimal"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge variant="outline">manual</Badge>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="inline-flex gap-1">
                                <Button size="icon" variant="ghost" aria-label="Save holding" className="h-8 w-8" disabled={busy} onClick={() => handleUpdate(h.id)}>
                                  <Check className="h-4 w-4 text-positive" aria-hidden="true" />
                                </Button>
                                <Button size="icon" variant="ghost" aria-label="Cancel editing" className="h-8 w-8" onClick={() => setEditingId(null)}>
                                  <X className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums">{fmt(h.quantity)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">₹{fmt(h.avg_buy_price)}</td>
                            <td className="px-3 py-2 text-center">
                              <Badge variant={h.source === "manual" ? "outline" : "secondary"} className="text-xs capitalize">
                                {h.source}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="inline-flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Edit holding in ${h.accounts?.label ?? "account"}`}
                                  className="h-8 w-8 text-muted-foreground"
                                  onClick={() => {
                                    setEditingId(h.id);
                                    setEditQty(String(h.quantity));
                                    setEditPrice(String(h.avg_buy_price));
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Remove holding in ${h.accounts?.label ?? "account"}`}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  disabled={busy}
                                  onClick={() => handleDelete(h)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {showAdd && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Add holding to an account</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label htmlFor="add-holding-account" className="text-xs text-muted-foreground">Account <span className="text-destructive">*</span></label>
                    <AccountSelect
                      id="add-holding-account"
                      accounts={accounts}
                      value={addAccountId}
                      onChange={setAddAccountId}
                      newLabel={newAccountLabel}
                      onNewLabelChange={setNewAccountLabel}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="add-holding-qty" className="text-xs text-muted-foreground">Quantity <span className="text-destructive">*</span></label>
                    <Input id="add-holding-qty" value={addQty} onChange={(e) => setAddQty(e.target.value)} inputMode="decimal" className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="add-holding-price" className="text-xs text-muted-foreground">Avg buy price <span className="text-destructive">*</span></label>
                    <Input id="add-holding-price" value={addPrice} onChange={(e) => setAddPrice(e.target.value)} inputMode="decimal" className="h-9" />
                  </div>
                </div>
              </fieldset>
              {existingLot && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    This account already holds{" "}
                    <span className="font-medium tabular-nums">{fmt(existingLot.quantity)}</span>{" "}
                    @ <span className="font-medium tabular-nums">₹{fmt(existingLot.avg_buy_price)}</span>.
                    Adding merges into the existing lot — the quantity is summed and the
                    average buy price is recalculated as a weighted average.
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={handleAdd}>
                  {busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAdd(false);
                    setAddAccountId("");
                    setNewAccountLabel("");
                    setAddQty("");
                    setAddPrice("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
