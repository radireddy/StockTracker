"use client";

import { useMemo, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CompaniesTable } from "@/components/dashboard/companies-table";
import { MobileDashboard } from "@/components/dashboard/mobile-dashboard";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { PortfolioPnlBar } from "@/components/dashboard/portfolio-pnl-bar";
import { AllocationSummaryBar } from "@/components/dashboard/allocation-summary-bar";
import { ResearchGuidanceCard } from "@/components/dashboard/research-guidance-card";
import { hasResearchData } from "@/lib/utils/research-data";
import { PortfolioNav } from "@/components/portfolio/portfolio-nav";
import { Button } from "@/components/ui/button";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { useDashboardData, useInvalidateDashboard, consolidateHoldings } from "@/hooks/use-dashboard-data";

export default function DashboardPage() {
  const { selectedId, selectedPortfolio } = usePortfolioContext();
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const portfolioType = selectedPortfolio?.type ?? "holdings";
  const isHoldings = portfolioType === "holdings";

  const { data, isLoading } = useDashboardData(selectedId, portfolioType);
  const invalidate = useInvalidateDashboard();

  const accounts = data?.accounts ?? [];
  const allocationRanges = data?.allocationRanges ?? null;

  const companies = useMemo(() => {
    if (!data) return [];
    return consolidateHoldings(data.companies, data.allHoldings, accountFilter);
  }, [data, accountFilter]);

  // Detect research data across the WHOLE portfolio (not the account-filtered
  // subset) so toggling the account filter never changes what's shown.
  const researchPresent = useMemo(
    () => isHoldings && hasResearchData(data?.companies ?? []),
    [isHoldings, data]
  );

  // Reset the account filter when switching portfolios (accounts differ per
  // one). Adjust-state-during-render pattern — no effect needed.
  const [prevPortfolio, setPrevPortfolio] = useState(selectedId);
  if (selectedId !== prevPortfolio) {
    setPrevPortfolio(selectedId);
    setAccountFilter("all");
  }

  const removeCompany = useCallback(
    (_companyId: string) => {
      invalidate();
    },
    [invalidate]
  );

  // Per-page title (client page — cannot export metadata). WCAG 2.4.2 Page Titled.
  useEffect(() => {
    const name = selectedPortfolio?.name;
    document.title = name ? `${name} · StockTracker` : "Dashboard · StockTracker";
  }, [selectedPortfolio?.name]);

  const name = selectedPortfolio?.name ?? "Portfolio";
  const eyebrow = isHoldings ? "Portfolio" : "Research";
  const count = companies.length;
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const subtitle = isHoldings
    ? `${count} ${plural(count, "company", "companies")}${
        accounts.length > 0 ? ` · ${accounts.length} ${plural(accounts.length, "account", "accounts")}` : ""
      }`
    : `${count} ${plural(count, "company", "companies")} tracked`;

  return (
    <div className="mx-auto max-w-[95vw] space-y-4 pb-24 lg:max-w-[1600px] lg:pb-0">
      {/* Gradient page header */}
      <header className="page-header-glow">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-primary">
              {eyebrow}
            </p>
            <h1 className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-2xl font-bold tracking-tight lg:text-[2rem]">
              <span className="truncate">{name}</span>
              {/* Desktop: bracketed count; full meta sits on its own line below. */}
              <span className="hidden text-base font-medium text-muted-foreground lg:inline">({count})</span>
              {/* Mobile: meta reads inline next to the title to save vertical space. */}
              <span className="text-sm font-medium text-muted-foreground lg:hidden">{subtitle}</span>
            </h1>
            <p className="mt-1 hidden text-sm text-muted-foreground lg:block">{subtitle}</p>
          </div>
          <Link href="/company/new" className="hidden shrink-0 lg:block">
            <Button className="h-9 gap-1.5 px-4 shadow-soft">
              <Plus size={15} aria-hidden="true" />
              Add company
            </Button>
          </Link>
        </div>
      </header>

      {/* Portfolio navigation (desktop) — mobile switches via pills + bottom nav */}
      <div className="hidden lg:block">
        <PortfolioNav />
      </div>

      {/* Summary hero (holdings, desktop) */}
      {isHoldings && !isLoading && companies.length > 0 && (
        <div className="hidden gap-4 lg:grid lg:grid-cols-[1fr_1.15fr]">
          <PortfolioPnlBar companies={companies} accountsCount={accounts.length} />
          {researchPresent ? (
            <AllocationSummaryBar companies={companies} allocationRanges={allocationRanges} />
          ) : (
            <ResearchGuidanceCard companiesCount={companies.length} accountsCount={accounts.length} />
          )}
        </div>
      )}

      {isLoading ? (
        <div role="status" aria-live="polite" className="py-12 text-center text-sm text-muted-foreground">
          Loading companies...
        </div>
      ) : (
        <>
          {/* Desktop: dense data table */}
          <div className="hidden lg:block">
            <CompaniesTable
              companies={companies}
              portfolioType={portfolioType}
              onRemoveCompany={removeCompany}
              allocationRanges={allocationRanges}
              accounts={accounts}
              accountFilter={accountFilter}
              onAccountFilterChange={setAccountFilter}
              hasResearchData={researchPresent}
            />
          </div>
          {/* Mobile / small screens: card layout */}
          <div className="lg:hidden">
            <MobileDashboard
              companies={companies}
              portfolioType={portfolioType}
              allocationRanges={allocationRanges}
              accounts={accounts}
              accountFilter={accountFilter}
              onAccountFilterChange={setAccountFilter}
              hasResearchData={researchPresent}
            />
          </div>
        </>
      )}
      <MobileBottomNav />
    </div>
  );
}
