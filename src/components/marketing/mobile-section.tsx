import Image from "next/image";
import { SectionHeading } from "./section-heading";

export function MobileSection() {
  return (
    <section className="border-t bg-gradient-to-b from-background to-muted/30 overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading
          eyebrow="Mobile-first"
          title="Designed for the way you actually check your portfolio"
          sub="Native bottom nav, swipe-friendly cards, instant BUY zone scanning — the full product in your pocket, not a stripped-down mobile view."
        />

        <div className="relative mt-16 flex items-end justify-center">
          {/* Ambient glow behind phones */}
          <div
            className="pointer-events-none absolute inset-0 flex items-end justify-center pb-16"
            aria-hidden
          >
            <div className="h-72 w-[480px] rounded-full bg-emerald-500/12 blur-3xl" />
          </div>

          {/* Left phone — hidden on xs, visible sm+ */}
          <div className="hidden -mr-6 -rotate-6 flex-col items-center sm:flex">
            <div style={{ filter: "drop-shadow(0 20px 50px rgba(0,0,0,0.32))" }}>
              <Image
                src="/screenshots/mobile-filter-expanded.png"
                alt="Filter and sort panel on mobile"
                width={210}
                height={440}
                sizes="210px"
                className="opacity-90"
              />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Sort &amp; filter on the go</p>
          </div>

          {/* Center phone — always visible, lifted above sides */}
          <div className="relative z-10 mb-6 flex flex-col items-center">
            <div style={{ filter: "drop-shadow(0 30px 70px rgba(0,0,0,0.42))" }}>
              <Image
                src="/screenshots/mobile-holdings.png"
                alt="Portfolio holdings view on mobile"
                width={260}
                height={544}
                sizes="260px"
                priority
              />
            </div>
            <p className="mt-4 hidden text-sm text-muted-foreground sm:block">
              Holdings at a glance
            </p>
          </div>

          {/* Right phone — hidden on xs, visible sm+ */}
          <div className="hidden -ml-6 rotate-6 flex-col items-center sm:flex">
            <div style={{ filter: "drop-shadow(0 20px 50px rgba(0,0,0,0.32))" }}>
              <Image
                src="/screenshots/mobile-watchlist.png"
                alt="Watchlist with BUY zone signals on mobile"
                width={210}
                height={440}
                sizes="210px"
                className="opacity-90"
              />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">BUY zones, instantly</p>
          </div>
        </div>
      </div>
    </section>
  );
}
