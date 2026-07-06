import Image from "next/image";
import { SectionHeading } from "./section-heading";

export function MobileSection() {
  return (
    <section className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading
          eyebrow="Mobile-first"
          title="Designed for the way you actually check your portfolio"
          sub="Native bottom nav, swipe-friendly cards, instant BUY zone scanning — the full product in your pocket, not a stripped-down mobile view."
        />

        <div className="mt-16 flex items-end justify-center">
          {/* Left phone — hidden on xs, visible sm+ */}
          <div className="hidden -mr-8 -rotate-6 flex-col items-center opacity-85 sm:flex">
            <Image
              src="/screenshots/mobile-filter-expanded.png"
              alt="Filter and sort panel on mobile"
              width={220}
              height={460}
              sizes="220px"
            />
            <p className="mt-3 text-sm text-muted-foreground">Sort &amp; filter on the go</p>
          </div>

          {/* Center phone — always visible, lifted above sides */}
          <div className="relative z-10 mb-6 flex flex-col items-center">
            <Image
              src="/screenshots/mobile-holdings.png"
              alt="Portfolio holdings view on mobile"
              width={260}
              height={544}
              sizes="260px"
              priority
            />
            <p className="mt-3 hidden text-sm text-muted-foreground sm:block">
              Holdings at a glance
            </p>
          </div>

          {/* Right phone — hidden on xs, visible sm+ */}
          <div className="hidden -ml-8 rotate-6 flex-col items-center opacity-85 sm:flex">
            <Image
              src="/screenshots/mobile-watchlist.png"
              alt="Watchlist with BUY zone signals on mobile"
              width={220}
              height={460}
              sizes="220px"
            />
            <p className="mt-3 text-sm text-muted-foreground">BUY zones, instantly</p>
          </div>
        </div>
      </div>
    </section>
  );
}
