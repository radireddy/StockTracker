"use client";

import type { DashboardCompanyRow } from "@/hooks/use-dashboard-data";
import type { HoldingMetrics } from "@/lib/utils/dashboard-metrics";
import { fmtAmountShort, fmtPriceShort, fmtNum, isBuySignal } from "@/lib/utils/calculations";
import { initials } from "@/lib/utils/portfolios";
import { Stars } from "@/components/ui/stars";
import { STATUS_VAR } from "@/components/dashboard/status-tag";

function signedAmount(n: number): string {
  return `${n >= 0 ? "+" : "−"}₹${fmtAmountShort(Math.abs(n))}`;
}

function pnlClass(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-positive" : "text-destructive";
}

/** Buy price / MoS colour: positive when trading below your buy price. */
function edgeClass(mos: number | null): string {
  if (mos == null) return "";
  return mos >= 0 ? "text-positive" : "text-destructive";
}

/** Company avatar tile. */
function Fav({ name }: { name: string }) {
  return (
    <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] bg-accent text-[0.78rem] font-bold text-primary">
      {initials(name)}
    </span>
  );
}

function AllocationBar({ metrics }: { metrics: HoldingMetrics }) {
  const actual = metrics.valuePct;
  const { min, max } = metrics.range;
  const upperBound = Math.max(actual, max) * 1.3 || 10;
  const fill = Math.min((actual / upperBound) * 100, 100);
  const b1 = (min / upperBound) * 100;
  const b2 = (max / upperBound) * 100;

  return (
    <div className="mt-3">
      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${fill}%`, background: STATUS_VAR[metrics.allocStatus] }}
        />
        <i className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground/35" style={{ left: `${b1}%` }} />
        <i className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground/35" style={{ left: `${b2}%` }} />
      </div>
      <div className="mt-1.5 flex justify-end gap-1.5 font-mono text-[0.66rem] tabular-nums text-muted-foreground">
        <span className="font-sans text-[0.58rem] uppercase tracking-wide text-muted-foreground/70">Now</span>
        <b className="font-semibold text-foreground">{actual.toFixed(1)}%</b>
        <span className="font-sans text-[0.58rem] uppercase tracking-wide text-muted-foreground/70">Target</span>
        {min}–{max}%
      </div>
    </div>
  );
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[0.62rem] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold tabular-nums ${className ?? ""}`}>{value}</span>
    </span>
  );
}

function ResearchStrip({ metrics }: { metrics: HoldingMetrics }) {
  const mosPct = metrics.mos != null ? Math.round(metrics.mos * 100) : null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.72rem]">
      <Metric
        label="Buy"
        value={metrics.buyPrice != null ? `₹${fmtPriceShort(metrics.buyPrice)}` : "—"}
        className={edgeClass(metrics.mos)}
      />
      <Metric
        label="MoS"
        value={mosPct != null ? `${mosPct > 0 ? "+" : ""}${mosPct}%` : "—"}
        className={edgeClass(metrics.mos)}
      />
      <Metric
        label="Base"
        value={metrics.baseReturn != null ? `${metrics.baseReturn > 0 ? "+" : ""}${metrics.baseReturn.toFixed(0)}%` : "—"}
        className={metrics.baseReturn == null ? "" : metrics.baseReturn >= 0 ? "text-positive" : "text-destructive"}
      />
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
      className="card-interactive relative w-full overflow-hidden rounded-[18px] border bg-card p-3.5 text-left shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {isHoldings && (
        <span
          className="absolute inset-y-3 left-0 w-[3px] rounded-full"
          style={{ background: STATUS_VAR[metrics.allocStatus] }}
          aria-hidden="true"
        />
      )}

      <div className="flex items-start gap-2.5">
        <Fav name={name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.92rem] font-bold tracking-tight">{name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <span>{company.indian_stocks?.nse_symbol ?? company.isin}</span>
            <Stars rating={company.star_rating} className="text-[0.72rem]" />
            {company.strategy && (
              <span className="rounded bg-muted px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground">
                {company.strategy}
              </span>
            )}
          </div>
        </div>

        {isHoldings ? (
          <div className="shrink-0 text-right">
            <div className={`font-mono text-[0.98rem] font-bold tabular-nums ${pnlClass(metrics.pnlAmt)}`}>
              {metrics.pnlAmt != null ? signedAmount(metrics.pnlAmt) : "—"}
            </div>
            <div className={`mt-0.5 font-mono text-[0.74rem] font-semibold tabular-nums ${pnlClass(metrics.pnlPct)}`}>
              {metrics.pnlPct != null ? `${metrics.pnlPct >= 0 ? "+" : ""}${metrics.pnlPct.toFixed(1)}%` : ""}
            </div>
          </div>
        ) : (
          <div className="shrink-0 text-right">
            <div className="text-[0.56rem] uppercase tracking-[0.1em] text-muted-foreground">CMP</div>
            <div className="font-mono text-[0.98rem] font-bold tabular-nums">
              {metrics.price != null ? `₹${fmtPriceShort(metrics.price)}` : "—"}
            </div>
            {buy ? (
              <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[0.62rem] font-bold text-primary-foreground">
                <span aria-hidden="true">●</span> BUY ZONE
              </span>
            ) : (
              <span className="mt-1 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[0.62rem] font-bold text-muted-foreground">
                WAIT
              </span>
            )}
          </div>
        )}
      </div>

      {isHoldings && (
        <div className="mt-3 flex gap-5 border-t border-border/70 pt-2.5 font-mono text-[0.75rem] tabular-nums">
          <div>
            <span className="mb-0.5 block font-sans text-[0.6rem] uppercase tracking-wide text-muted-foreground/70">Qty</span>
            <b className="font-semibold">{company.quantity != null ? fmtNum(company.quantity, 0) : "—"}</b>
          </div>
          <div>
            <span className="mb-0.5 block font-sans text-[0.6rem] uppercase tracking-wide text-muted-foreground/70">Avg</span>
            <b className="font-semibold">₹{fmtPriceShort(company.avg_buy_price ?? null)}</b>
          </div>
          <div>
            <span className="mb-0.5 block font-sans text-[0.6rem] uppercase tracking-wide text-muted-foreground/70">LTP</span>
            <b className="font-semibold">₹{fmtPriceShort(metrics.price)}</b>
          </div>
        </div>
      )}

      <div className="mt-3 border-t border-border/70 pt-2.5">
        <ResearchStrip metrics={metrics} />
        {isHoldings && <AllocationBar metrics={metrics} />}
      </div>
    </button>
  );
}
