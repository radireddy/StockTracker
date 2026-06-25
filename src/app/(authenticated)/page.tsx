"use client";

import { useEffect, useState, useCallback } from "react";
import { CompaniesTable } from "@/components/dashboard/companies-table";
import { PortfolioPnlBar } from "@/components/dashboard/portfolio-pnl-bar";
import { OwnerFilter } from "@/components/owner/owner-filter";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { getDashboardData } from "./actions/company-actions";
import type { PortfolioOwner } from "@/types/database";

type DashboardResult = Awaited<ReturnType<typeof getDashboardData>>;
type CompanyRow = DashboardResult["companies"][number];

export default function DashboardPage() {
  const { selectedId, selectedPortfolio } = usePortfolioContext();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [owners, setOwners] = useState<PortfolioOwner[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  const portfolioType = selectedPortfolio?.type ?? "holdings";
  const isHoldings = portfolioType === "holdings";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getDashboardData(selectedId, portfolioType, ownerFilter)
      .then(({ companies: data, owners: ownerList, ownerHoldings }) => {
        if (cancelled) return;

        setOwners(ownerList as PortfolioOwner[]);

        if (ownerHoldings) {
          const holdingMap = new Map(
            ownerHoldings.map((h) => [h.company_id, h])
          );
          const filtered = data
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
            .filter(Boolean) as CompanyRow[];
          setCompanies(filtered);
        } else {
          setCompanies(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompanies([]);
          setOwners([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, portfolioType, ownerFilter]);

  const removeCompany = useCallback((companyId: string) => {
    setCompanies((prev) => prev.filter((c) => c.id !== companyId));
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-3">
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
