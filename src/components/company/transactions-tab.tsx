"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTransactions } from "@/app/(authenticated)/actions/transaction-actions";
import { AddTransactionDialog } from "./add-transaction-dialog";
import type { Transaction } from "@/types/database";

export function TransactionsTab({
  companyId,
  currentPrice,
}: {
  companyId: string;
  currentPrice: number | null;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchTransactions = () => {
    setLoading(true);
    getTransactions(companyId)
      .then(setTransactions)
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTransactions();
  }, [companyId]);

  // Sort by decreasing traded_at (newest first)
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.traded_at).getTime() - new Date(a.traded_at).getTime()
  );

  // Check if there are multiple owners
  const ownerNames = new Set(
    transactions.map((t) => t.portfolio_owners?.name ?? "Unknown")
  );
  const hasMultipleOwners = ownerNames.size > 1;

  // Compute summary
  let totalQty = 0;
  let totalCost = 0;
  let totalFees = 0;
  for (const t of transactions) {
    if (t.type === "BUY") {
      totalQty += t.quantity;
      totalCost += t.quantity * t.price;
    } else {
      totalQty -= t.quantity;
      totalCost -= t.quantity * t.price;
    }
    totalFees += t.fees;
  }
  const weightedAvg = totalQty > 0 ? totalCost / totalQty : 0;
  const totalCurrentValue =
    totalQty > 0 && currentPrice ? currentPrice * totalQty : null;
  const totalPnlAmt =
    totalCurrentValue != null ? totalCurrentValue - totalCost : null;
  const totalPnlPct =
    totalPnlAmt != null && totalCost > 0
      ? (totalPnlAmt / totalCost) * 100
      : null;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 2,
    }).format(n);

  const fmtInt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 0,
    }).format(n);

  const pnlColor = (val: number | null) => {
    if (val == null) return "";
    return val >= 0 ? "text-green-600" : "text-red-600";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          + Add Transaction
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No transactions yet. Add your first buy transaction.
        </p>
      ) : (
        <>
          {/* Summary */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm border rounded-lg px-4 py-2.5 bg-muted/20">
            <div>
              <span className="text-muted-foreground">Net Qty:</span>{" "}
              <span className="font-medium">{fmt(totalQty)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Avg Price:</span>{" "}
              <span className="font-medium">₹{fmt(weightedAvg)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Cost:</span>{" "}
              <span className="font-medium">₹{fmtInt(totalCost)}</span>
            </div>
            {totalCurrentValue != null && (
              <div>
                <span className="text-muted-foreground">Cur. Value:</span>{" "}
                <span className="font-medium">
                  ₹{fmtInt(totalCurrentValue)}
                </span>
              </div>
            )}
            {totalPnlAmt != null && (
              <div>
                <span className="text-muted-foreground">P&L:</span>{" "}
                <span className={`font-medium ${pnlColor(totalPnlAmt)}`}>
                  {totalPnlAmt >= 0 ? "+" : ""}₹{fmtInt(totalPnlAmt)} (
                  {totalPnlPct != null &&
                    `${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(1)}%`}
                  )
                </span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Total Fees:</span>{" "}
              <span className="font-medium">₹{fmt(totalFees)}</span>
            </div>
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  {hasMultipleOwners && (
                    <th className="text-left px-3 py-2 font-medium">Owner</th>
                  )}
                  <th className="text-center px-3 py-2 font-medium">Type</th>
                  <th className="text-right px-3 py-2 font-medium">Qty</th>
                  <th className="text-right px-3 py-2 font-medium">
                    Price/Share
                  </th>
                  <th className="text-right px-3 py-2 font-medium">Cost</th>
                  <th className="text-right px-3 py-2 font-medium">
                    Cur. Value
                  </th>
                  <th className="text-right px-3 py-2 font-medium">P&L ₹</th>
                  <th className="text-right px-3 py-2 font-medium">P&L %</th>
                  <th className="text-right px-3 py-2 font-medium">Fees</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => {
                  const cost = t.quantity * t.price;
                  const curValue = currentPrice
                    ? currentPrice * t.quantity
                    : null;
                  const pnlAmt =
                    curValue != null
                      ? t.type === "BUY"
                        ? curValue - cost
                        : 0
                      : null;
                  const pnlPct =
                    pnlAmt != null && cost > 0
                      ? (pnlAmt / cost) * 100
                      : null;

                  return (
                    <tr key={t.id} className="border-b border-border/20">
                      <td className="px-3 py-2">
                        <div>{new Date(t.traded_at).toLocaleDateString("en-IN")}</div>
                        {new Date(t.traded_at).getHours() !== 0 || new Date(t.traded_at).getMinutes() !== 0 ? (
                          <div className="text-xs text-muted-foreground">
                            {new Date(t.traded_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        ) : null}
                      </td>
                      {hasMultipleOwners && (
                        <td className="px-3 py-2 text-muted-foreground">
                          {t.portfolio_owners?.name ?? "—"}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center">
                        <Badge
                          variant={t.type === "BUY" ? "default" : "destructive"}
                          className="text-xs"
                        >
                          {t.type}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmt(t.quantity)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ₹{fmt(t.price)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ₹{fmtInt(cost)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {curValue != null && t.type === "BUY"
                          ? `₹${fmtInt(curValue)}`
                          : "-"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-medium ${pnlColor(pnlAmt)}`}
                      >
                        {pnlAmt != null && t.type === "BUY"
                          ? `${pnlAmt >= 0 ? "+" : ""}₹${fmtInt(pnlAmt)}`
                          : "-"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-medium ${pnlColor(pnlPct)}`}
                      >
                        {pnlPct != null && t.type === "BUY"
                          ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`
                          : "-"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {t.fees > 0 ? `₹${fmt(t.fees)}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AddTransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        companyId={companyId}
        onSuccess={fetchTransactions}
      />
    </div>
  );
}
