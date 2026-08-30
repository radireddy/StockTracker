"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { OpenPosition } from "@/lib/import/tradebook-types";
import { OpenLotsPanel } from "./open-lots-panel";

interface TradesTableProps {
  positions: OpenPosition[];
  accountFilter: string;
}

export function TradesTable({ positions, accountFilter }: TradesTableProps) {
  const [expandedIsin, setExpandedIsin] = useState<string | null>(null);

  const toggle = (isin: string) =>
    setExpandedIsin((prev) => (prev === isin ? null : isin));

  const fmtCurrency = (n: number | null) =>
    n == null
      ? "—"
      : new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 2,
        }).format(n);

  const fmtPct = (n: number | null) =>
    n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  if (positions.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        No open positions. Import a tradebook to get started.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className="w-8 px-3 py-3" />
            <th className="px-3 py-3 text-left font-medium">Company</th>
            <th className="px-3 py-3 text-right font-medium">Qty</th>
            <th className="px-3 py-3 text-right font-medium">Avg Cost</th>
            <th className="px-3 py-3 text-right font-medium">LTP</th>
            <th className="px-3 py-3 text-right font-medium">P&amp;L</th>
            <th className="px-3 py-3 text-right font-medium">P&amp;L %</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const isExpanded = expandedIsin === pos.isin;
            const pnlPos = (pos.unrealized_pnl ?? 0) >= 0;
            return (
              <>
                <tr
                  key={pos.isin}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                  onClick={() => toggle(pos.isin)}
                >
                  <td className="px-3 py-3 text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{pos.symbol}</p>
                    {pos.name && (
                      <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {pos.name}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">{pos.quantity}</td>
                  <td className="px-3 py-3 text-right">
                    {fmtCurrency(pos.avg_buy_price)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {pos.current_price != null
                      ? fmtCurrency(pos.current_price)
                      : "—"}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-medium ${
                      pnlPos
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {pos.unrealized_pnl != null
                      ? `${pnlPos ? "+" : ""}${fmtCurrency(pos.unrealized_pnl)}`
                      : "—"}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-medium ${
                      pnlPos
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {fmtPct(pos.pnl_pct)}
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${pos.isin}-lots`}>
                    <td colSpan={7} className="bg-muted/20 px-6 py-4">
                      <OpenLotsPanel
                        isin={pos.isin}
                        accountFilter={accountFilter}
                      />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
