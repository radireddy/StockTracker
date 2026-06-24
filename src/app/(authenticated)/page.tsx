"use client";

import { useEffect, useState, useCallback } from "react";
import { CompaniesTable } from "@/components/dashboard/companies-table";
import { PortfolioPnlBar } from "@/components/dashboard/portfolio-pnl-bar";
import { OwnerFilter } from "@/components/owner/owner-filter";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { getCompanies } from "./actions/company-actions";
import { getOwners } from "./actions/owner-actions";
import { getOwnerHoldingsForPortfolio } from "./actions/company-actions";
import type { PortfolioOwner } from "@/types/database";

type CompanyRow = Awaited<ReturnType<typeof getCompanies>>[number];

export default function DashboardPage() {
  const { selectedId, selectedPortfolio } = usePortfolioContext();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [owners, setOwners] = useState<PortfolioOwner[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  useEffect(() => {
    getOwners().then(setOwners).catch(() => setOwners([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchData = async () => {
      try {
        const data = await getCompanies(selectedId);

        if (ownerFilter !== "all") {
          // Get owner-specific holdings and overlay onto companies
          const ownerHoldings = await getOwnerHoldingsForPortfolio(
            selectedId,
            ownerFilter
          );
          const holdingMap = new Map(
            ownerHoldings.map((h) => [h.company_id, h])
          );

          // Filter to only companies this owner holds, and override qty/avg_buy_price
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

          if (!cancelled) setCompanies(filtered);
        } else {
          if (!cancelled) setCompanies(data);
        }
      } catch {
        if (!cancelled) setCompanies([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [selectedId, ownerFilter]);

  const removeCompany = useCallback((companyId: string) => {
    setCompanies((prev) => prev.filter((c) => c.id !== companyId));
  }, []);

  const portfolioType = selectedPortfolio?.type ?? "holdings";
  const isHoldings = portfolioType === "holdings";

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
