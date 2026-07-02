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
import { Pencil, Trash2, Check, X, Plus, Loader2 } from "lucide-react";
import { AccountSelect, NEW_ACCOUNT } from "@/components/account/account-select";
import { toast } from "sonner";

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

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([getHoldingsForCompany(companyId), getAccounts()])
      .then(([h, a]) => {
        setHoldings(h);
        setAccounts(a);
      })
      .catch(() => {
        setHoldings([]);
        setAccounts([]);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalQty = holdings.reduce((s, h) => s + h.quantity, 0);
  const totalCost = holdings.reduce((s, h) => s + h.quantity * h.avg_buy_price, 0);
  const weightedAvg = totalQty > 0 ? totalCost / totalQty : 0;

  const handleUpdate = async (id: string) => {
    const qty = parseFloat(editQty);
    const price = parseFloat(editPrice);
    if (isNaN(qty) || isNaN(price)) return;
    setBusy(true);
    try {
      await updateHolding(id, { quantity: qty, avg_buy_price: price });
      setEditingId(null);
      refresh();
      toast.success("Holding updated");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (h: Holding) => {
    if (!confirm(`Remove this stock from ${h.accounts?.label ?? "this account"}?`)) return;
    setBusy(true);
    try {
      await deleteHolding(h.id);
      refresh();
      toast.success("Holding removed");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    const qty = parseFloat(addQty);
    const price = parseFloat(addPrice);
    if (isNaN(qty) || isNaN(price)) {
      toast.error("Enter a valid quantity and average price");
      return;
    }
    setBusy(true);
    try {
      let accountId = addAccountId;
      if (accountId === NEW_ACCOUNT) {
        if (!newAccountLabel.trim()) {
          toast.error("Enter a name for the new account");
          setBusy(false);
          return;
        }
        const created = await createAccount({ label: newAccountLabel.trim(), broker: "manual" });
        accountId = created.id;
      }
      if (!accountId) {
        toast.error("Select an account");
        setBusy(false);
        return;
      }
      await addHolding(portfolioId, { account_id: accountId, isin, quantity: qty, avg_buy_price: price });
      setShowAdd(false);
      setAddAccountId("");
      setNewAccountLabel("");
      setAddQty("");
      setAddPrice("");
      refresh();
      toast.success("Holding added");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
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
        <p className="text-sm text-muted-foreground">Loading…</p>
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
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-3 py-2 font-medium">Account</th>
                      <th className="text-right px-3 py-2 font-medium">Qty</th>
                      <th className="text-right px-3 py-2 font-medium">Avg Price</th>
                      <th className="text-center px-3 py-2 font-medium">Source</th>
                      <th className="text-right px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => (
                      <tr key={h.id} className="border-b border-border/20">
                        <td className="px-3 py-2">{h.accounts?.label ?? "—"}</td>
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
                                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busy} onClick={() => handleUpdate(h.id)}>
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                                  <X className="h-4 w-4" />
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
                                  className="h-8 w-8 text-muted-foreground"
                                  onClick={() => {
                                    setEditingId(h.id);
                                    setEditQty(String(h.quantity));
                                    setEditPrice(String(h.avg_buy_price));
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  disabled={busy}
                                  onClick={() => handleDelete(h)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
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
              <p className="text-sm font-medium">Add holding to an account</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Quantity</label>
                  <Input value={addQty} onChange={(e) => setAddQty(e.target.value)} inputMode="decimal" className="h-9" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Avg buy price</label>
                  <Input value={addPrice} onChange={(e) => setAddPrice(e.target.value)} inputMode="decimal" className="h-9" />
                </div>
              </div>
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
