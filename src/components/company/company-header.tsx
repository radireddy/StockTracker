"use client";

import { Badge } from "@/components/ui/badge";
import { marginOfSafety, isBuySignal, effectiveBuyPrice, fmtPrice, fmtIrr, fmtMarketCap } from "@/lib/utils/calculations";
import { DeleteCompanyButton } from "@/components/dashboard/delete-company-dialogs";
import type { Company } from "@/types/database";

function MetricItem({ label, value, className, title }: { label: string; value: string; className?: string; title?: string }) {
  return (
    <div className="flex flex-col" title={title}>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${className ?? ""}`}>{value}</span>
    </div>
  );
}

export function CompanyHeader({
  company,
  baseIrr,
}: {
  company: Company;
  baseIrr: number | null;
}) {
  const currentPrice = company.indian_stocks?.price ?? null;
  const marketCap = company.indian_stocks?.market_cap ?? null;
  const scenarios = (() => {
    const models = (company as any).projection_models ?? [];
    const defaultModel = models.find((pm: any) => pm.is_default);
    return defaultModel?.valuation_scenarios ?? [];
  })();
  const buyPrice = effectiveBuyPrice(company.buy_price, scenarios);
  const isDefaulted = company.buy_price == null && buyPrice != null;
  const mos =
    buyPrice && currentPrice
      ? marginOfSafety(buyPrice, currentPrice)
      : null;
  const buy = isBuySignal(currentPrice, buyPrice);

  const mosColor = mos != null ? (mos > 0 ? "text-green-600" : mos < -0.1 ? "text-red-600" : "text-yellow-600") : "";

  const companyName = company.indian_stocks?.name ?? "Unknown";
  const companySymbol = company.indian_stocks?.nse_symbol ?? null;

  return (
    <div className="space-y-4 pt-2">
      {/* Name bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{companyName}</h1>
          {companySymbol && (
            <span className="text-base text-muted-foreground">{companySymbol}</span>
          )}
          {buy && <Badge className="bg-green-600 text-white text-xs px-2 py-0.5">BUY</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <DeleteCompanyButton companyId={company.id} companyName={companyName} />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-x-6 gap-y-3 py-3 border-y border-border/50">
        <MetricItem label="Current Price" value={fmtPrice(currentPrice)} />
        <MetricItem label="Market Cap" value={fmtMarketCap(marketCap)} />
        <MetricItem label="Target Buy Price" value={fmtPrice(buyPrice)} className={isDefaulted ? "text-muted-foreground italic" : ""} title={isDefaulted ? "Base case buy price (no manual override)" : undefined} />
        <MetricItem label="MoS" value={mos != null ? `${(mos * 100).toFixed(1)}%` : "-"} className={mosColor} />
        <MetricItem label="Star Rating" value={company.star_rating ? "★".repeat(company.star_rating) : "-"} />
        <MetricItem label="Strategy" value={company.strategy ?? "-"} />
        <MetricItem label="Sector" value={company.indian_stocks?.sector ?? "-"} />
        <MetricItem label="Horizon" value={company.investment_horizon_years ? `${company.investment_horizon_years}y` : "0y"} className="cursor-help" title="Auto-calculated from Financial Model estimates" />
        <MetricItem label="Base IRR" value={fmtIrr(baseIrr)} className={baseIrr != null && baseIrr > 0 ? "text-green-600" : ""} />
      </div>
    </div>
  );
}
