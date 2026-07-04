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
  const isDashboard = pathname === "/dashboard";

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", active: pathname === "/dashboard" },
    { href: "/import", label: "Import", active: pathname.startsWith("/import") },
    { href: "/settings", label: "Settings", active: pathname.startsWith("/settings") },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        <Link href="/dashboard" className="mr-6 font-bold text-primary">
          StockTracker
        </Link>
        {isDashboard && (
          <div className="hidden lg:block">
            <PortfolioDropdown
              portfolios={portfolios}
              selectedId={selectedId}
              onSelect={select}
            />
          </div>
        )}
        <nav className="ml-6 hidden items-center gap-4 text-sm lg:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              className={
                link.active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <UserNav profile={profile} />
        </div>
      </div>
    </header>
  );
}
