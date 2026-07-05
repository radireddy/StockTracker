"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { Pill } from "@/components/ui/pill";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { firstOfType } from "@/lib/utils/portfolios";
import { CreatePortfolioDialog } from "./create-portfolio-dialog";
import type { Portfolio } from "@/types/database";

/**
 * On-page portfolio navigation for desktop: a Portfolios | Watchlists type
 * toggle plus a one-click pill row of the portfolios of the active type.
 * Replaces the old header dropdown — portfolios and watchlists are the same
 * entity distinguished by `type`, so this mirrors that model directly.
 */
export function PortfolioNav() {
  const { portfolios, selectedId, select, selectedPortfolio } = usePortfolioContext();
  const [createOpen, setCreateOpen] = useState(false);

  const activeType: Portfolio["type"] = selectedPortfolio?.type ?? "holdings";
  const sameType = portfolios.filter((p) => p.type === activeType);

  const handleTypeChange = (type: Portfolio["type"]) => {
    if (type === activeType) return;
    const target = firstOfType(portfolios, type);
    if (target) select(target.id);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <Segmented<Portfolio["type"]>
        aria-label="Portfolio type"
        value={activeType}
        onValueChange={handleTypeChange}
        options={[
          { value: "holdings", label: "Portfolios" },
          { value: "watchlist", label: "Watchlists" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        {sameType.map((p) => (
          <Pill
            key={p.id}
            active={p.id === selectedId}
            aria-current={p.id === selectedId ? "true" : undefined}
            dotColor={p.color}
            count={p.company_count}
            onClick={() => select(p.id)}
          >
            {p.name}
          </Pill>
        ))}
        <Pill ghost onClick={() => setCreateOpen(true)}>
          <Plus size={13} aria-hidden="true" />
          New
        </Pill>
        <Link
          href="/settings"
          className="ml-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Manage
        </Link>
      </div>

      <CreatePortfolioDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => select(id)}
      />
    </div>
  );
}
