"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "stocktracker_selected_portfolio";

export function useSelectedPortfolio(defaultPortfolioId: string) {
  const [selectedId, setSelectedId] = useState<string>(defaultPortfolioId);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSelectedId(stored);
    } else {
      setSelectedId(defaultPortfolioId);
    }
  }, [defaultPortfolioId]);

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
