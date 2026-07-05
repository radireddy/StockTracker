"use client";

import { useState, useMemo, useRef, useEffect, useLayoutEffect, Fragment } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { marginOfSafety, isBuySignal, effectiveBuyPrice, computeLiveIrr, fmtPriceShort, fmtAmountShort, fmtPctShort, fmtIrr, fmtNum, getEffectiveRanges, getRangeForStar, getAllocationStatus, getAllocationDelta } from "@/lib/utils/calculations";
import type { AllocationStatus } from "@/lib/utils/calculations";
import { FileText, X, Loader2, ArrowRightLeft, Trash2, MoreVertical } from "lucide-react";
import Link from "next/link";
import { getCompanyHighlights, deleteCompany } from "@/app/(authenticated)/actions/company-actions";
import { useInvalidateDashboard, type DashboardAccount } from "@/hooks/use-dashboard-data";
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
import { Segmented } from "@/components/ui/segmented";
import { Stars } from "@/components/ui/stars";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { initials } from "@/lib/utils/portfolios";
import {
  StatusTag,
  STATUS_VAR,
  STATUS_TEXT,
  STATUS_ROW_BG,
  STATUS_LABEL,
} from "@/components/dashboard/status-tag";
import type { AllocationRanges } from "@/types/database";

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Order in which each table sheds columns when it can't fit its container.
 * Earlier entries are dropped first; if hiding all of them still isn't enough
 * the table falls back to horizontal scrolling.
 */
const RESPONSIVE_HIDE_ORDER = ["type", "bare", "cost", "pnlPct", "cmp", "star"] as const;
const ALLOCATION_HIDE_ORDER = ["targetBuy", "cmp", "star", "mos", "target"] as const;

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

type ViewMode = "portfolio" | "allocation";

function fmtRupee(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.abs(n));
}

/** Colour class for a P&L / gain value. */
function pnlClass(positive: boolean): string {
  return positive ? "text-positive" : "text-destructive";
}

/** Colour class for a margin-of-safety decimal value. */
function mosClass(mos: number | null): string {
  if (mos == null) return "";
  if (mos > 0) return "text-positive";
  if (mos < -0.1) return "text-destructive";
  return "text-warning";
}

/** Company avatar tile with initials. */
function Fav({ name }: { name: string }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-[0.72rem] font-bold text-primary">
      {initials(name)}
    </span>
  );
}

/** Small capitalised strategy chip (Core / Satellite …). */
function TypeChip({ strategy }: { strategy: string | null }) {
  if (!strategy) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[0.66rem] font-semibold capitalize text-muted-foreground">
      {strategy}
    </span>
  );
}

