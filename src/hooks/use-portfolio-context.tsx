"use client";

import { createContext, useContext } from "react";
import type { Portfolio } from "@/types/database";

type PortfolioWithCount = Portfolio & { company_count: number };

type PortfolioContextValue = {
  selectedId: string;
  select: (id: string) => void;
  portfolios: PortfolioWithCount[];
  selectedPortfolio: PortfolioWithCount | undefined;
};

export const PortfolioContext = createContext<PortfolioContextValue | null>(
  null
);

export function usePortfolioContext() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolioContext must be within provider");
  return ctx;
}
