"use client";

import { useCallback, useEffect, useState } from "react";
import { getOpenLotsForStock } from "@/app/(authenticated)/actions/trades-actions";
import {
  addManualTrade,
  updateTrade,
  deleteTrades,
  resetTradeToOriginal,
  sellPosition,
} from "@/app/(authenticated)/actions/trade-corrections-actions";
import type { OpenLot } from "@/lib/import/tradebook-types";
import type { DashboardAccount } from "@/hooks/use-dashboard-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Check, X, Plus, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import type { ActionResult } from "@/lib/action-result";

interface OpenLotsPanelProps {
  isin: string;
  symbol: string;
  stockId: string | null;
  accountFilter: string;
  accounts: DashboardAccount[];
  /** Called after any successful mutation so the parent can refresh positions. */
  onChanged: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function OpenLotsPanel({
  isin, symbol, stockId, accountFilter, accounts, onChanged,
}: OpenLotsPanelProps) {
  const [lots, setLots] = useState<OpenLot[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(function reload() {
    const accountIds = accountFilter === "all" ? undefined : [accountFilter];
    // setState happens only in the async .then/.finally, never synchronously here.
    getOpenLotsForStock(isin, accountIds)
      .then(setLots)
      .catch(() => setLots([]))
      .finally(() => setLoading(false));
  }, [isin, accountFilter]);

  useEffect(() => { reload(); }, [reload]);

  // Run a mutation, surface errors, then refresh this panel + the positions list.
  const run = useCallback(
    async (fn: () => Promise<ActionResult>, okMsg: string) => {
      setBusy(true);
      try {
        const res = await fn();
        if (!res.ok) { toastError(new Error(res.error), { message: res.error }); return false; }
        toast.success(okMsg);
        reload();
        onChanged();
        return true;
      } catch (e) {
        toastError(e, { message: "Something went wrong" });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload, onChanged]
  );

  const fmtCurrency = (n: number | null, decimals = 2) =>
    n == null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: decimals }).format(n);
  const fmtPct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);

  // ── Inline edit state ──
  const [editId, setEditId] = useState<string | null>(null);
  const [eQty, setEQty] = useState("");
  const [ePrice, setEPrice] = useState("");
  const [eDate, setEDate] = useState("");
  const startEdit = (lot: OpenLot) => {
    setEditId(lot.id);
    setEQty(String(lot.original_qty));
    setEPrice(String(lot.buy_price));
    setEDate(lot.trade_date);
  };
  const saveEdit = (lot: OpenLot) =>
    run(() => updateTrade({ tradeId: lot.trade_ids[0], quantity: Number(eQty), price: Number(ePrice), trade_date: eDate }), "Trade updated")
      .then((ok) => { if (ok) setEditId(null); });

  // ── Delete confirm state ──
  const [delLot, setDelLot] = useState<OpenLot | null>(null);

  // ── Add / Sell dialog state ──
  const [addOpen, setAddOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);

  const totalOpenQty = (lots ?? []).reduce((s, l) => s + l.remaining_qty, 0);

