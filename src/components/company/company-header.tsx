import { Badge } from "@/components/ui/badge";
import { marginOfSafety, isBuySignal } from "@/lib/utils/calculations";
import { DeleteCompanyButton } from "@/components/dashboard/delete-company-dialogs";
import type { Company, ValuationScenario } from "@/types/database";

function fmtPrice(val: number | null): string {
  if (val == null) return "-";
  return `₹${val.toLocaleString("en-IN")}`;
}

function fmtPct(val: number | null): string {
  if (val == null) return "-";
  return `${(val * 100).toFixed(1)}%`;
}

function MetricItem({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-base font-semibold tabular-nums ${className ?? ""}`}>{value}</span>
    </div>
  );
}

export function CompanyHeader({
  company,
  scenarios,
}: {
  company: Company;
  scenarios: ValuationScenario[];
}) {
  const mos =
    company.buy_price && company.current_price
      ? marginOfSafety(company.buy_price, company.current_price)
      : null;
  const buy = isBuySignal(company.current_price, company.buy_price);

  const getIRR = (type: string) => {
    const s = scenarios.find((v) => v.scenario_type === type);
    return s?.irr ?? null;
  };

  const mosColor = mos != null ? (mos > 0 ? "text-green-600" : mos < -0.1 ? "text-red-600" : "text-yellow-600") : "";

  return (
    <div className="space-y-4">
      {/* Name bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{company.name}</h1>
          {company.symbol && (
            <span className="text-sm text-muted-foreground">{company.symbol}</span>
          )}
          {buy && <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0">BUY</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <DeleteCompanyButton companyId={company.id} companyName={company.name} />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-x-6 gap-y-3 py-3 border-y border-border/50">
        <MetricItem label="Market Cap" value={company.market_cap != null ? `₹${company.market_cap.toLocaleString("en-IN")} Cr` : "-"} />
        <MetricItem label="Current Price" value={fmtPrice(company.current_price)} />
        <MetricItem label="Buy Price" value={fmtPrice(company.buy_price)} />
        <MetricItem label="MoS" value={mos != null ? `${(mos * 100).toFixed(1)}%` : "-"} className={mosColor} />
        <MetricItem label="Star Rating" value={company.star_rating ? "★".repeat(company.star_rating) : "-"} />
        <MetricItem label="Strategy" value={company.strategy ?? "-"} />
        <MetricItem label="Horizon" value={company.investment_horizon_years ? `${company.investment_horizon_years}y` : "-"} />
        <MetricItem label="Base IRR" value={fmtPct(getIRR("base"))} className={getIRR("base") != null && getIRR("base")! > 0 ? "text-green-600" : ""} />
      </div>
    </div>
  );
}
