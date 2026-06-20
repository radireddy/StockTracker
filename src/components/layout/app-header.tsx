import Link from "next/link";
import { UserNav } from "@/components/auth/user-nav";
import type { Profile } from "@/types/database";

export function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        <Link href="/" className="mr-6 font-bold">
          StockTracker
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/import" className="text-muted-foreground hover:text-foreground">
            Import
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
