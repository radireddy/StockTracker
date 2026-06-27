"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getDashboardData } from "@/app/(authenticated)/actions/company-actions";

export const DASHBOARD_QUERY_KEY = "dashboard-data";

export function useDashboardData(
  portfolioId: string,
  portfolioType: "holdings" | "watchlist",
  ownerFilter: string
) {
  return useQuery({
    queryKey: [DASHBOARD_QUERY_KEY, portfolioId, portfolioType, ownerFilter],
    queryFn: () => getDashboardData(portfolioId, portfolioType),
    staleTime: 30_000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useInvalidateDashboard() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: [DASHBOARD_QUERY_KEY] }),
    [qc]
  );
}
