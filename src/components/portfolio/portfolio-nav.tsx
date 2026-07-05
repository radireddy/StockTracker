"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, Eye, Plus } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { firstOfType } from "@/lib/utils/portfolios";
import { CreatePortfolioDialog } from "./create-portfolio-dialog";
import type { Portfolio } from "@/types/database";

const EMPTY_META: Record<
  Portfolio["type"],
  { Icon: typeof Eye; title: string; description: string; cta: string }
> = {
  holdings: {
    Icon: Briefcase,
    title: "No holdings portfolio yet",
    description: "Create a holdings portfolio to track the stocks you own.",
    cta: "Create holdings portfolio",
  },
  watchlist: {
    Icon: Eye,
    title: "Your watchlist is empty",
    description:
      "You don't have a watchlist yet. Create one to track companies you're researching.",
    cta: "Create watchlist",
  },
};

/**
 * On-page portfolio navigation for desktop: a Portfolios | Watchlists type
 * toggle plus a one-click pill row of the portfolios of the active type.
 * Replaces the old header dropdown — portfolios and watchlists are the same
 * entity distinguished by `type`, so this mirrors that model directly.
 */
export function PortfolioNav() {
  const { portfolios, selectedId, select, selectedPortfolio } = usePortfolioContext();
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<Portfolio["type"]>("holdings");
  const [emptyType, setEmptyType] = useState<Portfolio["type"] | null>(null);

  const activeType: Portfolio["type"] = selectedPortfolio?.type ?? "holdings";
  const sameType = portfolios.filter((p) => p.type === activeType);

  const handleTypeChange = (type: Portfolio["type"]) => {
    if (type === activeType) return;
    const target = firstOfType(portfolios, type);
    // No portfolio of this type yet — offer to create one instead of a dead click.
    if (!target) {
      setEmptyType(type);
      return;
    }
    select(target.id);
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
        <Pill
          ghost
          onClick={() => {
            setCreateType(activeType);
            setCreateOpen(true);
          }}
        >
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

      <Dialog
        open={emptyType !== null}
        onOpenChange={(open) => {
          if (!open) setEmptyType(null);
        }}
      >
        <DialogContent>
          {emptyType && (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{EMPTY_META[emptyType].title}</DialogTitle>
              </DialogHeader>
              <EmptyState
                icon={EMPTY_META[emptyType].Icon}
                title={EMPTY_META[emptyType].title}
                description={EMPTY_META[emptyType].description}
                className="border-none bg-transparent px-0 py-2"
              >
                <Button
                  onClick={() => {
                    const type = emptyType;
                    setEmptyType(null);
                    setCreateType(type);
                    setCreateOpen(true);
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                  {EMPTY_META[emptyType].cta}
                </Button>
              </EmptyState>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CreatePortfolioDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultType={createType}
        onCreated={(id) => select(id)}
      />
    </div>
  );
}
