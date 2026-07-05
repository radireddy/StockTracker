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
  const userInitial = (profile.display_name?.[0] ?? "U").toUpperCase();

  const contextValue = useMemo(
    () => ({
      selectedId: validSelectedId,
      select,
      portfolios,
      selectedPortfolio,
      userInitial,
    }),
    [validSelectedId, select, portfolios, selectedPortfolio, userInitial]
  );

  return (
    <PortfolioContext value={contextValue}>
      <div className="min-h-screen bg-background">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <AppHeader profile={profile} />
        <QueryProvider>
          <main id="main-content" tabIndex={-1} className="px-4 md:px-8 py-4 outline-none">{children}</main>
        </QueryProvider>
        <Toaster position="top-right" richColors closeButton />
      </div>
    </PortfolioContext>
  );
}
