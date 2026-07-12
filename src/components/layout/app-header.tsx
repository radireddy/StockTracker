"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserNav } from "@/components/auth/user-nav";
import type { Profile } from "@/types/database";

export function AppHeader({ profile }: { profile: Profile }) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", active: pathname === "/dashboard" },
    { href: "/import", label: "Import", active: pathname.startsWith("/import") },
    { href: "/allocation-calculator", label: "Allocation calculator", active: pathname === "/allocation-calculator" },
    { href: "/settings", label: "Settings", active: pathname.startsWith("/settings") },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        <Link
          href="/dashboard"
          prefetch={false}
          className="mr-2 flex items-center gap-2 font-bold tracking-tight text-primary"
        >
          <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-[15px] font-bold text-primary-foreground shadow-soft">
            S
          </span>
          StockTracker
        </Link>
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
