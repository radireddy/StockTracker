"use client";

import type { OpenPosition } from "@/lib/import/tradebook-types";

interface TradesPnlBarProps {
  positions: OpenPosition[];
}

export function TradesPnlBar({ positions }: TradesPnlBarProps) {
  const invested = positions.reduce(
    (sum, p) => sum + p.quantity * p.avg_buy_price,
    0
  );
  const current = positions.reduce((sum, p) => {
    const price = p.current_price ?? p.avg_buy_price;
    return sum + p.quantity * price;
  }, 0);
  const pnl = current - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
  const isPos = pnl >= 0;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="flex flex-wrap gap-6 rounded-lg border bg-card px-6 py-4 text-sm">
      <div>
        <p className="text-muted-foreground">Invested</p>
        <p className="text-lg font-semibold">{fmt(invested)}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Current Value</p>
        <p className="text-lg font-semibold">{fmt(current)}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Unrealised P&amp;L</p>
        <p
          className={`text-lg font-semibold ${
            isPos
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {isPos ? "+" : ""}
          {fmt(pnl)}{" "}
          <span className="text-sm font-normal">
            ({isPos ? "+" : ""}
            {pnlPct.toFixed(2)}%)
          </span>
        </p>
      </div>
      <div>
        <p className="text-muted-foreground">Open Positions</p>
        <p className="text-lg font-semibold">{positions.length}</p>
      </div>
    </div>
  );
}
