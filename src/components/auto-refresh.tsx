"use client";

import { createContext, useContext } from "react";
import { useLivePrices } from "@/hooks/use-live-prices";

type PriceMap = Record<string, { price: number | null; market_cap: number | null }>;

const LivePricesContext = createContext<PriceMap>({});

export function useLivePricesContext() {
  return useContext(LivePricesContext);
}

export function LivePricesProvider({ children }: { children: React.ReactNode }) {
  const { prices } = useLivePrices();

  return (
    <LivePricesContext.Provider value={prices}>
      {children}
    </LivePricesContext.Provider>
  );
}
