"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, SlidersHorizontal, Upload, Plus, Eye } from "lucide-react";
import type { AllocationRanges } from "@/types/database";
import type { DashboardAccount, DashboardCompanyRow } from "@/hooks/use-dashboard-data";
import {
  computeHoldingMetrics,
  totalCurrentValue,
  holdingSortValue,
  type HoldingMetrics,
  type HoldingSortField,
} from "@/lib/utils/dashboard-metrics";
import { getEffectiveRanges, isBuySignal } from "@/lib/utils/calculations";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { CompanyCard } from "@/components/dashboard/company-card";
import { STATUS_VAR } from "@/components/dashboard/status-tag";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";

type AllocFilter = "all" | "over" | "under" | "in_range";

const SORT_LABELS: Record<HoldingSortField, string> = {
  pnl: "P&L",
  value: "Current value",
  mos: "Margin of safety",
  base: "Base-case return",
};

const ALLOC_OPTS: { value: AllocFilter; label: string; dot?: string }[] = [
  { value: "all", label: "All" },
  { value: "over", label: "Over", dot: STATUS_VAR.over },
  { value: "under", label: "Under", dot: STATUS_VAR.under },
  { value: "in_range", label: "In range", dot: STATUS_VAR.in_range },
];

function fmtINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function fmtCompactINR(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return fmtINR(n);
}

function Chip({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[0.82rem] font-semibold transition-colors",
        active ? "border-primary bg-primary/[0.09] text-primary" : "border-border bg-card text-muted-foreground"
      )}
    >
      {dot && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: dot }} />}
      {children}
      {active && <span aria-hidden="true">✓</span>}
    </button>
  );
}

