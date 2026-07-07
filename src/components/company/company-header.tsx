"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Stars } from "@/components/ui/stars";
import { marginOfSafety, isBuySignal, effectiveBuyPrice, fmtPrice, fmtIrr, fmtMarketCap } from "@/lib/utils/calculations";
import { DeleteCompanyButton } from "@/components/dashboard/delete-company-dialogs";
import { useSaveStatus } from "@/contexts/save-status-context";
import type { CompanyWithRelations } from "@/types/database";

function MetricItem({ label, value, className, title }: { label: string; value: ReactNode; className?: string; title?: string }) {
  return (
    <div className="flex flex-col" title={title}>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${className ?? ""}`}>{value}</span>
    </div>
  );
}

function SaveIndicator() {
  const { status } = useSaveStatus();
  if (status === "idle") return null;
  const label =
    status === "saving" ? "Saving…" :
    status === "saved" ? "✓ Saved" :
    "Save failed";
  const color =
    status === "saving" ? "text-muted-foreground" :
    status === "saved" ? "text-positive" :
    "text-destructive";
  return <span className={`text-xs ${color}`}>{label}</span>;
}

export function CompanyHeader({
  company,
  baseIrr,
}: {
  company: CompanyWithRelations;
  baseIrr: number | null;
}) {
  const currentPrice = company.indian_stocks?.price ?? null;
  const marketCap = company.indian_stocks?.market_cap ?? null;
  const scenarios = (() => {
    const models = company.projection_models ?? [];
    const defaultModel = models.find((pm) => pm.is_default);
    return defaultModel?.valuation_scenarios ?? [];
  })();
  const buyPrice = effectiveBuyPrice(company.buy_price, scenarios);
  const isDefaulted = company.buy_price == null && buyPrice != null;
  const mos =
    buyPrice && currentPrice
      ? marginOfSafety(buyPrice, currentPrice)
      : null;
  const buy = isBuySignal(currentPrice, buyPrice);

  const mosColor = mos != null ? (mos > 0 ? "text-positive" : mos < -0.1 ? "text-destructive" : "text-warning") : "";

  const companyName = company.indian_stocks?.name ?? "Unknown";
  const companySymbol = company.indian_stocks?.nse_symbol ?? null;

  return (
    <div className="space-y-4 pt-2">
      {/* Name bar — 2-row on mobile: name on top, symbol+badge+actions below */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-snug sm:text-2xl">{companyName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {companySymbol && (
              <span className="text-sm text-muted-foreground">{companySymbol}</span>
            )}
            {buy && <Badge className="border-transparent bg-positive/15 text-positive text-xs px-2 py-0.5">BUY</Badge>}
            <SaveIndicator />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <DeleteCompanyButton companyId={company.id} companyName={companyName} />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-x-4 gap-y-3 border-y border-border/50 py-4 sm:gap-x-6">
        <MetricItem label="Current Price" value={fmtPrice(currentPrice)} />
        <MetricItem label="Market Cap" value={fmtMarketCap(marketCap)} />
        <MetricItem label="Target Buy" value={fmtPrice(buyPrice)} className={isDefaulted ? "text-muted-foreground italic" : ""} title={isDefaulted ? "Base case buy price (no manual override)" : undefined} />
        <MetricItem label="MoS" value={mos != null ? `${(mos * 100).toFixed(1)}%` : "-"} className={mosColor} />
        <MetricItem
          label="Star Rating"
          value={company.star_rating ? <Stars rating={company.star_rating} className="text-lg" /> : "-"}
        />
        <MetricItem label="Strategy" value={company.strategy ?? "-"} />
        <MetricItem label="Sector" value={company.indian_stocks?.sector ?? "-"} />
        <MetricItem label="Horizon" value={company.investment_horizon_years ? `${company.investment_horizon_years}y` : "0y"} className="cursor-help" title="Auto-calculated from Financial Model estimates" />
        <MetricItem label="Base IRR" value={fmtIrr(baseIrr)} className={baseIrr != null && baseIrr > 0 ? "text-positive" : ""} />
      </div>
    </div>
  );
}
