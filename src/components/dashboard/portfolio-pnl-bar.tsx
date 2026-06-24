"use client";

import { useLivePricesContext } from "@/components/auto-refresh";
import type { Company } from "@/types/database";

type CompanyWithStock = Company & {
  indian_stocks?: { price: number | null; market_cap: number | null } | null;
};

export function PortfolioPnlBar({
  companies,
}: {
  companies: CompanyWithStock[];
}) {
  const livePrices = useLivePricesContext();

  let totalInvested = 0;
  let totalCurrent = 0;

  for (const c of companies) {
    const qty = c.quantity;
    const avgBuy = c.avg_buy_price;
    if (!qty || !avgBuy) continue;

    const currentPrice =
      livePrices[c.isin]?.price ?? c.indian_stocks?.price ?? null;
    if (currentPrice == null) continue;

    totalInvested += qty * avgBuy;
    totalCurrent += qty * currentPrice;
  }

  if (totalInvested === 0) return null;

  const pnl = totalCurrent - totalInvested;
  const pnlPct = (pnl / totalInvested) * 100;
  const isProfit = pnl >= 0;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="flex items-center gap-6 rounded-lg border border-border/60 bg-muted/20 px-4 py-2.5 text-sm">
      <div>
        <span className="text-muted-foreground">Invested</span>{" "}
        <span className="font-medium">{fmt(totalInvested)}</span>
      </div>
      <div>
        <span className="text-muted-foreground">Current</span>{" "}
        <span className="font-medium">{fmt(totalCurrent)}</span>
      </div>
      <div>
        <span className="text-muted-foreground">P&L</span>{" "}
        <span
          className={`font-semibold ${
            isProfit ? "text-green-600" : "text-red-600"
          }`}
        >
          {isProfit ? "+" : ""}
          {fmt(pnl)} ({isProfit ? "+" : ""}
          {pnlPct.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}
