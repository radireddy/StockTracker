"use client";

import { useState, useMemo, Fragment } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { marginOfSafety, isBuySignal, effectiveBuyPrice, computeLiveIrr, fmtPriceShort, fmtAmountShort, fmtPctShort, fmtIrr, fmtNum, getEffectiveRanges, getRangeForStar, getAllocationStatus, getAllocationDelta } from "@/lib/utils/calculations";
import type { AllocationStatus } from "@/lib/utils/calculations";
import { FileText, X, Loader2, ArrowRightLeft, Trash2, MoreVertical, Upload, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
import type { AllocationRanges } from "@/types/database";

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

// Responsive column visibility:
// Hidden on mobile (< lg): Star, Type, Cost, P&L ₹, Bare Case
const HIDE_MOBILE = "hidden lg:table-cell";

type ViewMode = "portfolio" | "allocation";

const BORDER_COLORS: Record<AllocationStatus, string> = {
  under: "border-l-[3px] border-l-rose-400",
  in_range: "border-l-[3px] border-l-green-500",
  over: "border-l-[3px] border-l-red-600",
};

const STATUS_BG: Record<AllocationStatus, string> = {
  under: "bg-rose-50/50 dark:bg-rose-950/20",
  in_range: "bg-green-50/50 dark:bg-green-950/20",
  over: "bg-red-50/50 dark:bg-red-950/20",
};

const STATUS_TEXT: Record<AllocationStatus, string> = {
  under: "text-rose-500",
  in_range: "text-green-600",
  over: "text-red-600",
};

const STATUS_LABEL: Record<AllocationStatus, string> = {
  under: "Under",
  in_range: "In Range",
  over: "Over",
};

function fmtRupee(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.abs(n));
}

/**
 * Empty state rendered inside the table body.
 * - When the portfolio has no companies at all (`hasCompanies` false), show
 *   inline actions to import a statement (holdings only) or add a company.
 * - When companies exist but filters/search matched nothing, show a simpler
 *   "no matches" message.
 */
