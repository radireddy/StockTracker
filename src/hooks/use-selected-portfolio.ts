"use client";

import { useState, useCallback } from "react";

/**
 * Tracks which portfolio the dashboard is showing.
 *
 * Until the user explicitly picks a portfolio, the selection *follows* the
 * user's default — so changing the default (in Settings) is reflected on the
 * dashboard without a manual refresh, and a fresh load always opens on the
 * default. Once the user clicks a specific portfolio, that pick sticks for the
 * lifetime of the authenticated shell (it survives in-app navigation), and a
 * full reload returns to the default.
 *
 * We deliberately do NOT persist the pick to localStorage, which would
 * otherwise override the default on every load.
 */
export function useSelectedPortfolio(defaultPortfolioId: string) {
  const [override, setOverride] = useState<string | null>(null);

  const selectedId = override ?? defaultPortfolioId;

  const select = useCallback((id: string) => {
    setOverride(id);
  }, []);

  const clear = useCallback(() => {
    setOverride(null);
  }, []);

  return { selectedId, select, clear };
}
