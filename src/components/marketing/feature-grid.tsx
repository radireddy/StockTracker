import { SectionHeading } from "./section-heading";

/** Condensed feature grid — covers what the demos don't carry directly. */
const FEATURES = [
  {
    title: "One-click Zerodha import",
    body: "Upload a holdings statement and every position — quantity, average cost, ISIN — lands instantly, auto-creating companies and detecting the account.",
  },
  {
    title: "Multi-account consolidation",
    body: "Track any number of demat accounts and see a single true position, cost-weighted, or drill into one account at a time.",
  },
  {
    title: "Bull / base / bare valuation",
    body: "Enter one lever — target PE or EV/EBITDA — and the model back-solves target market cap, IRR and the buy price that earns your required return.",
  },
  {
    title: "Multi-year projection models",
    body: "A spreadsheet-grade grid computes PAT, margins, growth and forward PEG across years — without the fragile formulas.",
  },
  {
    title: "Conviction-driven allocation",
    body: "Star ratings set target weight bands you control. The allocation view flags every over- and under-weight position, to the rupee.",
  },
  {
    title: "Thesis, timeline & highlights",
    body: "Write your thesis, log quarterly notes with images, PDFs and links, and pin the points that would make you buy more — or sell.",
  },
  {
    title: "Watchlist that's buy-ready",
    body: "Research names before you own them with the same depth, so when the price comes to you the homework is already done.",
  },
  {
    title: "Private by default",
    body: "Every account's data is isolated per user with row-level security. Your portfolio is only ever visible to you.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="border-t bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading
          title="Everything a value investor needs, in one place"
          sub="Research, valuation, holdings and allocation — without juggling spreadsheets, notes and PDFs."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-background p-5">
              <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
