"use client";

import { useEffect, useState, useCallback } from "react";
import { getLivePrices } from "@/app/(authenticated)/actions/company-actions";

type PriceMap = Record<string, { price: number | null; market_cap: number | null }>;

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useLivePrices() {
  const [prices, setPrices] = useState<PriceMap>({});

  const refresh = useCallback(async () => {
    try {
      const data = await getLivePrices();
      setPrices(data);
    } catch {
      // silently ignore — stale prices are fine
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  return { prices, refresh };
}