  return (
    <div className="space-y-3">
      {/* Header + company-level actions */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Open lots — {symbol}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} disabled={busy}>
            <Plus className="mr-1 h-3 w-3" /> Add trade
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSellOpen(true)} disabled={busy || totalOpenQty <= 0}>
            Sell
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="py-2 text-sm text-muted-foreground">Loading lots…</p>
      ) : !lots || lots.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No open lots.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-4 text-left font-medium">Buy Date</th>
                <th className="py-2 pr-4 text-left font-medium">Account</th>
                <th className="py-2 pr-4 text-right font-medium">Qty (rem / orig)</th>
                <th className="py-2 pr-4 text-right font-medium">Buy Price</th>
                <th className="py-2 pr-4 text-right font-medium">P&amp;L</th>
                <th className="py-2 pr-4 text-right font-medium">P&amp;L %</th>
                <th className="py-2 pr-4 text-right font-medium">Days</th>
                <th className="py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const editing = editId === lot.id;
                const single = lot.trade_ids.length === 1;
                const lotPnlPos = (lot.unrealized_pnl ?? 0) >= 0;
                return (
                  <tr key={lot.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      {editing ? (
                        <Input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} className="h-7 w-36" />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {lot.trade_date}
                          {lot.source === "manual" && <Badge variant="secondary" className="px-1 py-0 text-[10px]">manual</Badge>}
                          {lot.edited && <Badge variant="outline" className="px-1 py-0 text-[10px]">edited</Badge>}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{lot.account_label}</td>
                    <td className="py-2 pr-4 text-right">
                      {editing ? (
                        <Input type="number" value={eQty} onChange={(e) => setEQty(e.target.value)} className="h-7 w-24 text-right" />
                      ) : (
                        `${lot.remaining_qty} / ${lot.original_qty}`
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {editing ? (
                        <Input type="number" value={ePrice} onChange={(e) => setEPrice(e.target.value)} className="h-7 w-24 text-right" />
                      ) : (
                        fmtCurrency(lot.buy_price)
                      )}
                    </td>
                    <td className={`py-2 pr-4 text-right font-medium ${lotPnlPos ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {lot.unrealized_pnl != null ? `${lotPnlPos ? "+" : ""}${fmtCurrency(lot.unrealized_pnl, 0)}` : "—"}
                    </td>
                    <td className={`py-2 pr-4 text-right ${lotPnlPos ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {fmtPct(lot.pnl_pct)}
                    </td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{lot.holding_days}</td>
                    <td className="py-2 text-right">
                      {editing ? (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={() => saveEdit(lot)} aria-label="Save">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(null)} aria-label="Cancel">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          {lot.edited && single && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy}
                              onClick={() => run(() => resetTradeToOriginal(lot.trade_ids[0]), "Reset to imported values")}
                              aria-label="Reset to original" title="Reset to imported values">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy || !single}
                            onClick={() => startEdit(lot)} aria-label="Edit"
                            title={single ? "Edit" : "Edit unavailable for grouped fills — delete and re-add"}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 dark:text-red-400" disabled={busy}
                            onClick={() => setDelLot(lot)} aria-label="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={delLot != null} onOpenChange={(o) => !o && setDelLot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this lot?</AlertDialogTitle>
            <AlertDialogDescription>
              {delLot?.source === "manual"
                ? "This manual trade will be permanently deleted."
                : "This imported trade will be excluded from calculations. It won't come back on reimport, and you can’t undo this from here."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (delLot) run(() => deleteTrades({ tradeIds: delLot.trade_ids }), "Lot removed").then(() => setDelLot(null)); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add trade dialog */}
      <AddTradeDialog
        open={addOpen} onOpenChange={setAddOpen} accounts={accounts} defaultAccount={accountFilter}
        busy={busy}
        onSubmit={(v) =>
          run(() => addManualTrade({
            accountId: v.accountId, isin, stockId, symbol,
            trade_type: v.type, quantity: Number(v.qty), price: Number(v.price), trade_date: v.date,
          }), "Trade added").then((ok) => { if (ok) setAddOpen(false); })
        }
      />

      {/* Sell dialog */}
      <SellDialog
        open={sellOpen} onOpenChange={setSellOpen} accounts={accounts} defaultAccount={accountFilter}
        maxQty={totalOpenQty} busy={busy}
        onSubmit={(v) =>
          run(() => sellPosition({
            isin, accountId: v.accountId, quantity: Number(v.qty), price: Number(v.price), trade_date: v.date,
          }), "Sell recorded").then((ok) => { if (ok) setSellOpen(false); })
        }
      />
    </div>
  );
}

// ── Add trade dialog ──────────────────────────────────────────────────────
function AddTradeDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accounts: DashboardAccount[];
  defaultAccount: string;
  busy: boolean;
  onSubmit: (v: { accountId: string; type: "buy" | "sell"; qty: string; price: string; date: string }) => void;
}) {
  // Render the body only while open so its useState initializes fresh each time.
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add trade</DialogTitle></DialogHeader>
        {props.open && <AddTradeForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function AddTradeForm({
  onOpenChange, accounts, defaultAccount, busy, onSubmit,
}: {
  onOpenChange: (o: boolean) => void;
  accounts: DashboardAccount[];
  defaultAccount: string;
  busy: boolean;
  onSubmit: (v: { accountId: string; type: "buy" | "sell"; qty: string; price: string; date: string }) => void;
}) {
  const firstAccount = defaultAccount !== "all" ? defaultAccount : accounts[0]?.id ?? "";
  const [accountId, setAccountId] = useState(firstAccount);
  const [type, setType] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today());

  const valid = accountId && Number(qty) > 0 && Number(price) >= 0 && date;

  return (
    <>
        <div className="grid grid-cols-2 gap-3 py-2 text-sm">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Account</span>
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Type</span>
            <Select value={type} onValueChange={(v) => setType((v as "buy" | "sell") ?? "buy")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Date</span>
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Quantity</span>
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Price</span>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || busy} onClick={() => onSubmit({ accountId, type, qty, price, date })}>
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Add
          </Button>
        </DialogFooter>
    </>
  );
}

// ── Sell dialog ───────────────────────────────────────────────────────────
function SellDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accounts: DashboardAccount[];
  defaultAccount: string;
  maxQty: number;
  busy: boolean;
  onSubmit: (v: { accountId: string; qty: string; price: string; date: string }) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Sell position</DialogTitle></DialogHeader>
        {props.open && <SellForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function SellForm({
  onOpenChange, accounts, defaultAccount, maxQty, busy, onSubmit,
}: {
  onOpenChange: (o: boolean) => void;
  accounts: DashboardAccount[];
  defaultAccount: string;
  maxQty: number;
  busy: boolean;
  onSubmit: (v: { accountId: string; qty: string; price: string; date: string }) => void;
}) {
  const firstAccount = defaultAccount !== "all" ? defaultAccount : accounts[0]?.id ?? "";
  const [accountId, setAccountId] = useState(firstAccount);
  const [qty, setQty] = useState(String(maxQty));
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today());

  const valid = accountId && Number(qty) > 0 && Number(price) >= 0 && date;

  return (
    <>
        <div className="grid grid-cols-2 gap-3 py-2 text-sm">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Account</span>
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Quantity (open: {maxQty})</span>
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Sell price</span>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Date</span>
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || busy} onClick={() => onSubmit({ accountId, qty, price, date })}>
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Sell
          </Button>
        </DialogFooter>
    </>
  );
}