function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function PortfolioSummary({ companies }: { companies: DashboardCompanyRow[] }) {
  let invested = 0;
  let current = 0;
  for (const c of companies) {
    const qty = c.quantity;
    const avg = c.avg_buy_price;
    const price = c.indian_stocks?.price;
    if (!qty || !avg || price == null) continue;
    invested += qty * avg;
    current += qty * price;
  }
  if (invested === 0) return null;

  const pnl = current - invested;
  const pnlPct = (pnl / invested) * 100;
  const up = pnl >= 0;
  const fillPct = Math.max(4, Math.min(100, (invested / Math.max(invested, current)) * 100));

  return (
    <div className="surface-glow rounded-[20px] border bg-card p-[18px] shadow-soft">
      <div className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Total value</div>
      <div className="mt-1 font-mono text-[2rem] font-bold leading-none tracking-tight tabular-nums">
        {fmtINR(current)}
      </div>
      <div
        aria-label={`Overall ${up ? "profit" : "loss"}: ${up ? "+" : "−"}${fmtINR(Math.abs(pnl))}, ${up ? "+" : ""}${pnlPct.toFixed(2)}%`}
        className={`mt-3 inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[0.8rem] font-bold tabular-nums ${
          up ? "bg-positive/[0.15] text-positive" : "bg-destructive/[0.12] text-destructive"
        }`}
      >
        <span aria-hidden="true" className="font-sans text-[0.58rem] uppercase tracking-wide opacity-80">Overall P&amp;L</span>
        <span aria-hidden="true">
          {up ? "▲" : "▼"} {up ? "+" : "−"}
          {fmtINR(Math.abs(pnl))}
          <span className="opacity-85"> · {up ? "+" : ""}{pnlPct.toFixed(2)}%</span>
        </span>
      </div>
      <div className="mt-4">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-positive"
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[0.72rem] text-muted-foreground">
          <span>
            Invested <b className="font-mono font-semibold tabular-nums text-foreground">{fmtCompactINR(invested)}</b>
          </span>
          <span>
            Current <b className="font-mono font-semibold tabular-nums text-foreground">{fmtCompactINR(current)}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

export function MobileDashboard({
  companies,
  portfolioType,
  allocationRanges,
  accounts = [],
  accountFilter = "all",
  onAccountFilterChange,
}: {
  companies: DashboardCompanyRow[];
  portfolioType: "holdings" | "watchlist";
  allocationRanges: AllocationRanges | null;
  accounts?: DashboardAccount[];
  accountFilter?: string;
  onAccountFilterChange?: (value: string) => void;
}) {
  const router = useRouter();
  const { portfolios, selectedId, select, selectedPortfolio } = usePortfolioContext();
  const isHoldings = portfolioType === "holdings";
  const ranges = getEffectiveRanges(allocationRanges);

  const sameType = portfolios.filter((p) => p.type === (selectedPortfolio?.type ?? portfolioType));

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<HoldingSortField>(isHoldings ? "pnl" : "mos");
  const [allocFilter, setAllocFilter] = useState<AllocFilter>("all");
  const [buyOnly, setBuyOnly] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Reset sort/filters when the portfolio type flips (their valid options
  // differ). Adjust-state-during-render pattern — no effect needed.
  const [prevIsHoldings, setPrevIsHoldings] = useState(isHoldings);
  if (prevIsHoldings !== isHoldings) {
    setPrevIsHoldings(isHoldings);
    setSortField(isHoldings ? "pnl" : "mos");
    setAllocFilter("all");
    setBuyOnly(false);
  }

  const totalValue = useMemo(() => totalCurrentValue(companies), [companies]);

  const rows = useMemo(() => {
    const withMetrics: { company: DashboardCompanyRow; metrics: HoldingMetrics }[] = companies.map((c) => ({
      company: c,
      metrics: computeHoldingMetrics(c, ranges, totalValue),
    }));

    let result = withMetrics;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          (r.company.indian_stocks?.name ?? "").toLowerCase().includes(q) ||
          (r.company.indian_stocks?.nse_symbol ?? "").toLowerCase().includes(q)
      );
    }
    if (isHoldings && allocFilter !== "all") {
      result = result.filter((r) => r.metrics.allocStatus === allocFilter);
    }
    if (!isHoldings && buyOnly) {
      result = result.filter((r) => isBuySignal(r.metrics.price, r.metrics.buyPrice));
    }

    result = [...result].sort((a, b) => {
      const av = holdingSortValue(a.metrics, sortField);
      const bv = holdingSortValue(b.metrics, sortField);
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av; // descending
    });

    return result;
  }, [companies, ranges, totalValue, search, isHoldings, allocFilter, buyOnly, sortField]);

  const isEmpty = companies.length === 0;
  const showAccountFilter = isHoldings && accounts.length > 1 && !!onAccountFilterChange;
  const filterActive = (isHoldings ? allocFilter !== "all" || accountFilter !== "all" : buyOnly) || search.length > 0;
  const sortOptions: HoldingSortField[] = isHoldings ? ["pnl", "value", "mos", "base"] : ["mos", "base"];

  return (
    <div className="space-y-3">
      {sameType.length > 1 && (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          {sameType.map((p) => (
            <Pill
              key={p.id}
              active={p.id === selectedId}
              aria-current={p.id === selectedId ? "true" : undefined}
              dotColor={p.color}
              count={p.company_count}
              onClick={() => select(p.id)}
            >
              {p.name}
            </Pill>
          ))}
        </div>
      )}

      {isHoldings && !isEmpty && <PortfolioSummary companies={companies} />}

      {!isEmpty && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 shadow-soft"
        >
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search size={15} aria-hidden="true" />
            Search, sort &amp; filter
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[0.78rem] font-semibold",
              filterActive ? "bg-primary/[0.12] text-primary" : "bg-muted text-foreground"
            )}
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
            {SORT_LABELS[sortField]}
            {filterActive && <span aria-hidden="true">•</span>}
          </span>
        </button>
      )}

      <div className="space-y-2.5">
        {isEmpty ? (
          isHoldings ? (
            <EmptyState
              icon={Upload}
              title="No holdings yet"
              description="Import your broker statement, or add a company manually to start tracking this portfolio."
            >
              <Link
                href="/import"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft"
              >
                <Upload size={16} aria-hidden="true" /> Import statement
              </Link>
              <Link
                href="/company/new"
                className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-semibold text-foreground"
              >
                <Plus size={16} aria-hidden="true" /> Add company
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              icon={Eye}
              title="Your watchlist is empty"
              description="Add companies you're researching to track valuation, margin of safety and buy signals."
            >
              <Link
                href="/company/new"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft"
              >
                <Plus size={16} aria-hidden="true" /> Add company
              </Link>
            </EmptyState>
          )
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No companies match your filters.</p>
        ) : (
          rows.map(({ company, metrics }) => (
            <CompanyCard
              key={company.id}
              company={company}
              metrics={metrics}
              portfolioType={portfolioType}
              onOpen={(id) => router.push(`/company/${id}`)}
            />
          ))
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl px-5 pb-6 pt-2">
          <SheetHeader className="px-0 pb-0 pt-2">
            <SheetTitle className="text-lg">Search, sort &amp; filter</SheetTitle>
          </SheetHeader>

          <div className="mt-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Search companies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 rounded-xl pl-9 text-sm"
                aria-label="Search companies"
              />
            </div>
          </div>

          {showAccountFilter && (
            <SheetSection title="Account">
              <Chip active={accountFilter === "all"} onClick={() => onAccountFilterChange?.("all")}>
                All accounts
              </Chip>
              {accounts.map((a) => (
                <Chip key={a.id} active={accountFilter === a.id} onClick={() => onAccountFilterChange?.(a.id)}>
                  {a.label}
                </Chip>
              ))}
            </SheetSection>
          )}

          <SheetSection title="Sort by">
            {sortOptions.map((field) => (
              <Chip key={field} active={sortField === field} onClick={() => setSortField(field)}>
                {SORT_LABELS[field]}
              </Chip>
            ))}
          </SheetSection>

          {isHoldings ? (
            <SheetSection title="Allocation">
              {ALLOC_OPTS.map((o) => (
                <Chip key={o.value} active={allocFilter === o.value} dot={o.dot} onClick={() => setAllocFilter(o.value)}>
                  {o.label}
                </Chip>
              ))}
            </SheetSection>
          ) : (
            <SheetSection title="Filter">
              <Chip active={buyOnly} onClick={() => setBuyOnly((v) => !v)}>
                Buy signals only
              </Chip>
            </SheetSection>
          )}

          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            className="mt-6 w-full rounded-xl bg-primary py-3 text-[0.92rem] font-bold text-primary-foreground shadow-soft"
          >
            Done
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
