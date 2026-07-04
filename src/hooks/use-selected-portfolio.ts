"use client";

import { useState, useCallback } from "react";

const STORAGE_KEY = "stocktracker_selected_portfolio";

function getInitialId(defaultPortfolioId: string): string {
  if (typeof window === "undefined") return defaultPortfolioId;
  return localStorage.getItem(STORAGE_KEY) ?? defaultPortfolioId;
}

export function useSelectedPortfolio(defaultPortfolioId: string) {
  const [selectedId, setSelectedId] = useState<string>(() =>
    getInitialId(defaultPortfolioId)
  );

  const select = useCallback((id: string) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSelectedId(defaultPortfolioId);
  }, [defaultPortfolioId]);

  return { selectedId, select, clear };
}