/**
 * Empty state rendered inside the table body.
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
        <td colSpan={99} className="py-10 text-center text-sm text-muted-foreground">
          No companies match your filters.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={99} className="px-4 py-14">
        <div className="mx-auto flex max-w-sm flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] bg-accent text-primary shadow-soft">
            {isHoldings ? <UploadIcon /> : <PlusIcon />}
          </div>
          <p className="text-base font-bold text-foreground">
            {isHoldings ? "No holdings yet" : "No companies yet"}
          </p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {isHoldings
              ? "Import a broker statement or add a company manually to get started."
              : "Add a company to start tracking it."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {isHoldings && (
              <Link
                href="/import"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-soft transition-[filter] hover:brightness-105"
              >
                <UploadIcon /> Import statement
              </Link>
            )}
            <Link
              href="/company/new"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
            >
              <PlusIcon /> Add company
            </Link>
          </div>
        </div>
      </td>
    </tr>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5-5 5 5" />
      <path d="M12 5v12" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CompaniesTable({
  companies,
  portfolioType = "holdings",
  onRemoveCompany,
  allocationRanges,
  accounts = [],
  accountFilter = "all",
  onAccountFilterChange,
}: {
  companies: CompanyWithProjections[];
  portfolioType?: "holdings" | "watchlist";
  onRemoveCompany?: (id: string) => void;
  allocationRanges?: AllocationRanges | null;
  accounts?: DashboardAccount[];
  accountFilter?: string;
  onAccountFilterChange?: (value: string) => void;
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

  const getPrice = (c: CompanyWithProjections) => c.indian_stocks?.price ?? null;
  const getMarketCap = (c: CompanyWithProjections) => c.indian_stocks?.market_cap ?? null;

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

    result = [...result].sort((a, b) => {
      const aVal = getSortValue(a);
      const bVal = getSortValue(b);
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, search, starFilter, strategyFilter, buyOnlyFilter, sortField, sortDir, viewMode, allocationBasis, allocationStatusFilter, totalCost, totalValue, ranges]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const thBase = "sticky top-0 z-10 bg-muted/40 px-2.5 py-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground cursor-pointer hover:text-foreground";
  const thRight = `${thBase} text-right`;
  const thCenter = `${thBase} text-center`;

  const showAllocationView = viewMode === "allocation" && isHoldings;
  const showAccountFilter = isHoldings && accounts.length > 1 && !!onAccountFilterChange;

  // --- Responsive column collapsing -------------------------------------
  // Measure the scroll container; while the active table overflows, drop the
  // next low-priority column (RESPONSIVE_HIDE_ORDER for the portfolio table,
  // ALLOCATION_HIDE_ORDER for the allocation table). We reset to "show all" on
  // any resize / shape change so columns reappear when space is available, then
  // re-collapse as needed — all within a layout effect, so it never flashes.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [resizeTick, setResizeTick] = useState(0);
  const prevTick = useRef(0);
  const shapeSig = `${isHoldings}|${showAllocationView}|${filtered.length}`;
  const prevSig = useRef(shapeSig);
  const hideOrder: readonly string[] = showAllocationView
    ? ALLOCATION_HIDE_ORDER
    : RESPONSIVE_HIDE_ORDER;
  const maxHideable = hideOrder.length;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setResizeTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useIsomorphicLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevTick.current !== resizeTick || prevSig.current !== shapeSig) {
      prevTick.current = resizeTick;
      prevSig.current = shapeSig;
      if (hiddenCount !== 0) {
        setHiddenCount(0);
        return;
      }
    }
    const overflowing = el.scrollWidth - el.clientWidth > 1;
    if (overflowing && hiddenCount < maxHideable) {
      setHiddenCount((c) => c + 1);
    }
  }, [resizeTick, hiddenCount, maxHideable, shapeSig]);

  const hiddenCols = new Set<string>(hideOrder.slice(0, hiddenCount));
  const colHidden = (key: string) => (hiddenCols.has(key) ? "hidden" : "");

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        {isHoldings && (
          <Segmented<ViewMode>
            aria-label="Table view"
            value={viewMode}
            onValueChange={(v) => {
              setViewMode(v);
              if (v === "portfolio") setAllocationStatusFilter("all");
            }}
            options={[
              { value: "portfolio", label: "Portfolio" },
              { value: "allocation", label: "Allocation" },
            ]}
          />
        )}
        {showAllocationView && (
          <Segmented
            aria-label="Allocation basis"
            value={allocationBasis}
            onValueChange={(v) => setAllocationBasis(v as "invested" | "current")}
            options={[
              { value: "invested", label: "Invested" },
              { value: "current", label: "Current" },
            ]}
          />
        )}
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-56 rounded-lg text-sm"
          aria-label="Search companies"
        />
        {showAccountFilter && (
          <Select value={accountFilter} onValueChange={(v) => onAccountFilterChange?.(v ?? "all")}>
            <SelectTrigger className="h-8 w-40 rounded-lg text-sm">
              <SelectValue placeholder="All accounts">
                {(value) =>
                  value === "all"
                    ? "All accounts"
                    : (accounts.find((a) => a.id === value)?.label ?? "All accounts")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={starFilter} onValueChange={(v) => setStarFilter(v ?? "all")}>
          <SelectTrigger className="h-8 w-28 rounded-lg text-sm">
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
        {!showAllocationView && isHoldings && (
          <Select value={strategyFilter} onValueChange={(v) => setStrategyFilter(v ?? "all")}>
            <SelectTrigger className="h-8 w-28 rounded-lg text-sm">
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
          <Select value={allocationStatusFilter} onValueChange={(v) => setAllocationStatusFilter(v ?? "all")}>
            <SelectTrigger className="h-8 w-32 rounded-lg text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="over">Over-allocated</SelectItem>
              <SelectItem value="in_range">In Range</SelectItem>
              <SelectItem value="under">Under-allocated</SelectItem>
            </SelectContent>
          </Select>
        )}
        {!isHoldings && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
          Grouped by conviction. Hover over %, Status, or Delta for target range and rupee actions.
        </p>
      )}

      {/* Table card */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <div ref={scrollRef} className="overflow-x-auto">
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
            <table className="w-full border-collapse text-sm" role="table" aria-label="Companies portfolio table">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className={`${thBase} text-left`} onClick={() => toggleSort("name")}>
                    Company<SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th scope="col" className={`${thCenter} ${colHidden("star")}`} onClick={() => toggleSort("star_rating")}>
                    Star<SortIcon field="star_rating" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th scope="col" className={`${thCenter} ${colHidden("type")}`} onClick={() => toggleSort("strategy")}>
                    Type<SortIcon field="strategy" sortField={sortField} sortDir={sortDir} />
                  </th>
                  {isHoldings ? (
                    <>
                      <th scope="col" className={thRight} onClick={() => toggleSort("quantity")}>
                        Qty<SortIcon field="quantity" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={thRight} onClick={() => toggleSort("avg_buy_price")}>
                        Avg Buy<SortIcon field="avg_buy_price" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={`${thRight} ${colHidden("cmp")}`} onClick={() => toggleSort("current_price")}>
                        CMP<SortIcon field="current_price" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={`${thRight} ${colHidden("cost")}`} onClick={() => toggleSort("total_cost")}>
                        Cost<SortIcon field="total_cost" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={thRight} onClick={() => toggleSort("market_value")}>
                        Cur. Value<SortIcon field="market_value" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={`${thRight} ${colHidden("pnlPct")}`} onClick={() => toggleSort("pnl_pct")}>
                        P&amp;L %<SortIcon field="pnl_pct" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={thRight} onClick={() => toggleSort("pnl_amt")}>
                        P&amp;L ₹<SortIcon field="pnl_amt" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={`${thRight} border-l border-border`} onClick={() => toggleSort("buy_price")}>
                        Target Buy<SortIcon field="buy_price" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={thRight} onClick={() => toggleSort("mos")}>
                        MoS%<SortIcon field="mos" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={thRight} onClick={() => toggleSort("base_cagr")}>
                        Base<SortIcon field="base_cagr" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={`${thRight} ${colHidden("bare")}`} onClick={() => toggleSort("bare_cagr")}>
                        Bare<SortIcon field="bare_cagr" sortField={sortField} sortDir={sortDir} />
                      </th>
                    </>
                  ) : (
                    <>
                      <th scope="col" className={`${thRight} ${colHidden("cmp")}`} onClick={() => toggleSort("current_price")}>
                        CMP<SortIcon field="current_price" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={thRight} onClick={() => toggleSort("buy_price")}>
                        Target Buy<SortIcon field="buy_price" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={thRight} onClick={() => toggleSort("mos")}>
                        MoS%<SortIcon field="mos" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={thRight} onClick={() => toggleSort("base_cagr")}>
                        Base<SortIcon field="base_cagr" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={`${thRight} ${colHidden("bare")}`} onClick={() => toggleSort("bare_cagr")}>
                        Bare<SortIcon field="bare_cagr" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={thCenter} onClick={() => toggleSort("signal")}>
                        Signal<SortIcon field="signal" sortField={sortField} sortDir={sortDir} />
                      </th>
                    </>
                  )}
                  <th scope="col" className={`${thCenter} border-l border-border`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((company) => {
                  const name = company.indian_stocks?.name ?? company.isin;
                  const currentPrice = getPrice(company);
                  const buyPrice = effectiveBuyPrice(company.buy_price, getDefaultScenarios(company));
                  const isDefaulted = company.buy_price == null && buyPrice != null;
                  const mos = buyPrice && currentPrice ? marginOfSafety(buyPrice, currentPrice) : null;
                  const buy = isBuySignal(currentPrice, buyPrice);
                  const baseReturn = getScenarioReturn(getDefaultScenarios(company), "base", getMarketCap(company), company.investment_horizon_years);
                  const bareReturn = getScenarioReturn(getDefaultScenarios(company), "bare", getMarketCap(company), company.investment_horizon_years);

                  const avgBuy = company.avg_buy_price;
                  const qty = company.quantity;
                  const plPct = avgBuy && currentPrice ? ((currentPrice - avgBuy) / avgBuy) * 100 : null;
                  const plAmt = qty && avgBuy && currentPrice ? (currentPrice - avgBuy) * qty : null;

                  const allocData = isHoldings ? getAllocationData(company) : null;
                  const stripeStatus = allocData
                    ? allocationBasis === "invested" ? allocData.costStatus : allocData.valueStatus
                    : null;

                  return (
                    <Fragment key={company.id}>
                      <tr
                        className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/40"
                        onClick={() => router.push(`/company/${company.id}`)}
                      >
                        <td className="py-2 pl-2.5 pr-3">
                          <div className="flex items-center gap-2.5">
                            {stripeStatus && (
                              <span
                                className="w-[3px] self-stretch rounded-full"
                                style={{ background: STATUS_VAR[stripeStatus] }}
                                aria-hidden="true"
                              />
                            )}
                            <Fav name={name} />
                            <div className="min-w-0">
                              <Link
                                href={`/company/${company.id}`}
                                prefetch={false}
                                onClick={(e) => e.stopPropagation()}
                                className="block break-words font-semibold tracking-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {name}
                                {isHoldings && stripeStatus && (
                                  <span className="sr-only"> — allocation {STATUS_LABEL[stripeStatus]}</span>
                                )}
                              </Link>
                              {company.indian_stocks?.nse_symbol && (
                                <div className="text-[0.7rem] tracking-wide text-muted-foreground">
                                  {company.indian_stocks.nse_symbol}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={`px-2 py-2 text-center ${colHidden("star")}`}>
                          <Stars rating={company.star_rating} className="text-[0.78rem]" />
                        </td>
                        <td className={`px-2 py-2 text-center ${colHidden("type")}`}>
                          <TypeChip strategy={company.strategy} />
                        </td>
                        {isHoldings ? (
                          <>
                            <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                              {qty != null ? fmtNum(qty, 0) : "-"}
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground">
                              {fmtPriceShort(avgBuy ?? null)}
                            </td>
                            <td className={`px-2.5 py-2 text-right font-mono tabular-nums ${colHidden("cmp")}`}>
                              {fmtPriceShort(currentPrice)}
                            </td>
                            <td className={`px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground ${colHidden("cost")}`}>
                              {qty && avgBuy ? fmtAmountShort(avgBuy * qty) : "-"}
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono font-semibold tabular-nums">
                              {qty && currentPrice ? fmtAmountShort(currentPrice * qty) : "-"}
                            </td>
                            <td className={`px-2.5 py-2 text-right font-mono font-semibold tabular-nums ${colHidden("pnlPct")} ${plPct == null ? "" : pnlClass(plPct >= 0)}`}>
                              {plPct == null ? "-" : `${plPct >= 0 ? "+" : ""}${plPct.toFixed(1)}%`}
                            </td>
                            <td className={`px-2.5 py-2 text-right font-mono font-semibold tabular-nums ${plAmt == null ? "" : pnlClass(plAmt >= 0)}`}>
                              {plAmt == null ? "-" : `${plAmt >= 0 ? "+" : "−"}${fmtAmountShort(Math.abs(plAmt))}`}
                            </td>
                            <td className={`border-l border-border px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground ${isDefaulted ? "italic" : ""}`} title={isDefaulted ? "Base case buy price (no manual override)" : undefined}>
                              {fmtPriceShort(buyPrice)}
                            </td>
                            <td className={`px-2.5 py-2 text-right font-mono font-semibold tabular-nums ${mosClass(mos)}`}>
                              {fmtPctShort(mos)}
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground">
                              {fmtIrr(baseReturn)}
                            </td>
                            <td className={`px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground ${colHidden("bare")}`}>
                              {fmtIrr(bareReturn)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className={`px-2.5 py-2 text-right font-mono tabular-nums ${colHidden("cmp")}`}>
                              {fmtPriceShort(currentPrice)}
                            </td>
                            <td className={`px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground ${isDefaulted ? "italic" : ""}`} title={isDefaulted ? "Base case buy price (no manual override)" : undefined}>
                              {fmtPriceShort(buyPrice)}
                            </td>
                            <td className={`px-2.5 py-2 text-right font-mono font-semibold tabular-nums ${mosClass(mos)}`}>
                              {fmtPctShort(mos)}
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground">
                              {fmtIrr(baseReturn)}
                            </td>
                            <td className={`px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground ${colHidden("bare")}`}>
                              {fmtIrr(bareReturn)}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {buy ? (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-primary px-1.5 py-0.5 text-[0.68rem] font-bold text-primary-foreground">
                                  <span aria-hidden="true">●</span> BUY ZONE
                                </span>
                              ) : (
                                <span className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-[0.68rem] font-semibold text-muted-foreground">
                                  WAIT
                                </span>
                              )}
                            </td>
                          </>
                        )}
                        <td className="border-l border-border px-1 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center justify-center">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger
                                  onClick={() => toggleHighlights(company.id)}
                                  className="inline-flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
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
                                className="inline-flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                aria-label={`More actions for ${name}`}
                              >
                                <MoreVertical size={14} aria-hidden="true" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" side="bottom">
                                {portfolios.length > 1 && (
                                  <DropdownMenuItem
                                    onClick={() => setMoveTarget({ id: company.id, name })}
                                  >
                                    <ArrowRightLeft size={14} aria-hidden="true" />
                                    Move to another portfolio
                                  </DropdownMenuItem>
                                )}
                                {portfolios.length > 1 && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setDeleteTarget({ id: company.id, name })}
                                >
                                  <Trash2 size={14} aria-hidden="true" />
                                  Delete company
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={99} className="border-b border-border/50 p-0">
                          <div
                            className="grid transition-[grid-template-rows] duration-250 ease-out"
                            style={{ gridTemplateRows: expandedHighlights === company.id ? "1fr" : "0fr" }}
                          >
                            <div className="overflow-hidden">
                              {(expandedHighlights === company.id || company.id in highlightsCache) && (
                                <div className="px-4 py-3">
                                  {highlightsLoading === company.id ? (
                                    <div className="flex h-[60px] items-center gap-2 text-sm text-muted-foreground">
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

// --- RangeBar (invested/current status) ---

function RangeBar({ actual, min, max, status }: { actual: number; min: number; max: number; status: AllocationStatus }) {
  const upperBound = Math.max(actual, max) * 1.3 || 10;
  const minPos = (min / upperBound) * 100;
  const maxPos = (max / upperBound) * 100;
  const actualPos = Math.min((actual / upperBound) * 100, 100);

  return (
    <div className="relative mx-auto h-3 w-full min-w-[96px] overflow-hidden rounded-sm bg-muted/50">
      <div className="absolute inset-y-0 bg-muted" style={{ left: `${minPos}%`, width: `${maxPos - minPos}%` }} />
      <div className="absolute top-0.5 h-2 rounded-sm" style={{ left: 0, width: `${actualPos}%`, background: STATUS_VAR[status] }} />
      <div className="absolute inset-y-0 w-px bg-foreground/30" style={{ left: `${minPos}%` }} />
      <div className="absolute inset-y-0 w-px bg-foreground/30" style={{ left: `${maxPos}%` }} />
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
  return <span className="ml-1" aria-hidden="true">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

type AllocData = {
  costPct: number;
  valuePct: number;
  range: { min: number; max: number };
  costStatus: AllocationStatus;
  valueStatus: AllocationStatus;
  costDelta: number;
  valueDelta: number;
};

/** Small bar for a star group header (weight vs. target band). */
function GroupBar({ pct, min, max, status }: { pct: number; min: number; max: number; status: AllocationStatus }) {
  const scale = Math.max(max * 1.05, pct * 1.05) || 1;
  const fillW = Math.min(100, (pct / scale) * 100);
  const bandLeft = (min / scale) * 100;
  const bandRight = 100 - (max / scale) * 100;
  return (
    <div className="relative h-5 w-[240px] shrink-0 overflow-hidden rounded-md bg-muted">
      <div
        className="absolute inset-y-0 left-0 rounded-md"
        style={{ width: `${fillW}%`, background: `color-mix(in oklch, ${STATUS_VAR[status]} 55%, var(--card))` }}
      />
      <div
        className="absolute -inset-y-px border-x-[1.5px] border-dashed border-foreground/40"
        style={{ left: `${bandLeft}%`, right: `${bandRight}%` }}
      />
    </div>
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
  getAllocationData: (c: CompanyWithProjections) => AllocData;
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
  const activeTotal = allocationBasis === "invested" ? totalCost : totalValue;

  // Group the filtered rows by conviction (4★ → 1★), preserving sort order.
  const groups = [4, 3, 2, 1]
    .map((star) => {
      const members = filtered.filter((c) => {
        const s = c.star_rating ?? 1;
        const bucket = s >= 1 && s <= 4 ? s : 1;
        return bucket === star;
      });
      return { star, members };
    })
    .filter((g) => g.members.length > 0);

  return (
    <table className="w-full border-collapse whitespace-nowrap text-sm" role="table" aria-label="Allocation analysis table">
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className={`${thBase} text-left`} onClick={() => toggleSort("name")}>
            Company<SortIcon field="name" sortField={sortField} sortDir={sortDir} />
          </th>
          <th scope="col" className={thCenter} onClick={() => toggleSort("star_rating")}>
            Star<SortIcon field="star_rating" sortField={sortField} sortDir={sortDir} />
          </th>
          <th scope="col" className={thRight} onClick={() => toggleSort("current_price")}>
            CMP<SortIcon field="current_price" sortField={sortField} sortDir={sortDir} />
          </th>
          <th scope="col" className={thRight} onClick={() => toggleSort("buy_price")}>
            Target Buy<SortIcon field="buy_price" sortField={sortField} sortDir={sortDir} />
          </th>
          <th scope="col" className={thRight} onClick={() => toggleSort("cost_pct")}>
            Inv %<SortIcon field="cost_pct" sortField={sortField} sortDir={sortDir} />
          </th>
          <th scope="col" className={thRight} onClick={() => toggleSort("value_pct")}>
            Cur %<SortIcon field="value_pct" sortField={sortField} sortDir={sortDir} />
          </th>
          <th scope="col" className={thCenter}>Target</th>
          <th scope="col" className={thCenter}>{basisLabel} Status</th>
          <th scope="col" className={thCenter} onClick={() => toggleSort("alloc_status")}>
            Status<SortIcon field="alloc_status" sortField={sortField} sortDir={sortDir} />
          </th>
          <th scope="col" className={thRight} onClick={() => toggleSort("alloc_delta")}>
            Delta<SortIcon field="alloc_delta" sortField={sortField} sortDir={sortDir} />
          </th>
          <th scope="col" className={thRight} onClick={() => toggleSort("mos")}>
            MoS%<SortIcon field="mos" sortField={sortField} sortDir={sortDir} />
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map(({ star, members }) => {
          const count = members.length;
          const range = getAllocationData(members[0]).range;
          const groupMin = range.min * count;
          const groupMax = range.max * count;
          const groupPct = members.reduce((sum, c) => {
            const ad = getAllocationData(c);
            return sum + (allocationBasis === "invested" ? ad.costPct : ad.valuePct);
          }, 0);
          const groupStatus = getAllocationStatus(groupPct, { min: groupMin, max: groupMax });

          let action: React.ReactNode = "balanced";
          if (groupStatus === "under") {
            const amt = ((groupMin - groupPct) / 100) * activeTotal;
            action = <>add <b className="font-mono text-foreground">{fmtRupee(amt)}</b> to reach {groupMin.toFixed(0)}%</>;
          } else if (groupStatus === "over") {
            const amt = ((groupPct - groupMax) / 100) * activeTotal;
            action = <>trim <b className="font-mono text-foreground">{fmtRupee(amt)}</b> to reach {groupMax.toFixed(0)}%</>;
          }

          return (
            <Fragment key={star}>
              <tr className="border-y border-border bg-muted/40">
                <td colSpan={11} className="px-2.5 py-2.5">
                  <div className="flex items-center gap-3.5">
                    <Stars rating={star} className="w-[70px] shrink-0 text-[0.85rem]" />
                    <GroupBar pct={groupPct} min={groupMin} max={groupMax} status={groupStatus} />
                    <span className="font-mono text-[0.95rem] font-bold tabular-nums">{groupPct.toFixed(1)}%</span>
                    <StatusTag status={groupStatus} />
                    <span className="text-xs text-muted-foreground">target {groupMin.toFixed(0)}–{groupMax.toFixed(0)}%</span>
                    <span className="ml-auto text-xs text-muted-foreground">{action}</span>
                  </div>
                </td>
              </tr>
              {members.map((company) => {
                const name = company.indian_stocks?.name ?? company.isin;
                const alloc = getAllocationData(company);
                const activeStatus = allocationBasis === "invested" ? alloc.costStatus : alloc.valueStatus;
                const activePct = allocationBasis === "invested" ? alloc.costPct : alloc.valuePct;
                const activeDelta = allocationBasis === "invested" ? alloc.costDelta : alloc.valueDelta;
                const currentPrice = company.indian_stocks?.price ?? null;
                const buyPrice = effectiveBuyPrice(company.buy_price, getDefaultScenarios(company));
                const isDefaulted = company.buy_price == null && buyPrice != null;
                const mos = buyPrice && currentPrice ? marginOfSafety(buyPrice, currentPrice) : null;

                const rangeMinAmt = (alloc.range.min / 100) * activeTotal;
                const rangeMaxAmt = (alloc.range.max / 100) * activeTotal;
                const currentAmt = (activePct / 100) * activeTotal;
                const investedTooltip = `Target range: ${fmtRupee(rangeMinAmt)} — ${fmtRupee(rangeMaxAmt)}`;

                let deltaTooltip = "";
                if (activeStatus === "under") {
                  deltaTooltip = `Invest ${fmtRupee(rangeMinAmt - currentAmt)} to ${fmtRupee(rangeMaxAmt - currentAmt)} more to reach target`;
                } else if (activeStatus === "over") {
                  deltaTooltip = `Reduce ${fmtRupee(currentAmt - rangeMaxAmt)} to ${fmtRupee(currentAmt - rangeMinAmt)} to reach target`;
                }

                return (
                  <tr
                    key={company.id}
                    className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/40 ${STATUS_ROW_BG[activeStatus]}`}
                    onClick={() => router.push(`/company/${company.id}`)}
                  >
                    <td className="py-2 pl-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-[3px] self-stretch rounded-full"
                          style={{ background: STATUS_VAR[activeStatus] }}
                          aria-hidden="true"
                        />
                        <Fav name={name} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold tracking-tight">{name}</div>
                          {company.indian_stocks?.nse_symbol && (
                            <div className="text-[0.7rem] tracking-wide text-muted-foreground">
                              {company.indian_stocks.nse_symbol}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Stars rating={company.star_rating} className="text-[0.78rem]" />
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                      {fmtPriceShort(currentPrice)}
                    </td>
                    <td className={`px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground ${isDefaulted ? "italic" : ""}`} title={isDefaulted ? "Base case buy price (no manual override)" : undefined}>
                      {fmtPriceShort(buyPrice)}
                    </td>
                    <td className={`px-2.5 py-2 text-right font-mono tabular-nums ${allocationBasis === "invested" ? "" : "text-muted-foreground"}`}>
                      {alloc.costPct.toFixed(1)}%
                    </td>
                    <td className={`px-2.5 py-2 text-right font-mono tabular-nums ${allocationBasis === "current" ? "" : "text-muted-foreground"}`}>
                      {alloc.valuePct.toFixed(1)}%
                    </td>
                    <td className="px-2 py-2 text-center font-mono tabular-nums text-muted-foreground">
                      {alloc.range.min}-{alloc.range.max}%
                    </td>
                    <td className="px-2 py-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="block w-full cursor-help" onClick={(e) => e.stopPropagation()}>
                            <RangeBar actual={activePct} min={alloc.range.min} max={alloc.range.max} status={activeStatus} />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-sm font-medium">{investedTooltip}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="px-2 py-2 text-center">
                      {deltaTooltip ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger className="cursor-help" onClick={(e) => e.stopPropagation()}>
                              <StatusTag status={activeStatus} />
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-sm font-medium">{deltaTooltip}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <StatusTag status={activeStatus} />
                      )}
                    </td>
                    <td className={`px-2.5 py-2 text-right font-mono font-semibold tabular-nums ${STATUS_TEXT[activeStatus]}`}>
                      {activeDelta === 0 ? "-" : `${activeDelta > 0 ? "+" : ""}${activeDelta.toFixed(1)}%`}
                    </td>
                    <td className={`px-2.5 py-2 text-right font-mono font-semibold tabular-nums ${mosClass(mos)}`}>
                      {fmtPctShort(mos)}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          );
        })}
        {filtered.length === 0 && <EmptyState hasCompanies={hasCompanies} isHoldings={true} />}
      </tbody>
    </table>
  );
}
