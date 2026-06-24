"use client";

import { useEffect, useState, useCallback } from "react";
import { CompaniesTable } from "@/components/dashboard/companies-table";
import { PortfolioPnlBar } from "@/components/dashboard/portfolio-pnl-bar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { getCompanies } from "./actions/company-actions";

type CompanyRow = Awaited<ReturnType<typeof getCompanies>>[number];

export default function DashboardPage() {
  const { selectedId, selectedPortfolio } = usePortfolioContext();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCompanies(selectedId)
      .then((data) => {
        if (!cancelled) setCompanies(data);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const removeCompany = useCallback((companyId: string) => {
    setCompanies((prev) => prev.filter((c) => c.id !== companyId));
  }, []);

  const portfolioType = selectedPortfolio?.type ?? "holdings";
  const isHoldings = portfolioType === "holdings";

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {selectedPortfolio?.name ?? "Portfolio"}
          <span className="ml-2 text-base font-normal text-muted-foreground">
            ({companies.length})
          </span>
        </h1>
        <Link href={`/company/new?portfolio=${selectedId}`}>
          <Button size="sm" className="h-8 text-sm">+ Add Company</Button>
        </Link>
      </div>
      {isHoldings && !loading && (
        <PortfolioPnlBar companies={companies} />
      )}
      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Loading companies...
        </div>
      ) : (
        <CompaniesTable companies={companies} portfolioType={portfolioType} onRemoveCompany={removeCompany} />
      )}
    </div>
  );
}
