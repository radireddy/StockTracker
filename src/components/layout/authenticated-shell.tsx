"use client";

import { useMemo } from "react";
import { AppHeader } from "./app-header";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/query-provider";
import { useSelectedPortfolio } from "@/hooks/use-selected-portfolio";
import {
  PortfolioContext,
} from "@/hooks/use-portfolio-context";
import type { Profile, Portfolio } from "@/types/database";

type PortfolioWithCount = Portfolio & { company_count: number };

export function AuthenticatedShell({
  profile,
  portfolios,
  defaultPortfolioId,
  children,
}: {
  profile: Profile;
  portfolios: PortfolioWithCount[];
  defaultPortfolioId: string;
  children: React.ReactNode;
}) {
  const { selectedId, select } = useSelectedPortfolio(defaultPortfolioId);

  // If the stored portfolio was deleted, fall back to default
  const validSelectedId = portfolios.some((p) => p.id === selectedId)
    ? selectedId
    : defaultPortfolioId;

  const selectedPortfolio = portfolios.find((p) => p.id === validSelectedId);

  const contextValue = useMemo(
    () => ({
      selectedId: validSelectedId,
      select,
      portfolios,
      selectedPortfolio,
    }),
    [validSelectedId, select, portfolios, selectedPortfolio]
  );

  return (
    <PortfolioContext value={contextValue}>
      <div className="min-h-screen bg-background">
        <AppHeader profile={profile} />
        <QueryProvider>
          <main className="px-4 md:px-8 py-4">{children}</main>
        </QueryProvider>
        <Toaster position="top-right" richColors closeButton />
      </div>
    </PortfolioContext>
  );
}
