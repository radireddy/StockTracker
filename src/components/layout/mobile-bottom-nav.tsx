"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Briefcase, Eye, PlusCircle, FolderPlus, Plus } from "lucide-react";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { firstOfType } from "@/lib/utils/portfolios";
import { CreatePortfolioDialog } from "@/components/portfolio/create-portfolio-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * Fixed bottom navigation for small screens. Left: user avatar. Middle:
 * Holdings / Watchlist view switch. Right: teal Add (company) and Portfolio
 * (new portfolio) actions. Hidden on `lg`+ where the header + dense table
 * take over.
 */
export function MobileBottomNav() {
  const { portfolios, selectedPortfolio, select, userInitial } = usePortfolioContext();
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<Portfolio["type"]>("holdings");
  const [emptyType, setEmptyType] = useState<Portfolio["type"] | null>(null);
  const onDashboard = pathname === "/dashboard";
  const mode = selectedPortfolio?.type ?? "holdings";

  const go = (type: Portfolio["type"]) => {
    const target = firstOfType(portfolios, type);
    // No portfolio of this type yet — offer to create one instead of a dead tap.
    if (!target) {
      setEmptyType(type);
      return;
    }
    select(target.id);
    if (!onDashboard) router.push("/dashboard");
  };

  const views = [
    { type: "holdings" as const, label: "Holdings", Icon: Briefcase },
    { type: "watchlist" as const, label: "Watchlist", Icon: Eye },
  ];

  const itemBase =
    "flex flex-col items-center gap-1 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40";

  return (
    <>
      <nav
        aria-label="Dashboard navigation"
        className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t bg-background/85 px-4 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <button
          type="button"
          onClick={() => router.push("/settings")}
          aria-label="Account settings"
          className="grid h-9 w-9 place-items-center rounded-full bg-foreground/90 text-sm font-bold text-background"
        >
          {userInitial}
        </button>

        {views.map(({ type, label, Icon }) => {
          const active = onDashboard && mode === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => go(type)}
              aria-current={active ? "page" : undefined}
              className={`${itemBase} ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <Icon size={22} aria-hidden="true" />
              {label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => router.push("/company/new")}
          className={`${itemBase} text-primary`}
        >
          <PlusCircle size={22} aria-hidden="true" />
          Add
        </button>

        <button
          type="button"
          onClick={() => {
            setCreateType("holdings");
            setCreateOpen(true);
          }}
          className={`${itemBase} text-primary`}
        >
          <FolderPlus size={22} aria-hidden="true" />
          Portfolio
        </button>
      </nav>

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
        onCreated={(id) => {
          select(id);
          if (!onDashboard) router.push("/dashboard");
        }}
      />
    </>
  );
}
