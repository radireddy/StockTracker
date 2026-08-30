"use client";

import { useEffect, useState } from "react";
import { getOpenLotsForStock } from "@/app/(authenticated)/actions/trades-actions";
import type { OpenLot } from "@/lib/import/tradebook-types";

interface OpenLotsPanelProps {
  isin: string;
  accountFilter: string;
}

export function OpenLotsPanel({ isin, accountFilter }: OpenLotsPanelProps) {
  const [lots, setLots] = useState<OpenLot[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const accountIds = accountFilter === "all" ? undefined : [accountFilter];
    setLoading(true);
    getOpenLotsForStock(isin, accountIds)
      .then(setLots)
      .catch(() => setLots([]))
      .finally(() => setLoading(false));
  }, [isin, accountFilter]);

  const fmtCurrency = (n: number | null, decimals = 2) =>
    n == null
      ? "—"
      : new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: decimals,
        }).format(n);

  const fmtPct = (n: number | null) =>
    n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  if (loading) {
    return (
      <p className="py-2 text-sm text-muted-foreground">Loading lots…</p>
    );
  }
  if (!lots || lots.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">No open lots found.</p>
    );
  }

  // Cumulative summary
  const totalQty  = lots.reduce((s, l) => s + l.remaining_qty, 0);
  const totalCost = lots.reduce((s, l) => s + l.remaining_qty * l.buy_price, 0);
  const avgCost   = totalQty > 0 ? totalCost / totalQty : 0;
  const currentPrice = lots[0].current_price;
  const totalPnl     = currentPrice != null ? (currentPrice - avgCost) * totalQty : null;
  const overallPct   =
    currentPrice != null && avgCost > 0
      ? ((currentPrice - avgCost) / avgCost) * 100
      : null;
  const avgHoldingDays =
    totalQty > 0
      ? lots.reduce((s, l) => s + l.remaining_qty * l.holding_days, 0) / totalQty
      : 0;
  const cumulativeCagr =
    currentPrice != null && avgCost > 0 && avgHoldingDays >= 7
      ? (Math.pow(currentPrice / avgCost, 365 / avgHoldingDays) - 1) * 100
      : null;

  return (
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
            <th className="py-2 text-right font-medium">CAGR</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => {
            const lotPnlPos = (lot.unrealized_pnl ?? 0) >= 0;
            return (
              <tr key={lot.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{lot.trade_date}</td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {lot.account_label}
                </td>
                <td className="py-2 pr-4 text-right">
                  {lot.remaining_qty} / {lot.original_qty}
                </td>
                <td className="py-2 pr-4 text-right">
                  {fmtCurrency(lot.buy_price)}
                </td>
                <td
                  className={`py-2 pr-4 text-right font-medium ${
                    lotPnlPos
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {lot.unrealized_pnl != null
                    ? `${lotPnlPos ? "+" : ""}${fmtCurrency(lot.unrealized_pnl, 0)}`
                    : "—"}
                </td>
                <td
                  className={`py-2 pr-4 text-right ${
                    lotPnlPos
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {fmtPct(lot.pnl_pct)}
                </td>
                <td className="py-2 pr-4 text-right text-muted-foreground">
                  {lot.holding_days}
                </td>
                <td className="py-2 text-right font-medium">
                  {fmtPct(lot.cagr)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2">
          <tr className="font-semibold">
            <td className="py-2 pr-4 text-muted-foreground" colSpan={2}>
              Total
            </td>
            <td className="py-2 pr-4 text-right">{totalQty}</td>
            <td className="py-2 pr-4 text-right">{fmtCurrency(avgCost)}</td>
            <td
              className={`py-2 pr-4 text-right ${
                (totalPnl ?? 0) >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {totalPnl != null
                ? `${totalPnl >= 0 ? "+" : ""}${fmtCurrency(totalPnl, 0)}`
                : "—"}
            </td>
            <td
              className={`py-2 pr-4 text-right ${
                (overallPct ?? 0) >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {fmtPct(overallPct)}
            </td>
            <td className="py-2 pr-4 text-right text-muted-foreground">
              {Math.round(avgHoldingDays)}d avg
            </td>
            <td className="py-2 text-right">{fmtPct(cumulativeCagr)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
