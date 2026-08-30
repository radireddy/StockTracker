"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getOpenPositions } from "@/app/(authenticated)/actions/trades-actions";
import type { OpenPosition } from "@/lib/import/tradebook-types";

export type { OpenPosition };
export type { OpenLot } from "@/lib/import/tradebook-types";

export const TRADES_QUERY_KEY = "trades-open-positions";

/** Returns open positions derived from imported tradebooks. */
export function useTradesData(accountFilter: string) {
  const accountIds = accountFilter === "all" ? undefined : [accountFilter];

  return useQuery<OpenPosition[]>({
    queryKey: [TRADES_QUERY_KEY, accountFilter],
    queryFn: () => getOpenPositions(accountIds),
    staleTime: 60_000,
  });
}

export function useInvalidateTrades() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: [TRADES_QUERY_KEY] }),
    [qc]
  );
}
