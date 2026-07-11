import { GoogleCta } from "./google-cta";

const SIGNALS = [
  {
    chip: "MoS live",
    label: "Which companies are below your buy price",
  },
  {
    chip: "Allocation gap",
    label: "Which positions are under-allocated — in rupees",
  },
  {
    chip: "BUY signal",
    label: "Which watchlist names just crossed into buying range",
  },
];

export function RaVolatilitySection() {
  return (
    <section className="border-t">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground dark:bg-primary/10 dark:text-primary">
          The decisive advantage
        </span>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          When volatility hits, most investors freeze.
          <br className="hidden sm:block" /> You won&rsquo;t.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
          A 10% market fall looks like a crisis or a buying opportunity — without
          data you can&rsquo;t tell which. With StockTracker, every dip is a
          calculation. You act on fact, research and conviction — not on what
          everyone else is panicking about.
        </p>

        <div className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
          {SIGNALS.map((s) => (
            <div
              key={s.chip}
              className="rounded-xl border border-border bg-card p-5 text-left"
            >
              <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {s.chip}
              </span>
              <p className="mt-3 text-sm font-medium text-foreground">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-xl text-sm text-muted-foreground">
          You shuffle the portfolio, add to high-conviction positions, trim the
          crowded ones — not because something <em>felt</em> right, but because
          the numbers said so.
        </p>

        <div className="mt-10">
          <GoogleCta className="inline-block rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
            Get started free
          </GoogleCta>
        </div>
      </div>
    </section>
  );
}
