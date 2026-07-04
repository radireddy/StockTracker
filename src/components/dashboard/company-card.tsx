"use client";

import type { DashboardCompanyRow } from "@/hooks/use-dashboard-data";
import type { HoldingMetrics } from "@/lib/utils/dashboard-metrics";
import { fmtAmountShort, fmtPriceShort, fmtNum, isBuySignal } from "@/lib/utils/calculations";

/** Star rating with a text alternative for assistive tech. */
function Stars({ rating }: { rating: number | null }) {
  const n = rating ?? 0;
  if (n <= 0) return null;
  return (
    <span className="text-[13px] tracking-tight text-amber-500" aria-label={`${n} of 4 stars`}>
      <span aria-hidden="true">
        {"★".repeat(n)}
        <span className="text-muted-foreground/25">{"★".repeat(4 - n)}</span>
      </span>
    </span>
  );
}

function signedAmount(n: number): string {
  return `${n >= 0 ? "+" : "−"}₹${fmtAmountShort(Math.abs(n))}`;
}

function pnlClass(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-green-600" : "text-red-600";
}

/** Buy price / MoS colour: green when the stock trades below your buy price. */
function edgeClass(mos: number | null): string {
  if (mos == null) return "";
  return mos >= 0 ? "text-green-600" : "text-red-600";
}

const ALLOC_FILL: Record<HoldingMetrics["allocStatus"], string> = {
  in_range: "bg-green-500",
  under: "bg-amber-500",
  over: "bg-red-500",
};

function AllocationBar({ metrics }: { metrics: HoldingMetrics }) {
  const actual = metrics.valuePct;
  const { min, max } = metrics.range;
  const upperBound = Math.max(actual, max) * 1.3 || 10;
  const fill = Math.min((actual / upperBound) * 100, 100);
  const b1 = (min / upperBound) * 100;
  const b2 = (max / upperBound) * 100;

  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <div className="relative h-1.5 flex-1 rounded-full bg-muted">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${ALLOC_FILL[metrics.allocStatus]}`}
          style={{ width: `${fill}%` }}
        />
        <i className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground/30" style={{ left: `${b1}%` }} />
        <i className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground/30" style={{ left: `${b2}%` }} />
      </div>
      <span className="whitespace-nowrap font-mono text-[10.5px] tabular-nums text-muted-foreground">
        <span className="mr-1 font-sans text-[9px] uppercase tracking-wide text-muted-foreground/70">Now</span>
        <b className="font-semibold text-foreground">{actual.toFixed(1)}%</b>
        <span className="mx-1 font-sans text-[9px] uppercase tracking-wide text-muted-foreground/70">Target</span>
        {min}–{max}%
      </span>
    </div>
  );
}

function ResearchStrip({ metrics }: { metrics: HoldingMetrics }) {
  const mosPct = metrics.mos != null ? Math.round(metrics.mos * 100) : null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11.5px]">
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-primary">Buy</span>
        <span className={`font-mono font-semibold tabular-nums ${edgeClass(metrics.mos)}`}>
          {metrics.buyPrice != null ? `₹${fmtPriceShort(metrics.buyPrice)}` : "—"}
        </span>
      </span>
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-primary">MoS</span>
        <span className={`font-mono font-semibold tabular-nums ${edgeClass(metrics.mos)}`}>
          {mosPct != null ? `${mosPct > 0 ? "+" : ""}${mosPct}%` : "—"}
        </span>
      </span>
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-primary">Base</span>
        <span
          className={`font-mono font-semibold tabular-nums ${
            metrics.baseReturn == null ? "" : metrics.baseReturn >= 0 ? "text-green-600" : "text-red-600"
          }`}
        >
          {metrics.baseReturn != null ? `${metrics.baseReturn > 0 ? "+" : ""}${metrics.baseReturn.toFixed(0)}%` : "—"}
        </span>
      </span>
    </div>
  );
}

export function CompanyCard({
  company,
  metrics,
  portfolioType,
  onOpen,
}: {
  company: DashboardCompanyRow;
  metrics: HoldingMetrics;
  portfolioType: "holdings" | "watchlist";
  onOpen: (id: string) => void;
}) {
  const name = company.indian_stocks?.name ?? company.isin;
  const isHoldings = portfolioType === "holdings";
  const buy = isBuySignal(metrics.price, metrics.buyPrice);

  return (
    <button
      type="button"
      onClick={() => onOpen(company.id)}
      className="w-full rounded-xl border border-border/60 bg-card p-3.5 text-left shadow-sm transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold tracking-tight">{name}</div>
          <div className="mt-1 flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <Stars rating={company.star_rating} />
            {company.strategy && (
              <span className="rounded border border-border/60 bg-muted px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                {company.strategy}
              </span>
            )}
          </div>
        </div>
        {isHoldings ? (
          <div className="shrink-0 text-right">
            <div className={`font-mono text-[15px] font-bold tabular-nums ${pnlClass(metrics.pnlAmt)}`}>
              {metrics.pnlAmt != null ? signedAmount(metrics.pnlAmt) : "—"}
            </div>
            <div className={`mt-0.5 font-mono text-[12px] font-semibold tabular-nums ${pnlClass(metrics.pnlPct)}`}>
              {metrics.pnlPct != null ? `${metrics.pnlPct >= 0 ? "+" : ""}${metrics.pnlPct.toFixed(2)}%` : ""}
            </div>
          </div>
        ) : (
          <div className="shrink-0 text-right">
            <div className="font-mono text-[15px] font-bold tabular-nums">
              {metrics.price != null ? `₹${fmtPriceShort(metrics.price)}` : "—"}
            </div>
            <div className="text-[9.5px] uppercase tracking-wide text-muted-foreground">CMP</div>
            {buy && (
              <span className="mt-1 inline-block rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-green-600 dark:bg-green-950/30">
                BUY
              </span>
            )}
          </div>
        )}
      </div>

      {isHoldings && (
        <div className="mt-3 flex gap-4 border-t border-border/60 pt-2.5 font-mono text-[12px] tabular-nums">
          <div>
            <span className="mb-0.5 block font-sans text-[10px] uppercase tracking-wide text-muted-foreground/70">Qty</span>
            <b className="font-semibold">{company.quantity != null ? fmtNum(company.quantity, 0) : "—"}</b>
          </div>
          <div>
            <span className="mb-0.5 block font-sans text-[10px] uppercase tracking-wide text-muted-foreground/70">Avg</span>
            <b className="font-semibold">₹{fmtPriceShort(company.avg_buy_price ?? null)}</b>
          </div>
          <div>
            <span className="mb-0.5 block font-sans text-[10px] uppercase tracking-wide text-muted-foreground/70">LTP</span>
            <b className="font-semibold">₹{fmtPriceShort(metrics.price)}</b>
          </div>
        </div>
      )}

      <div className={`${isHoldings ? "mt-2.5 border-t border-border/60 pt-2.5" : "mt-3 border-t border-border/60 pt-2.5"}`}>
        <ResearchStrip metrics={metrics} />
        {isHoldings && <AllocationBar metrics={metrics} />}
      </div>
    </button>
  );
}
