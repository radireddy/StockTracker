"use client";

import { useMemo, useCallback } from "react";
import { CompaniesTable } from "@/components/dashboard/companies-table";
import { PortfolioPnlBar } from "@/components/dashboard/portfolio-pnl-bar";
import { AllocationSummaryBar } from "@/components/dashboard/allocation-summary-bar";
import { OwnerFilter } from "@/components/owner/owner-filter";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { useDashboardData, useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import type { PortfolioOwner, AllocationRanges } from "@/types/database";
import { useState } from "react";
import { DashboardTableSkeleton, PortfolioPnlBarSkeleton } from "@/components/dashboard/dashboard-table-skeleton";

export default function DashboardPage() {
  const { selectedId, selectedPortfolio } = usePortfolioContext();
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  const portfolioType = selectedPortfolio?.type ?? "holdings";
  const isHoldings = portfolioType === "holdings";

  const { data, isLoading } = useDashboardData(selectedId, portfolioType, ownerFilter);
  const invalidate = useInvalidateDashboard();

  const owners = (data?.owners ?? []) as PortfolioOwner[];
  const allocationRanges = (data?.allocationRanges ?? null) as AllocationRanges | null;

  const companies = useMemo(() => {
    if (!data) return [];
    const { companies: rawCompanies, allHoldings } = data;

    if (ownerFilter !== "all") {
      const filtered = allHoldings.filter((h) => h.owner_id === ownerFilter);
      const holdingMap = new Map(filtered.map((h) => [h.company_id, h]));
      return rawCompanies
        .map((c) => {
          const oh = holdingMap.get(c.id);
          if (!oh) return null;
          if (oh.quantity === 0) return null;
          return {
            ...c,
            quantity: oh.quantity,
            avg_buy_price: oh.avg_buy_price,
            buy_date: oh.buy_date,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
    }

    return rawCompanies;
  }, [data, ownerFilter]);

  const removeCompany = useCallback(
    (companyId: string) => {
      invalidate();
    },
    [invalidate]
  );

  return (
    <div className="max-w-[95vw] xl:max-w-[1600px] mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">
            {selectedPortfolio?.name ?? "Portfolio"}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              ({companies.length})
            </span>
          </h1>
          {isHoldings && (
            <OwnerFilter
              owners={owners}
              value={ownerFilter}
              onChange={setOwnerFilter}
            />
          )}
        </div>
        <Link href="/company/new">
          <Button size="sm" className="h-8 text-sm">+ Add Company</Button>
        </Link>
      </div>
      {isHoldings && (
        isLoading ? <PortfolioPnlBarSkeleton /> : (
          <>
            <PortfolioPnlBar companies={companies} />
            <AllocationSummaryBar companies={companies} allocationRanges={allocationRanges} />
          </>
        )
      )}
      {isLoading ? (
        <DashboardTableSkeleton />
      ) : (
        <CompaniesTable companies={companies} portfolioType={portfolioType} onRemoveCompany={removeCompany} allocationRanges={allocationRanges} />
      )}
    </div>
  );
}
