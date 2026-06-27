"use client";

import { useState, useMemo, Fragment } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { marginOfSafety, isBuySignal, effectiveBuyPrice, computeLiveIrr, fmtPriceShort, fmtPctShort, fmtIrr, fmtNum } from "@/lib/utils/calculations";
import { FileText, X, Loader2, ArrowRightLeft, Trash2, MoreVertical } from "lucide-react";
import { getCompanyHighlights, deleteCompany } from "@/app/(authenticated)/actions/company-actions";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import { MoveStockDialog } from "@/components/portfolio/move-stock-dialog";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
type DashboardValuationScenario = {
  scenario_type: string;
  target_market_cap: number | null;
  irr: number | null;
  buy_price: number | null;
};

type DashboardCompany = {
  id: string;
  isin: string;
  star_rating: number | null;
  strategy: string | null;
  quantity: number | null;
  avg_buy_price: number | null;
  buy_price: number | null;
  buy_date?: string | null;
  investment_horizon_years: number | null;
  indian_stocks: { name: string | null; nse_symbol: string | null; price: number | null; market_cap: number | null } | null;
  projection_models: { is_default: boolean; valuation_scenarios: DashboardValuationScenario[] }[];
};

type CompanyWithProjections = DashboardCompany;

function getDefaultScenarios(company: CompanyWithProjections): DashboardValuationScenario[] {
  const defaultModel = company.projection_models?.find((pm) => pm.is_default);
  return defaultModel?.valuation_scenarios ?? [];
}

function getScenarioReturn(
  scenarios: DashboardValuationScenario[],
  type: "base" | "bare",
  currentMarketCapRaw: number | null,
  horizon: number | null
): number | null {
  const s = scenarios.find((v) => v.scenario_type === type);
  if (!s) return null;
  return computeLiveIrr(s.target_market_cap, currentMarketCapRaw, horizon) ?? s.irr ?? null;
}

