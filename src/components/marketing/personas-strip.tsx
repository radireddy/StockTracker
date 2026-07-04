import { SectionHeading } from "./section-heading";

/** "Which one are you?" — six one-line personas that mirror the hero pains. */
const PERSONAS = [
  {
    icon: "📄",
    title: "The report subscriber",
    line: "Tired of static PDF targets that don't move when the price does.",
  },
  {
    icon: "💰",
    title: "The capital deployer",
    line: "Fresh cash to invest and no objective way to decide where it goes.",
  },
  {
    icon: "🎯",
    title: "The concentrated investor",
    line: "20–40 high-conviction names, sized by conviction, held for years.",
  },
  {
    icon: "🔭",
    title: "The watchlist hunter",
    line: "A pipeline of great businesses you'll buy — only at the right price.",
  },
  {
    icon: "🗓️",
    title: "The quarterly tracker",
    line: "Every concall, every guidance revision, logged and never lost.",
  },
  {
    icon: "🏦",
    title: "The multi-account household",
    line: "Self, spouse and HUF demats — one true, consolidated position.",
  },
];

export function PersonasStrip() {
  return (
    <section id="personas" className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading
          eyebrow="Which one are you?"
          title="Built for how serious investors actually work"
          sub="However you run your portfolio, StockTracker fits the workflow you already have — and removes the busywork."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PERSONAS.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="text-2xl">{p.icon}</div>
              <h3 className="mt-3 text-base font-semibold text-foreground">
                {p.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {p.line}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
