import Link from "next/link";
import { SITE_NAME } from "@/lib/seo";
import { GoogleCta } from "@/components/marketing/google-cta";
import { MarketingThemeSwitcher } from "@/components/marketing/marketing-theme-switcher";

/** Shared marketing header. `home` links the wordmark back to / on sub-pages. */
export function SiteHeader({ home = false }: { home?: boolean }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold text-primary">
          {SITE_NAME}
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href={home ? "#features" : "/#features"}
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Features
          </Link>
          <Link
            href="/allocation-calculator"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Allocation calculator
          </Link>
          <MarketingThemeSwitcher />
          <GoogleCta className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Sign in
          </GoogleCta>
        </div>
      </div>
    </header>
  );
}
