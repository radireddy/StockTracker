"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserNav } from "@/components/auth/user-nav";
import { PortfolioDropdown } from "@/components/portfolio/portfolio-dropdown";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import type { Profile } from "@/types/database";

export function AppHeader({ profile }: { profile: Profile }) {
  const { portfolios, selectedId, select } = usePortfolioContext();
  const pathname = usePathname();
  const isDashboard = pathname === "/";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        <Link href="/" className="mr-6 font-bold text-primary">
          StockTracker
        </Link>
        {isDashboard && (
          <PortfolioDropdown
            portfolios={portfolios}
            selectedId={selectedId}
            onSelect={select}
          />
        )}
        <nav className="flex items-center gap-4 text-sm ml-6">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/import" className="text-muted-foreground hover:text-foreground">
            Import
          </Link>
          <Link href="/corporate-actions" className="text-muted-foreground hover:text-foreground">
            Corp Actions
          </Link>
          <Link href="/settings" className="text-muted-foreground hover:text-foreground">
            Settings
          </Link>
        </nav>
        <div className="ml-auto">
          <UserNav profile={profile} />
        </div>
      </div>
    </header>
  );
}