function EmptyState({
  hasCompanies,
  isHoldings,
}: {
  hasCompanies: boolean;
  isHoldings: boolean;
}) {
  if (hasCompanies) {
    return (
      <tr>
        <td colSpan={99} className="text-center py-8 text-sm text-muted-foreground">
          No companies match your filters.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={99} className="px-4 py-12">
        <div className="mx-auto flex max-w-sm flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {isHoldings ? <Upload size={20} /> : <Plus size={20} />}
          </div>
          <p className="text-sm font-medium text-foreground">
            {isHoldings ? "No holdings yet" : "No companies yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isHoldings
              ? "Import a broker statement or add a company manually to get started."
              : "Add a company to start tracking it."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {isHoldings && (
              <Link href="/import">
                <Button size="sm" className="h-8 text-sm">
                  <Upload size={14} className="mr-1.5" />
                  Import statement
                </Button>
              </Link>
            )}
            <Link href="/company/new">
              <Button
                size="sm"
                variant={isHoldings ? "outline" : "default"}
                className="h-8 text-sm"
              >
                <Plus size={14} className="mr-1.5" />
                Add company
              </Button>
            </Link>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function CompaniesTable({
  companies,
  portfolioType = "holdings",
  onRemoveCompany,
  allocationRanges,
}: {
  companies: CompanyWithProjections[];
  portfolioType?: "holdings" | "watchlist";
  onRemoveCompany?: (id: string) => void;
  allocationRanges?: AllocationRanges | null;
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
  const [viewMode, setViewMode] = useState<ViewMode>("portfolio");
  const [allocationBasis, setAllocationBasis] = useState<"invested" | "current">("invested");
  const [allocationStatusFilter, setAllocationStatusFilter] = useState<string>("all");

  const ranges = getEffectiveRanges(allocationRanges ?? null);

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

  // Compute portfolio totals for allocation calculations
  const { totalCost, totalValue } = useMemo(() => {
    let tc = 0;
    let tv = 0;
    for (const c of companies) {
      const qty = c.quantity;
      const avgBuy = c.avg_buy_price;
      const price = c.indian_stocks?.price;
      if (qty && avgBuy) tc += qty * avgBuy;
      if (qty && price) tv += qty * price;
    }
    return { totalCost: tc, totalValue: tv };
  }, [companies]);

  // Get allocation data for a company
  const getAllocationData = (c: CompanyWithProjections) => {
    const qty = c.quantity ?? 0;
    const avgBuy = c.avg_buy_price ?? 0;
    const price = c.indian_stocks?.price ?? 0;
    const costAmt = qty * avgBuy;
    const valueAmt = qty * price;
    const costPct = totalCost > 0 ? (costAmt / totalCost) * 100 : 0;
    const valuePct = totalValue > 0 ? (valueAmt / totalValue) * 100 : 0;
    const range = getRangeForStar(c.star_rating, ranges);
    const costStatus = getAllocationStatus(costPct, range);
    const valueStatus = getAllocationStatus(valuePct, range);
    const costDelta = getAllocationDelta(costPct, range);
    const valueDelta = getAllocationDelta(valuePct, range);
    return { costPct, valuePct, range, costStatus, valueStatus, costDelta, valueDelta };
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
    // Allocation status filter (only in allocation view for holdings)
    if (viewMode === "allocation" && allocationStatusFilter !== "all") {
      result = result.filter((c) => {
        const ad = getAllocationData(c);
        const status = allocationBasis === "invested" ? ad.costStatus : ad.valueStatus;
        return status === allocationStatusFilter;
      });
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
        // Allocation sort fields
        case "cost_pct":
          return getAllocationData(c).costPct;
        case "value_pct":
          return getAllocationData(c).valuePct;
        case "alloc_delta": {
          const ad = getAllocationData(c);
          return allocationBasis === "invested" ? ad.costDelta : ad.valueDelta;
        }
        case "alloc_status": {
          const ad2 = getAllocationData(c);
          const s = allocationBasis === "invested" ? ad2.costStatus : ad2.valueStatus;
          return s === "over" ? 2 : s === "under" ? 0 : 1;
        }
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
  }, [companies, search, starFilter, strategyFilter, buyOnlyFilter, sortField, sortDir, viewMode, allocationBasis, allocationStatusFilter, totalCost, totalValue, ranges]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // Common th class for holdings headers
  const thBase = "sticky top-0 z-10 bg-muted/30 px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground";
  const thRight = `${thBase} text-right`;
  const thCenter = `${thBase} text-center`;

  const showAllocationView = viewMode === "allocation" && isHoldings;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {isHoldings && (
          <div className="inline-flex rounded-md border border-border/60 overflow-hidden text-xs">
            <button
              className={`px-3 py-1.5 transition-colors ${viewMode === "portfolio" ? "bg-foreground text-background font-medium" : "hover:bg-muted/50"}`}
              onClick={() => { setViewMode("portfolio"); setAllocationStatusFilter("all"); }}
            >
              Portfolio
            </button>
            <button
              className={`px-3 py-1.5 transition-colors border-l border-border/60 ${viewMode === "allocation" ? "bg-foreground text-background font-medium" : "hover:bg-muted/50"}`}
              onClick={() => setViewMode("allocation")}
            >
              Allocation
            </button>
          </div>
        )}
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
        {!showAllocationView && (
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
        )}
        {showAllocationView && (
          <>
            <div className="inline-flex rounded-md border border-border/60 overflow-hidden text-xs">
              <button
                className={`px-3 py-1.5 transition-colors ${allocationBasis === "invested" ? "bg-foreground text-background font-medium" : "hover:bg-muted/50"}`}
                onClick={() => setAllocationBasis("invested")}
              >
                Invested
              </button>
              <button
                className={`px-3 py-1.5 transition-colors border-l border-border/60 ${allocationBasis === "current" ? "bg-foreground text-background font-medium" : "hover:bg-muted/50"}`}
                onClick={() => setAllocationBasis("current")}
              >
                Current
              </button>
            </div>
            <Select value={allocationStatusFilter} onValueChange={(v) => setAllocationStatusFilter(v ?? "all")}>
              <SelectTrigger className="w-32 h-8 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="over">Over-allocated</SelectItem>
                <SelectItem value="in_range">In Range</SelectItem>
                <SelectItem value="under">Under-allocated</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
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

      {showAllocationView && (
        <p className="text-xs text-muted-foreground">
          Hover over Invested/Current %, Status, or Delta for target range and actionable amounts in rupees.
        </p>
      )}

      {/* Table */}
      <div className="border border-border/60 overflow-x-auto">
        {showAllocationView ? (
          <AllocationTable
            filtered={filtered}
            getAllocationData={getAllocationData}
            allocationBasis={allocationBasis}
            totalCost={totalCost}
            totalValue={totalValue}
            toggleSort={toggleSort}
            sortField={sortField}
            sortDir={sortDir}
            thBase={thBase}
            thRight={thRight}
            thCenter={thCenter}
            router={router}
            hasCompanies={companies.length > 0}
          />
        ) : (
          <table className="text-sm border-collapse w-full lg:table-fixed" role="table" aria-label="Companies portfolio table">
            {!isHoldings && (
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
                  scope="col" className={`${thBase} text-left`}
                  style={{width:"16%"}}
                  onClick={() => toggleSort("name")}
                >
                  Company<SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                </th>
                {isHoldings ? (
                  <>
                    <th
                      scope="col" className={`${thCenter} ${HIDE_MOBILE}`}
                      style={{width:"5%"}}
                      onClick={() => toggleSort("star_rating")}
                    >
                      Star<SortIcon field="star_rating" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={`${thCenter} ${HIDE_MOBILE}`}
                      style={{width:"5%"}}
                      onClick={() => toggleSort("strategy")}
                    >
                      Type<SortIcon field="strategy" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={thRight}
                      style={{width:"5%"}}
                      onClick={() => toggleSort("quantity")}
                    >
                      Qty<SortIcon field="quantity" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={thRight}
                      style={{width:"6%"}}
                      onClick={() => toggleSort("avg_buy_price")}
                    >
                      Avg Buy<SortIcon field="avg_buy_price" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={thRight}
                      style={{width:"6%"}}
                      onClick={() => toggleSort("current_price")}
                    >
                      CMP<SortIcon field="current_price" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={`${thRight} ${HIDE_MOBILE}`}
                      style={{width:"8%"}}
                      onClick={() => toggleSort("total_cost")}
                    >
                      Cost<SortIcon field="total_cost" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={thRight}
                      style={{width:"8%"}}
                      onClick={() => toggleSort("market_value")}
                    >
                      Cur. Value<SortIcon field="market_value" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={thRight}
                      style={{width:"6%"}}
                      onClick={() => toggleSort("pnl_pct")}
                    >
                      P&L %<SortIcon field="pnl_pct" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={`${thRight} ${HIDE_MOBILE}`}
                      style={{width:"7%"}}
                      onClick={() => toggleSort("pnl_amt")}
                    >
                      P&L ₹<SortIcon field="pnl_amt" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={`${thRight} border-l border-border/40`}
                      style={{width:"6%"}}
                      onClick={() => toggleSort("buy_price")}
                    >
                      Target Buy<SortIcon field="buy_price" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={thRight}
                      style={{width:"5%"}}
                      onClick={() => toggleSort("mos")}
                    >
                      MoS%<SortIcon field="mos" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={thRight}
                      style={{width:"6%"}}
                      onClick={() => toggleSort("base_cagr")}
                    >
                      Base Case<SortIcon field="base_cagr" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={`${thRight} ${HIDE_MOBILE}`}
                      style={{width:"6%"}}
                      onClick={() => toggleSort("bare_cagr")}
                    >
                      Bare Case<SortIcon field="bare_cagr" sortField={sortField} sortDir={sortDir} />
                    </th>
                  </>
                ) : (
                  <>
                    <th
                      scope="col" className={`${thCenter} ${HIDE_MOBILE}`}
                      onClick={() => toggleSort("star_rating")}
                    >
                      Star<SortIcon field="star_rating" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={`${thCenter} ${HIDE_MOBILE}`}
                      onClick={() => toggleSort("strategy")}
                    >
                      Type<SortIcon field="strategy" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("buy_price")}
                    >
                      Target Buy<SortIcon field="buy_price" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("current_price")}
                    >
                      CMP<SortIcon field="current_price" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("mos")}
                    >
                      MoS%<SortIcon field="mos" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("base_cagr")}
                    >
                      Base CAGR<SortIcon field="base_cagr" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className={`sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground ${HIDE_MOBILE}`}
                      onClick={() => toggleSort("bare_cagr")}
                    >
                      Bare CAGR<SortIcon field="bare_cagr" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      scope="col" className="sticky top-0 z-10 bg-muted/30 text-center px-2 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("signal")}
                    >
                      Signal<SortIcon field="signal" sortField={sortField} sortDir={sortDir} />
                    </th>
                  </>
                )}
                <th scope="col" className={`${thCenter} border-l border-border/40`} style={{width:"5%"}}>
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

                // Allocation border color (only for holdings portfolio view)
                const allocData = isHoldings ? getAllocationData(company) : null;
                const activeStatus = allocData ? (allocationBasis === "invested" ? allocData.costStatus : allocData.valueStatus) : null;
                const borderClass = isHoldings && activeStatus ? BORDER_COLORS[activeStatus] : "";

                return (
                  <Fragment key={company.id}>
                  <tr
                    className={`cursor-pointer border-b border-border/20 hover:bg-muted/40 transition-colors ${
                      idx % 2 === 0 ? "" : "bg-muted/15"
                    } ${borderClass}`}
                    title={isHoldings && activeStatus ? `Allocation: ${STATUS_LABEL[activeStatus]}` : undefined}
                    onClick={() => router.push(`/company/${company.id}`)}
                  >
                    <td className="px-2 py-2 font-medium truncate max-w-0">
                      <Link
                        href={`/company/${company.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {company.indian_stocks?.name ?? ""}
                        {company.indian_stocks?.nse_symbol && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {company.indian_stocks.nse_symbol}
                          </span>
                        )}
                        {isHoldings && activeStatus && (
                          <span className="sr-only"> — allocation {STATUS_LABEL[activeStatus]}</span>
                        )}
                      </Link>
                    </td>
                    {isHoldings ? (
                      <>
                        <td className={`px-1 py-2 text-center text-sm ${HIDE_MOBILE}`}>
                          <StarRating rating={company.star_rating} />
                        </td>
                        <td className={`px-1 py-2 text-center text-xs capitalize text-muted-foreground ${HIDE_MOBILE}`}>
                          {company.strategy ?? "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                          {company.quantity != null ? fmtNum(company.quantity, 0) : "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                          {fmtPriceShort(company.avg_buy_price ?? null)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                          {fmtPriceShort(currentPrice)}
                        </td>
                        <td className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${HIDE_MOBILE}`}>
                          {company.quantity && company.avg_buy_price
                            ? fmtAmountShort(company.avg_buy_price * company.quantity)
                            : "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                          {company.quantity && currentPrice
                            ? fmtAmountShort(currentPrice * company.quantity)
                            : "-"}
                        </td>
                        <td className={`px-2 py-2 text-right tabular-nums font-medium whitespace-nowrap ${
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
                        <td className={`px-2 py-2 text-right tabular-nums font-medium whitespace-nowrap ${HIDE_MOBILE} ${
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
                            return `${amt >= 0 ? "+" : ""}${fmtAmountShort(amt)}`;
                          })()}
                        </td>
                        <td className={`px-2 py-2 text-right tabular-nums whitespace-nowrap border-l border-border/40 ${isDefaulted ? "text-muted-foreground italic" : ""}`} title={isDefaulted ? "Base case buy price (no manual override)" : undefined}>
                          {fmtPriceShort(buyPrice)}
                        </td>
                        <td
                          className={`px-2 py-2 text-right tabular-nums font-medium whitespace-nowrap ${
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
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                          {fmtIrr(baseReturn)}
                        </td>
                        <td className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${HIDE_MOBILE}`}>
                          {fmtIrr(bareReturn)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={`px-1 py-2 text-center text-sm ${HIDE_MOBILE}`}>
                          <StarRating rating={company.star_rating} />
                        </td>
                        <td className={`px-1 py-2 text-center text-xs capitalize text-muted-foreground ${HIDE_MOBILE}`}>
                          {company.strategy ?? "-"}
                        </td>
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
                        <td className={`px-3 py-2.5 text-right tabular-nums ${HIDE_MOBILE}`}>
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
                    <td colSpan={99} className="p-0 border-b border-border/20">
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
                <EmptyState hasCompanies={companies.length > 0} isHoldings={isHoldings} />
              )}
            </tbody>
          </table>
        )}
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

// --- Allocation View Table ---

function RangeBar({ actual, min, max, status }: { actual: number; min: number; max: number; status: AllocationStatus }) {
  // Determine bar scale: show range from 0 to max(actual, max) * 1.3
  const upperBound = Math.max(actual, max) * 1.3 || 10;
  const minPos = (min / upperBound) * 100;
  const maxPos = (max / upperBound) * 100;
  const actualPos = Math.min((actual / upperBound) * 100, 100);

  const barColor = status === "over" ? "bg-red-500" : status === "under" ? "bg-rose-400" : "bg-green-500";

  return (
    <div className="relative h-3 w-full min-w-[80px] bg-muted/40 rounded-sm overflow-hidden">
      {/* Target range background */}
      <div
        className="absolute top-0 h-full bg-muted/60 rounded-sm"
        style={{ left: `${minPos}%`, width: `${maxPos - minPos}%` }}
      />
      {/* Actual value bar */}
      <div
        className={`absolute top-0.5 h-2 rounded-sm ${barColor}`}
        style={{ left: 0, width: `${actualPos}%` }}
      />
      {/* Range boundary markers */}
      <div
        className="absolute top-0 h-full w-px bg-foreground/30"
        style={{ left: `${minPos}%` }}
      />
      <div
        className="absolute top-0 h-full w-px bg-foreground/30"
        style={{ left: `${maxPos}%` }}
      />
    </div>
  );
}

function SortIcon({
  field,
  sortField,
  sortDir,
}: {
  field: string;
  sortField: string;
  sortDir: "asc" | "desc";
}) {
  if (sortField !== field) return null;
  return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

/** Star rating with a text alternative for assistive tech. */
function StarRating({ rating }: { rating: number | null }) {
  const n = rating ?? 0;
  if (n <= 0) return null;
  return (
    <span aria-label={`${n} of 4 stars`}>
      <span aria-hidden="true">{"★".repeat(n)}</span>
    </span>
  );
}

function AllocationTable({
  filtered,
  getAllocationData,
  allocationBasis,
  totalCost,
  totalValue,
  toggleSort,
  sortField,
  sortDir,
  thBase,
  thRight,
  thCenter,
  router,
  hasCompanies,
}: {
  filtered: CompanyWithProjections[];
  getAllocationData: (c: CompanyWithProjections) => {
    costPct: number;
    valuePct: number;
    range: { min: number; max: number };
    costStatus: AllocationStatus;
    valueStatus: AllocationStatus;
    costDelta: number;
    valueDelta: number;
  };
  allocationBasis: "invested" | "current";
  totalCost: number;
  totalValue: number;
  toggleSort: (field: string) => void;
  sortField: string;
  sortDir: "asc" | "desc";
  thBase: string;
  thRight: string;
  thCenter: string;
  router: ReturnType<typeof useRouter>;
  hasCompanies: boolean;
}) {
  const basisLabel = allocationBasis === "invested" ? "Invested" : "Current";
  return (
    <table className="text-sm border-collapse w-full lg:table-fixed" role="table" aria-label="Allocation analysis table">
      <thead>
        <tr className="border-b-2 border-border/40 bg-muted/30">
          <th
            scope="col" className={`${thBase} text-left`}
            style={{ width: "16%" }}
            onClick={() => toggleSort("name")}
          >
            Company<SortIcon field="name" sortField={sortField} sortDir={sortDir} />
          </th>
          <th
            scope="col" className={thCenter}
            style={{ width: "5%" }}
            onClick={() => toggleSort("star_rating")}
          >
            Star<SortIcon field="star_rating" sortField={sortField} sortDir={sortDir} />
          </th>
          <th
            scope="col" className={thRight}
            style={{ width: "6%" }}
            onClick={() => toggleSort("current_price")}
          >
            CMP<SortIcon field="current_price" sortField={sortField} sortDir={sortDir} />
          </th>
          <th
            scope="col" className={`${thRight} ${HIDE_MOBILE}`}
            style={{ width: "6%" }}
            onClick={() => toggleSort("buy_price")}
          >
            Target Buy<SortIcon field="buy_price" sortField={sortField} sortDir={sortDir} />
          </th>
          <th
            scope="col" className={thRight}
            style={{ width: "6%" }}
            onClick={() => toggleSort("cost_pct")}
          >
            Invested %<SortIcon field="cost_pct" sortField={sortField} sortDir={sortDir} />
          </th>
          <th
            scope="col" className={thRight}
            style={{ width: "6%" }}
            onClick={() => toggleSort("value_pct")}
          >
            Current %<SortIcon field="value_pct" sortField={sortField} sortDir={sortDir} />
          </th>
          <th
            scope="col" className={`${thCenter}`}
            style={{ width: "7%" }}
          >
            Target
          </th>
          <th
            scope="col" className={thCenter}
            style={{ width: "14%" }}
          >
            {basisLabel} Status
          </th>
          <th
            scope="col" className={`${thCenter} ${HIDE_MOBILE}`}
            style={{ width: "6%" }}
            onClick={() => toggleSort("alloc_status")}
          >
            Status<SortIcon field="alloc_status" sortField={sortField} sortDir={sortDir} />
          </th>
          <th
            scope="col" className={thRight}
            style={{ width: "6%" }}
            onClick={() => toggleSort("alloc_delta")}
          >
            Delta<SortIcon field="alloc_delta" sortField={sortField} sortDir={sortDir} />
          </th>
          <th
            scope="col" className={thRight}
            style={{ width: "5%" }}
            onClick={() => toggleSort("mos")}
          >
            MoS%<SortIcon field="mos" sortField={sortField} sortDir={sortDir} />
          </th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((company, idx) => {
          const alloc = getAllocationData(company);
          const activeStatus = allocationBasis === "invested" ? alloc.costStatus : alloc.valueStatus;
          const activePct = allocationBasis === "invested" ? alloc.costPct : alloc.valuePct;
          const activeDelta = allocationBasis === "invested" ? alloc.costDelta : alloc.valueDelta;
          const activeTotal = allocationBasis === "invested" ? totalCost : totalValue;
          const currentPrice = company.indian_stocks?.price ?? null;
          const buyPrice = effectiveBuyPrice(company.buy_price, getDefaultScenarios(company));
          const isDefaulted = company.buy_price == null && buyPrice != null;
          const mos = buyPrice && currentPrice ? marginOfSafety(buyPrice, currentPrice) : null;

          // Rupee amounts for tooltips
          const rangeMinAmt = (alloc.range.min / 100) * activeTotal;
          const rangeMaxAmt = (alloc.range.max / 100) * activeTotal;
          const currentAmt = (activePct / 100) * activeTotal;
          const investedTooltip = `Target range: ${fmtRupee(rangeMinAmt)} — ${fmtRupee(rangeMaxAmt)}`;

          let deltaTooltip = "";
          if (activeStatus === "under") {
            const needMin = rangeMinAmt - currentAmt;
            const needMax = rangeMaxAmt - currentAmt;
            deltaTooltip = `Invest ${fmtRupee(needMin)} to ${fmtRupee(needMax)} more to reach target`;
          } else if (activeStatus === "over") {
            const excessMin = currentAmt - rangeMaxAmt;
            const excessMax = currentAmt - rangeMinAmt;
            deltaTooltip = `Reduce ${fmtRupee(excessMin)} to ${fmtRupee(excessMax)} to reach target`;
          }

          return (
            <tr
              key={company.id}
              className={`cursor-pointer border-b border-border/20 hover:bg-muted/40 transition-colors ${
                idx % 2 === 0 ? "" : "bg-muted/15"
              } ${BORDER_COLORS[activeStatus]} ${STATUS_BG[activeStatus]}`}
              onClick={() => router.push(`/company/${company.id}`)}
            >
              <td className="px-2 py-2 font-medium truncate max-w-0">
                {company.indian_stocks?.name ?? ""}
                {company.indian_stocks?.nse_symbol && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {company.indian_stocks.nse_symbol}
                  </span>
                )}
              </td>
              <td className="px-1 py-2 text-center text-sm">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help border-b border-dashed border-muted-foreground/40">
                      <StarRating rating={company.star_rating} />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-sm font-medium">{investedTooltip}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </td>
              <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                {fmtPriceShort(currentPrice)}
              </td>
              <td className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${HIDE_MOBILE} ${isDefaulted ? "text-muted-foreground italic" : ""}`} title={isDefaulted ? "Base case buy price (no manual override)" : undefined}>
                {fmtPriceShort(buyPrice)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                {allocationBasis === "invested" ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="cursor-help border-b border-dashed border-muted-foreground/40">
                        {alloc.costPct.toFixed(1)}%
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-sm font-medium">{investedTooltip}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span>{alloc.costPct.toFixed(1)}%</span>
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                {allocationBasis === "current" ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="cursor-help border-b border-dashed border-muted-foreground/40">
                        {alloc.valuePct.toFixed(1)}%
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-sm font-medium">{investedTooltip}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span>{alloc.valuePct.toFixed(1)}%</span>
                )}
              </td>
              <td className="px-2 py-2 text-center tabular-nums whitespace-nowrap text-muted-foreground">
                {alloc.range.min}-{alloc.range.max}%
              </td>
              <td className="px-2 py-2">
                <RangeBar
                  actual={activePct}
                  min={alloc.range.min}
                  max={alloc.range.max}
                  status={activeStatus}
                />
              </td>
              <td className={`px-2 py-2 text-center text-xs font-medium whitespace-nowrap ${HIDE_MOBILE} ${STATUS_TEXT[activeStatus]}`}>
                {deltaTooltip ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="cursor-help">
                        {STATUS_LABEL[activeStatus]}
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-sm font-medium">{deltaTooltip}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  STATUS_LABEL[activeStatus]
                )}
              </td>
              <td className={`px-2 py-2 text-right tabular-nums font-medium whitespace-nowrap ${STATUS_TEXT[activeStatus]}`}>
                {activeDelta === 0 ? (
                  "-"
                ) : deltaTooltip ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="cursor-help border-b border-dashed border-current">
                        {activeDelta > 0 ? "+" : ""}{activeDelta.toFixed(1)}%
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-sm font-medium">{deltaTooltip}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  `${activeDelta > 0 ? "+" : ""}${activeDelta.toFixed(1)}%`
                )}
              </td>
              <td
                className={`px-2 py-2 text-right tabular-nums font-medium whitespace-nowrap ${
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
            </tr>
          );
        })}
        {filtered.length === 0 && (
          <EmptyState hasCompanies={hasCompanies} isHoldings={true} />
        )}
      </tbody>
    </table>
  );
}
