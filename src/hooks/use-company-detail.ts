"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompany } from "@/app/(authenticated)/actions/company-actions";
import { getDefaultModelIRR } from "@/lib/utils/calculations";
import { DASHBOARD_QUERY_KEY, type DashboardData, type DashboardCompany } from "./use-dashboard-data";
import type { Company, ProjectionModel } from "@/types/database";

function dashboardToCompany(dc: DashboardCompany): Company {
  return {
    id: dc.id,
    portfolio_id: "",
    user_id: "",
    isin: dc.isin,
    buy_price: dc.buy_price,
    star_rating: dc.star_rating,
    strategy: dc.strategy as "core" | "satellite" | null,
    investment_horizon_years: dc.investment_horizon_years,
    expected_returns: null,
    thesis: null,
    highlights: null,
    quantity: dc.quantity,
    avg_buy_price: dc.avg_buy_price,
    buy_date: null,
    notes: null,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    indian_stocks: dc.indian_stocks
      ? {
          isin: dc.isin,
          name: dc.indian_stocks.name ?? "",
          nse_symbol: dc.indian_stocks.nse_symbol,
          bse_code: null,
          sector: null,
          industry: null,
          series: null,
          exchange: "NSE" as const,
          price: dc.indian_stocks.price,
          change: null,
          change_pct: null,
          volume: null,
          market_cap: dc.indian_stocks.market_cap,
          last_updated: null,
          created_at: "",
        }
      : undefined,
  };
}

function dashboardToProjectionModels(dc: DashboardCompany): ProjectionModel[] {
  return dc.projection_models.map((pm, i) => ({
    id: "",
    company_id: dc.id,
    user_id: "",
    projection_type: "pe_earnings" as const,
    name: "",
    is_default: pm.is_default,
    sort_order: i,
    financial_years: [],
    valuation_scenarios: pm.valuation_scenarios as unknown as ProjectionModel["valuation_scenarios"],
    created_at: "",
    updated_at: "",
  }));
}

export function useCompanyDetail(companyId: string) {
  const queryClient = useQueryClient();

  const { cached, portfolioType: cachedPortfolioType } = useMemo(() => {
    const queries = queryClient.getQueriesData<DashboardData>({
      queryKey: [DASHBOARD_QUERY_KEY],
    });
    for (const [key, data] of queries) {
      if (!data) continue;
      const found = data.companies.find((c) => c.id === companyId);
      if (found) {
        // Query key is [DASHBOARD_QUERY_KEY, portfolioId, portfolioType, ownerFilter]
        const pType = (key[2] as string) ?? "holdings";
        return { cached: found, portfolioType: pType as "holdings" | "watchlist" };
      }
    }
    return { cached: null, portfolioType: "holdings" as const };
  }, [queryClient, companyId]);

  const { data: fullData, isLoading: isFullLoading, error } = useQuery({
    queryKey: ["company-detail", companyId],
    queryFn: () => getCompany(companyId),
    staleTime: 60_000,
    retry: 1,
  });

  const company: Company | null = useMemo(() => {
    if (fullData) return fullData as Company;
    if (cached) return dashboardToCompany(cached);
    return null;
  }, [fullData, cached]);

  const projectionModels: ProjectionModel[] = useMemo(() => {
    if (fullData) {
      return ((fullData as any).projection_models ?? [])
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((pm: any) => ({
          ...pm,
          financial_years: (pm.financial_years ?? []).sort(
            (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
          ),
        }));
    }
    if (cached) return dashboardToProjectionModels(cached);
    return [];
  }, [fullData, cached]);

  const baseIrr = useMemo(
    () =>
      getDefaultModelIRR(
        projectionModels,
        company?.indian_stocks?.market_cap,
        company?.investment_horizon_years
      ),
    [projectionModels, company?.indian_stocks?.market_cap, company?.investment_horizon_years]
  );

  const isFullDataLoaded = !!fullData;
  const hasCachedData = !!cached;

  return {
    company,
    projectionModels,
    baseIrr,
    isFullDataLoaded,
    isLoading: isFullLoading && !hasCachedData,
    portfolioType: cachedPortfolioType,
    error: !hasCachedData && !isFullLoading && error ? error : null,
  };
}
