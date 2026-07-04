"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, SlidersHorizontal, Upload, Plus } from "lucide-react";
import type { AllocationRanges } from "@/types/database";
import type { DashboardCompanyRow } from "@/hooks/use-dashboard-data";
import {
  computeHoldingMetrics,
  totalCurrentValue,
  holdingSortValue,
  type HoldingMetrics,
  type HoldingSortField,
} from "@/lib/utils/dashboard-metrics";
import { getEffectiveRanges, isBuySignal } from "@/lib/utils/calculations";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CompanyCard } from "@/components/dashboard/company-card";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";

type AllocFilter = "all" | "over" | "under" | "in_range";

const SORT_LABELS: Record<HoldingSortField, string> = {
  pnl: "P&L",
  value: "Current value",
  mos: "Margin of safety",
  base: "Base-case return",
};

function fmtINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function fmtCompactINR(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return fmtINR(n);
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
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">Total value</div>
      <div className="mt-1.5 font-mono text-[32px] font-semibold leading-none tracking-tight tabular-nums">
        {fmtINR(current)}
      </div>
      <div
        className={`mt-3 inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[13px] font-semibold tabular-nums ${
          up ? "bg-green-50 text-green-600 dark:bg-green-950/30" : "bg-red-50 text-red-600 dark:bg-red-950/30"
        }`}
      >
        <span className="font-sans text-[9.5px] uppercase tracking-wide opacity-70">Overall P&amp;L</span>
        {up ? "+" : "−"}
        {fmtINR(Math.abs(pnl)).replace("₹", "₹")}
        <span className="text-[12px] opacity-85">
          {up ? "+" : ""}
          {pnlPct.toFixed(2)}%
        </span>
      </div>
      <div className="mt-4">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-green-500"
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
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

function EmptyState({ hasCompanies, isHoldings }: { hasCompanies: boolean; isHoldings: boolean }) {
  if (hasCompanies) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No companies match your filters.</p>;
  }
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-10 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {isHoldings ? <Upload size={20} /> : <Plus size={20} />}
      </div>
      <p className="text-sm font-medium">{isHoldings ? "No holdings yet" : "No companies yet"}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {isHoldings
          ? "Import a broker statement or add a company to get started."
          : "Add a company to start tracking it."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {isHoldings && (
          <Link href="/import">
            <Button size="sm" className="h-8 text-sm">
              <Upload size={14} className="mr-1.5" />
              Import statement
            </Button>
          </Link>
        )}
        <Link href="/company/new">
          <Button size="sm" variant={isHoldings ? "outline" : "default"} className="h-8 text-sm">
            <Plus size={14} className="mr-1.5" />
            Add company
          </Button>
        </Link>
      </div>
    </div>
  );
}

export function MobileDashboard({
  companies,
  portfolioType,
  allocationRanges,
}: {
  companies: DashboardCompanyRow[];
  portfolioType: "holdings" | "watchlist";
  allocationRanges: AllocationRanges | null;
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

  const filterActive = isHoldings ? allocFilter !== "all" : buyOnly;

  return (
    <div className="space-y-3">
      {sameType.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {sameType.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => select(p.id)}
              aria-current={p.id === selectedId ? "true" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                p.id === selectedId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-card text-muted-foreground"
              }`}
            >
              {p.name}
              <span
                className={`font-mono text-[10.5px] ${
                  p.id === selectedId ? "text-primary-foreground/75" : "text-muted-foreground/60"
                }`}
              >
                {p.company_count}
              </span>
            </button>
          ))}
        </div>
      )}

      {isHoldings && <PortfolioSummary companies={companies} />}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
            aria-label="Search companies"
          />
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium ${
            filterActive ? "border-primary text-primary" : "border-border/60 text-muted-foreground"
          }`}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          {SORT_LABELS[sortField].length > 8 ? "Sort" : SORT_LABELS[sortField]}
        </button>
      </div>

      <div className="space-y-2.5">
        {rows.length === 0 ? (
          <EmptyState hasCompanies={companies.length > 0} isHoldings={isHoldings} />
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
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl pb-6">
          <SheetHeader className="px-5 pb-1 pt-4">
            <SheetTitle>Sort &amp; filter</SheetTitle>
          </SheetHeader>

          <div className="px-5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
            Sort by
          </div>
          {(isHoldings ? (["pnl", "value", "mos", "base"] as const) : (["mos", "base"] as const)).map((field) => (
            <button
              key={field}
              type="button"
              onClick={() => {
                setSortField(field);
                setSheetOpen(false);
              }}
              aria-pressed={sortField === field}
              className={`flex w-full items-center justify-between px-5 py-2.5 text-left text-sm hover:bg-muted/50 ${
                sortField === field ? "font-semibold text-primary" : ""
              }`}
            >
              {SORT_LABELS[field]}
              {sortField === field && <span aria-hidden="true">✓</span>}
            </button>
          ))}

          {isHoldings ? (
            <>
              <div className="px-5 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
                Allocation
              </div>
              {(
                [
                  ["over", "Over-allocated"],
                  ["under", "Under-allocated"],
                  ["in_range", "In range"],
                  ["all", "Show all"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setAllocFilter(value);
                    setSheetOpen(false);
                  }}
                  aria-pressed={allocFilter === value}
                  className={`flex w-full items-center justify-between px-5 py-2.5 text-left text-sm hover:bg-muted/50 ${
                    allocFilter === value ? "font-semibold text-primary" : value === "all" ? "text-muted-foreground" : ""
                  }`}
                >
                  {label}
                  {allocFilter === value && value !== "all" && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="px-5 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
                Filter
              </div>
              <button
                type="button"
                onClick={() => {
                  setBuyOnly((v) => !v);
                  setSheetOpen(false);
                }}
                aria-pressed={buyOnly}
                className={`flex w-full items-center justify-between px-5 py-2.5 text-left text-sm hover:bg-muted/50 ${
                  buyOnly ? "font-semibold text-primary" : ""
                }`}
              >
                Buy signals only
                {buyOnly && <span aria-hidden="true">✓</span>}
              </button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
