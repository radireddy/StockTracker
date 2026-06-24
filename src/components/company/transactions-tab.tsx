"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTransactions } from "@/app/(authenticated)/actions/transaction-actions";
import { AddTransactionDialog } from "./add-transaction-dialog";
import type { Transaction } from "@/types/database";

export function TransactionsTab({ companyId }: { companyId: string }) {
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

  // Compute summary
  let totalQty = 0;
  let totalInvested = 0;
  let totalFees = 0;
  for (const t of transactions) {
    if (t.type === "BUY") {
      totalQty += t.quantity;
      totalInvested += t.quantity * t.price;
    } else {
      totalQty -= t.quantity;
      totalInvested -= t.quantity * t.price;
    }
    totalFees += t.fees;
  }
  const weightedAvg = totalQty > 0 ? totalInvested / totalQty : 0;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 2,
    }).format(n);

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
          <div className="flex gap-6 text-sm border rounded-lg px-4 py-2.5 bg-muted/20">
            <div>
              <span className="text-muted-foreground">Net Qty:</span>{" "}
              <span className="font-medium">{fmt(totalQty)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Avg Price:</span>{" "}
              <span className="font-medium">₹{fmt(weightedAvg)}</span>
            </div>
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
                  <th className="text-center px-3 py-2 font-medium">Type</th>
                  <th className="text-right px-3 py-2 font-medium">Qty</th>
                  <th className="text-right px-3 py-2 font-medium">Price</th>
                  <th className="text-right px-3 py-2 font-medium">Fees</th>
                  <th className="text-left px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-border/20">
                    <td className="px-3 py-2">{t.date}</td>
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
                      {t.fees > 0 ? `₹${fmt(t.fees)}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">
                      {t.notes ?? "-"}
                    </td>
                  </tr>
                ))}
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
