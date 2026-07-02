"use client";

import { useMemo, useCallback } from "react";
import { CompaniesTable } from "@/components/dashboard/companies-table";
import { PortfolioPnlBar } from "@/components/dashboard/portfolio-pnl-bar";
import { AccountFilter } from "@/components/account/account-filter";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { useDashboardData, useInvalidateDashboard, consolidateHoldings } from "@/hooks/use-dashboard-data";
import { useState } from "react";

export default function DashboardPage() {
  const { selectedId, selectedPortfolio } = usePortfolioContext();
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const portfolioType = selectedPortfolio?.type ?? "holdings";
  const isHoldings = portfolioType === "holdings";

  const { data, isLoading } = useDashboardData(selectedId, portfolioType);
  const invalidate = useInvalidateDashboard();

  const accounts = data?.accounts ?? [];

  const companies = useMemo(() => {
    if (!data) return [];
    return consolidateHoldings(data.companies, data.allHoldings, accountFilter);
  }, [data, accountFilter]);

  const removeCompany = useCallback(
    (_companyId: string) => {
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
          {isHoldings && accounts.length > 0 && (
            <AccountFilter
              accounts={accounts}
              value={accountFilter}
              onChange={setAccountFilter}
            />
          )}
        </div>
        <Link href="/company/new">
          <Button size="sm" className="h-8 text-sm">+ Add Company</Button>
        </Link>
      </div>
      {isHoldings && !isLoading && (
        <PortfolioPnlBar companies={companies} />
      )}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Loading companies...
        </div>
      ) : (
        <CompaniesTable companies={companies} portfolioType={portfolioType} onRemoveCompany={removeCompany} />
      )}
    </div>
  );
}
