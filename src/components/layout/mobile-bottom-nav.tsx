"use client";

import { useRouter, usePathname } from "next/navigation";
import { Briefcase, Eye } from "lucide-react";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import type { Portfolio } from "@/types/database";

type PortfolioWithCount = Portfolio & { company_count: number };

/** Preferred portfolio to open for a type: the default one, else the first. */
function firstOfType(portfolios: PortfolioWithCount[], type: Portfolio["type"]) {
  const ofType = portfolios.filter((p) => p.type === type);
  return ofType.find((p) => p.is_default) ?? ofType[0] ?? null;
}

/**
 * Fixed bottom navigation for small screens. Switches the dashboard between
 * holdings and watchlist portfolios (mirroring Zerodha's Portfolio/Watchlist
 * tabs). Hidden on `lg`+ where the header nav and dense table take over.
 */
export function MobileBottomNav() {
  const { portfolios, selectedPortfolio, select } = usePortfolioContext();
  const router = useRouter();
  const pathname = usePathname();
  const onDashboard = pathname === "/dashboard";
  const mode = selectedPortfolio?.type ?? "holdings";

  const go = (type: Portfolio["type"]) => {
    const target = firstOfType(portfolios, type);
    if (!target) return;
    select(target.id);
    if (!onDashboard) router.push("/dashboard");
  };

  const items = [
    {
      type: "holdings" as const,
      label: "Holdings",
      Icon: Briefcase,
      enabled: portfolios.some((p) => p.type === "holdings"),
    },
    {
      type: "watchlist" as const,
      label: "Watchlist",
      Icon: Eye,
      enabled: portfolios.some((p) => p.type === "watchlist"),
    },
  ];

  return (
    <nav
      aria-label="Portfolio type"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-16 border-t bg-background/95 px-4 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {items.map(({ type, label, Icon, enabled }) => {
        const active = onDashboard && mode === type;
        return (
          <button
            key={type}
            type="button"
            disabled={!enabled}
            onClick={() => go(type)}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
              active ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
