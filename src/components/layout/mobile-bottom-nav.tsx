"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Briefcase, Eye, PlusCircle, FolderPlus } from "lucide-react";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { firstOfType } from "@/lib/utils/portfolios";
import { CreatePortfolioDialog } from "@/components/portfolio/create-portfolio-dialog";
import type { Portfolio } from "@/types/database";

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
  const onDashboard = pathname === "/dashboard";
  const mode = selectedPortfolio?.type ?? "holdings";

  const go = (type: Portfolio["type"]) => {
    const target = firstOfType(portfolios, type);
    if (!target) return;
    select(target.id);
    if (!onDashboard) router.push("/dashboard");
  };

  const views = [
    { type: "holdings" as const, label: "Holdings", Icon: Briefcase, enabled: portfolios.some((p) => p.type === "holdings") },
    { type: "watchlist" as const, label: "Watchlist", Icon: Eye, enabled: portfolios.some((p) => p.type === "watchlist") },
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

        {views.map(({ type, label, Icon, enabled }) => {
          const active = onDashboard && mode === type;
          return (
            <button
              key={type}
              type="button"
              disabled={!enabled}
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
          onClick={() => setCreateOpen(true)}
          className={`${itemBase} text-primary`}
        >
          <FolderPlus size={22} aria-hidden="true" />
          Portfolio
        </button>
      </nav>

      <CreatePortfolioDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          select(id);
          if (!onDashboard) router.push("/dashboard");
        }}
      />
    </>
  );
}
