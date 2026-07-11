"use client";

import { computePortfolioPnl } from "@/lib/utils/portfolio-pnl";

type CompanyWithStock = {
  quantity: number | null;
  avg_buy_price: number | null;
  indian_stocks: { price: number | null } | null;
};

function fmtINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Summary hero card for a holdings portfolio: the current market value up top,
 * an all-time P&L pill, and a footer of Invested / Companies / Accounts.
 * No "Today" and no XIRR — we don't have that data.
 */
export function PortfolioPnlBar({
  companies,
  accountsCount,
}: {
  companies: CompanyWithStock[];
  accountsCount: number;
}) {
  const result = computePortfolioPnl(companies);
  if (!result) return null;

  const { totalCurrent, totalInvested, pnl, pnlPct, heldCount: held } = result;
  const up = pnl >= 0;

  return (
    <div className="flex flex-col justify-center gap-4 rounded-2xl border bg-card p-6 shadow-soft">
      <div>
        <div className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          Current value
        </div>
        <div className="mt-1.5 font-mono text-4xl font-bold leading-none tracking-tight tabular-nums">
          {fmtINR(totalCurrent)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            aria-label={`All-time ${up ? "profit" : "loss"}: ${up ? "+" : "−"}${fmtINR(Math.abs(pnl))}, ${up ? "+" : ""}${pnlPct.toFixed(1)}%`}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.82rem] font-semibold ${
              up ? "bg-positive/[0.14] text-positive" : "bg-destructive/[0.12] text-destructive"
            }`}
          >
            <span aria-hidden="true">{up ? "▲" : "▼"}</span>
            <span aria-hidden="true">
              {up ? "+" : "−"}
              {fmtINR(Math.abs(pnl))} · {up ? "+" : ""}
              {pnlPct.toFixed(1)}%
            </span>
          </span>
          <span className="text-sm text-muted-foreground">all-time P&amp;L</span>
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-9 gap-y-2 border-t border-border/70 pt-3">
        <div>
          <dd className="font-mono text-base font-semibold tabular-nums">{fmtINR(totalInvested)}</dd>
          <dt className="text-[0.72rem] uppercase tracking-[0.06em] text-muted-foreground">Invested</dt>
        </div>
        <div>
          <dd className="font-mono text-base font-semibold tabular-nums">{held}</dd>
          <dt className="text-[0.72rem] uppercase tracking-[0.06em] text-muted-foreground">Companies</dt>
        </div>
        <div>
          <dd className="font-mono text-base font-semibold tabular-nums">{accountsCount}</dd>
          <dt className="text-[0.72rem] uppercase tracking-[0.06em] text-muted-foreground">Accounts</dt>
        </div>
      </dl>
    </div>
  );
}