export function CompaniesTable({
  companies,
  portfolioType = "holdings",
  onRemoveCompany,
}: {
  companies: CompanyWithProjections[];
  portfolioType?: "holdings" | "watchlist";
  onRemoveCompany?: (id: string) => void;
}) {
  const isHoldings = portfolioType === "holdings";
  const router = useRouter();
  const { portfolios, selectedId } = usePortfolioContext();
  const invalidate = useInvalidateDashboard();
  const [moveTarget, setMoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");
  const [buyOnlyFilter, setBuyOnlyFilter] = useState(false);
  const [sortField, setSortField] = useState<string>("star_rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedHighlights, setExpandedHighlights] = useState<string | null>(null);
  const [highlightsCache, setHighlightsCache] = useState<Record<string, string | null>>({});
  const [highlightsLoading, setHighlightsLoading] = useState<string | null>(null);

  const toggleHighlights = async (companyId: string) => {
    if (expandedHighlights === companyId) {
      setExpandedHighlights(null);
      return;
    }
    setExpandedHighlights(companyId);
    if (!(companyId in highlightsCache)) {
      setHighlightsLoading(companyId);
      try {
        const html = await getCompanyHighlights(companyId);
        setHighlightsCache((prev) => ({ ...prev, [companyId]: html }));
      } catch {
        setHighlightsCache((prev) => ({ ...prev, [companyId]: null }));
      } finally {
        setHighlightsLoading(null);
      }
    }
  };

  const getPrice = (c: CompanyWithProjections) => {
    return c.indian_stocks?.price ?? null;
  };

  const getMarketCap = (c: CompanyWithProjections) => {
    return c.indian_stocks?.market_cap ?? null;
  };

  const filtered = useMemo(() => {
    let result = companies;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          (c.indian_stocks?.name ?? "").toLowerCase().includes(q) ||
          (c.indian_stocks?.nse_symbol ?? "").toLowerCase().includes(q)
      );
    }
    if (starFilter !== "all") {
      result = result.filter((c) => c.star_rating === Number(starFilter));
    }
    if (strategyFilter !== "all") {
      result = result.filter((c) => c.strategy === strategyFilter);
    }
    if (buyOnlyFilter) {
      result = result.filter((c) =>
        isBuySignal(getPrice(c), effectiveBuyPrice(c.buy_price, getDefaultScenarios(c)))
      );
    }

    const getSortValue = (c: CompanyWithProjections): string | number | null => {
      switch (sortField) {
        case "name":
          return c.indian_stocks?.name ?? "";
        case "current_price":
          return getPrice(c);
        case "mos": {
          const bp = effectiveBuyPrice(c.buy_price, getDefaultScenarios(c));
          const price = getPrice(c);
          return bp && price ? marginOfSafety(bp, price) : null;
        }
        case "base_cagr":
          return getScenarioReturn(getDefaultScenarios(c), "base", getMarketCap(c), c.investment_horizon_years);
        case "bare_cagr":
          return getScenarioReturn(getDefaultScenarios(c), "bare", getMarketCap(c), c.investment_horizon_years);
        case "signal": {
          const bp = effectiveBuyPrice(c.buy_price, getDefaultScenarios(c));
          return isBuySignal(getPrice(c), bp) ? 1 : 0;
        }
        case "total_cost": {
          const qty = c.quantity;
          const avgBuy = c.avg_buy_price;
          if (!qty || !avgBuy) return null;
          return avgBuy * qty;
        }
        case "market_value": {
          const qty = c.quantity;
          const price = getPrice(c);
          if (!qty || !price) return null;
          return price * qty;
        }
        case "pnl_amt": {
          const qty = c.quantity;
          const avgBuy = c.avg_buy_price;
          const price = getPrice(c);
          if (!qty || !avgBuy || !price) return null;
          return (price - avgBuy) * qty;
        }
        case "pnl_pct": {
          const avgBuy = c.avg_buy_price;
          const price = getPrice(c);
          if (!avgBuy || !price) return null;
          return ((price - avgBuy) / avgBuy) * 100;
        }
        case "buy_price":
          return effectiveBuyPrice(c.buy_price, getDefaultScenarios(c));
        default:
          return c[sortField as keyof DashboardCompany] as string | number | null;
      }
    };

    result.sort((a, b) => {
      const aVal = getSortValue(a);
      const bVal = getSortValue(b);
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [companies, search, starFilter, strategyFilter, buyOnlyFilter, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 h-8 text-sm"
        />
        <Select value={starFilter} onValueChange={(v) => setStarFilter(v ?? "all")}>
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue placeholder="Stars" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stars</SelectItem>
            {[1, 2, 3, 4].map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} Star{s > 1 ? "s" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={strategyFilter} onValueChange={(v) => setStrategyFilter(v ?? "all")}>
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue placeholder="Strategy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="core">Core</SelectItem>
            <SelectItem value="satellite">Satellite</SelectItem>
          </SelectContent>
        </Select>
        {!isHoldings && (
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={buyOnlyFilter}
              onChange={(e) => setBuyOnlyFilter(e.target.checked)}
            />
            Buy signals only
          </label>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} companies
        </span>
      </div>

      {/* Dense table */}
      <div className="border border-border/60 overflow-x-clip">
        <table className="text-sm border-collapse w-full table-fixed" role="table" aria-label="Companies portfolio table">
          {isHoldings ? (
            <colgroup>
              {/* Identity */}
              <col style={{width:"16%"}} />  {/* Company */}
              <col style={{width:"5%"}} />   {/* Star */}
              <col style={{width:"5%"}} />   {/* Type */}
              {/* Holdings (actual) */}
              <col style={{width:"5%"}} />   {/* Qty */}
              <col style={{width:"6%"}} />   {/* Avg Buy */}
              <col style={{width:"6%"}} />   {/* CMP */}
              <col style={{width:"8%"}} />   {/* Cost */}
              <col style={{width:"8%"}} />   {/* Current Value */}
              <col style={{width:"6%"}} />   {/* P&L % */}
              <col style={{width:"7%"}} />   {/* P&L ₹ */}
              {/* Research (valuation) */}
              <col style={{width:"6%"}} />   {/* Target Buy */}
              <col style={{width:"5%"}} />   {/* MoS% */}
              <col style={{width:"6%"}} />   {/* Base Case */}
              <col style={{width:"6%"}} />   {/* Bare Case */}
              {/* Actions */}
              <col style={{width:"5%"}} />   {/* Actions */}
            </colgroup>
          ) : (
            <colgroup>
              <col className="w-[19%]" />
              <col className="w-[5%]" />
              <col className="w-[7%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
            </colgroup>
          )}
          <thead>
            <tr className="border-b-2 border-border/40 bg-muted/30">
              <th
                scope="col" className="sticky top-0 z-10 bg-muted/30 text-left px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("name")}
              >
                Company<SortIcon field="name" />
              </th>
              <th
                scope="col" className="sticky top-0 z-10 bg-muted/30 text-center px-1 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("star_rating")}
              >
                Star<SortIcon field="star_rating" />
              </th>
              <th
                scope="col" className="sticky top-0 z-10 bg-muted/30 text-center px-1 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("strategy")}
              >
                Type<SortIcon field="strategy" />
              </th>
              {isHoldings ? (
                <>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("quantity")}
                  >
                    Qty<SortIcon field="quantity" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("avg_buy_price")}
                  >
                    Avg Buy<SortIcon field="avg_buy_price" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("current_price")}
                  >
                    CMP<SortIcon field="current_price" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("total_cost")}
                  >
                    Cost<SortIcon field="total_cost" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("market_value")}
                  >
                    Cur. Value<SortIcon field="market_value" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("pnl_pct")}
                  >
                    P&L %<SortIcon field="pnl_pct" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("pnl_amt")}
                  >
                    P&L ₹<SortIcon field="pnl_amt" />
                  </th>
                  {/* Research / Valuation columns */}
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground border-l border-border/40"
                    onClick={() => toggleSort("buy_price")}
                  >
                    Target Buy<SortIcon field="buy_price" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("mos")}
                  >
                    MoS%<SortIcon field="mos" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("base_cagr")}
                  >
                    Base Case<SortIcon field="base_cagr" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("bare_cagr")}
                  >
                    Bare Case<SortIcon field="bare_cagr" />
                  </th>
                </>
              ) : (
                <>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("buy_price")}
                  >
                    Target Buy<SortIcon field="buy_price" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("current_price")}
                  >
                    CMP<SortIcon field="current_price" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("mos")}
                  >
                    MoS%<SortIcon field="mos" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("base_cagr")}
                  >
                    Base CAGR<SortIcon field="base_cagr" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("bare_cagr")}
                  >
                    Bare CAGR<SortIcon field="bare_cagr" />
                  </th>
                  <th
                    scope="col" className="sticky top-0 z-10 bg-muted/30 text-center px-2 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => toggleSort("signal")}
                  >
                    Signal<SortIcon field="signal" />
                  </th>
                </>
              )}
              <th scope="col" className="sticky top-0 z-10 bg-muted/30 text-center px-1 py-2 text-xs font-medium text-muted-foreground border-l border-border/40">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((company, idx) => {
              const currentPrice = getPrice(company);
              const buyPrice = effectiveBuyPrice(company.buy_price, getDefaultScenarios(company));
              const isDefaulted = company.buy_price == null && buyPrice != null;
              const mos =
                buyPrice && currentPrice
                  ? marginOfSafety(buyPrice, currentPrice)
                  : null;
              const buy = isBuySignal(currentPrice, buyPrice);
              const baseReturn = getScenarioReturn(getDefaultScenarios(company), "base", getMarketCap(company), company.investment_horizon_years);
              const bareReturn = getScenarioReturn(getDefaultScenarios(company), "bare", getMarketCap(company), company.investment_horizon_years);

              return (
                <Fragment key={company.id}>
                <tr
                  className={`cursor-pointer border-b border-border/20 hover:bg-muted/40 transition-colors ${
                    idx % 2 === 0 ? "" : "bg-muted/15"
                  }`}
                  onClick={() => router.push(`/company/${company.id}`)}
                >
                  <td className="px-2 py-2 font-medium truncate">
                    {company.indian_stocks?.name ?? ""}
                    {company.indian_stocks?.nse_symbol && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {company.indian_stocks.nse_symbol}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-2 text-center text-sm">
                    {"★".repeat(company.star_rating ?? 0)}
                  </td>
                  <td className="px-1 py-2 text-center text-xs capitalize text-muted-foreground">
                    {company.strategy ?? "-"}
                  </td>
                  {isHoldings ? (
                    <>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {company.quantity != null ? fmtNum(company.quantity, 0) : "-"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmtPriceShort(company.avg_buy_price ?? null)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmtPriceShort(currentPrice)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {company.quantity && company.avg_buy_price
                          ? fmtPriceShort(company.avg_buy_price * company.quantity)
                          : "-"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {company.quantity && currentPrice
                          ? fmtPriceShort(currentPrice * company.quantity)
                          : "-"}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums font-medium ${
                        (() => {
                          const avgBuy = company.avg_buy_price;
                          if (!avgBuy || !currentPrice) return "";
                          const pct = ((currentPrice - avgBuy) / avgBuy) * 100;
                          return pct >= 0 ? "text-green-600" : "text-red-600";
                        })()
                      }`}>
                        {(() => {
                          const avgBuy = company.avg_buy_price;
                          if (!avgBuy || !currentPrice) return "-";
                          const pct = ((currentPrice - avgBuy) / avgBuy) * 100;
                          return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
                        })()}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums font-medium ${
                        (() => {
                          const qty = company.quantity;
                          const avgBuy = company.avg_buy_price;
                          if (!qty || !avgBuy || !currentPrice) return "";
                          return (currentPrice - avgBuy) * qty >= 0 ? "text-green-600" : "text-red-600";
                        })()
                      }`}>
                        {(() => {
                          const qty = company.quantity;
                          const avgBuy = company.avg_buy_price;
                          if (!qty || !avgBuy || !currentPrice) return "-";
                          const amt = (currentPrice - avgBuy) * qty;
                          return `${amt >= 0 ? "+" : ""}${fmtPriceShort(amt)}`;
                        })()}
                      </td>
                      {/* Research / Valuation columns */}
                      <td className={`px-2 py-2 text-right tabular-nums border-l border-border/40 ${isDefaulted ? "text-muted-foreground italic" : ""}`} title={isDefaulted ? "Base case buy price (no manual override)" : undefined}>
                        {fmtPriceShort(buyPrice)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right tabular-nums font-medium ${
                          mos != null
                            ? mos > 0
                              ? "text-green-600"
                              : mos < -0.1
                                ? "text-red-600"
                                : "text-yellow-600"
                            : ""
                        }`}
                      >
                        {fmtPctShort(mos)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmtIrr(baseReturn)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmtIrr(bareReturn)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${isDefaulted ? "text-muted-foreground italic" : ""}`} title={isDefaulted ? "Base case buy price (no manual override)" : undefined}>
                        {fmtPriceShort(buyPrice)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtPriceShort(currentPrice)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums font-medium ${
                          mos != null
                            ? mos > 0
                              ? "text-green-600"
                              : mos < -0.1
                                ? "text-red-600"
                                : "text-yellow-600"
                            : ""
                        }`}
                      >
                        {fmtPctShort(mos)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtIrr(baseReturn)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtIrr(bareReturn)}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        {buy && (
                          <span className="text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded">
                            BUY
                          </span>
                        )}
                      </td>
                    </>
                  )}
                  <td className="px-1 py-2 text-center border-l border-border/40">
                    <div className="inline-flex items-center justify-center gap-0">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleHighlights(company.id);
                            }}
                            className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            aria-label={expandedHighlights === company.id ? "Hide highlights" : "View highlights"}
                          >
                            {highlightsLoading === company.id ? (
                              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            ) : expandedHighlights === company.id ? (
                              <X size={14} aria-hidden="true" />
                            ) : (
                              <FileText size={14} aria-hidden="true" />
                            )}
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {expandedHighlights === company.id ? "Hide highlights" : "View highlights"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          aria-label={`More actions for ${company.indian_stocks?.name ?? company.isin}`}
                        >
                          <MoreVertical size={14} aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="bottom">
                          {portfolios.length > 1 && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setMoveTarget({
                                  id: company.id,
                                  name: company.indian_stocks?.name ?? company.isin,
                                });
                              }}
                            >
                              <ArrowRightLeft size={14} aria-hidden="true" />
                              Move to another portfolio
                            </DropdownMenuItem>
                          )}
                          {portfolios.length > 1 && <DropdownMenuSeparator />}
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({
                                id: company.id,
                                name: company.indian_stocks?.name ?? company.isin,
                              });
                            }}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            Delete company
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
                <tr className={idx % 2 === 0 ? "" : "bg-muted/15"}>
                  <td colSpan={isHoldings ? 16 : 10} className="p-0 border-b border-border/20">
                    <div
                      className="grid transition-[grid-template-rows] duration-250 ease-out"
                      style={{ gridTemplateRows: expandedHighlights === company.id ? "1fr" : "0fr" }}
                    >
                      <div className="overflow-hidden">
                        {(expandedHighlights === company.id || company.id in highlightsCache) && (
                          <div className="px-4 py-3">
                            {highlightsLoading === company.id ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground h-[60px]">
                                <Loader2 size={14} className="animate-spin" />
                                Loading...
                              </div>
                            ) : highlightsCache[company.id] ? (
                              <div
                                className="prose prose-sm max-w-none text-sm text-foreground prose-headings:text-foreground prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5"
                                dangerouslySetInnerHTML={{ __html: highlightsCache[company.id]! }}
                              />
                            ) : (
                              <p className="text-sm text-muted-foreground">No highlights yet.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isHoldings ? 16 : 10} className="text-center py-8 text-sm text-muted-foreground">
                  No companies found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {moveTarget && (
        <MoveStockDialog
          open={!!moveTarget}
          onOpenChange={(open) => {
            if (!open) setMoveTarget(null);
          }}
          companyId={moveTarget.id}
          companyName={moveTarget.name}
          currentPortfolioId={selectedId}
          portfolios={portfolios}
          onMoved={() => {
            onRemoveCompany?.(moveTarget.id);
            setMoveTarget(null);
          }}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this company and all its financial
              data, valuations, and timeline entries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleting(true);
                try {
                  await deleteCompany(deleteTarget.id);
                  invalidate();
                  onRemoveCompany?.(deleteTarget.id);
                  setDeleteTarget(null);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting..." : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
