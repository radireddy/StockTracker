import { SectionHeading } from "./section-heading";

const PAINS = [
  {
    moment: "The stale target",
    story:
      "The RA publishes a buy call at ₹420. You read it on Sunday. Monday the stock opens at ₹441. Is the margin of safety still positive? You're doing mental arithmetic on a PDF you cannot change — and you still don't know the answer.",
  },
  {
    moment: "The allocation question",
    story:
      "The RA assigns 4 stars — highest conviction. You already own this stock. Are you under-allocated or over? To find out: open your broker, copy holdings to a spreadsheet, calculate weights, cross-reference the recommended band. Most investors skip this step entirely and guess.",
  },
  {
    moment: "Waiting without a signal",
    story:
      "The RA says wait for a better price. So you open the broker app every morning and compare a number in your head to a number on a screen. There is no signal — just anxiety. A static number in a PDF cannot watch the price for you.",
  },
];

export function RaPainSection() {
  return (
    <section className="border-t bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading
          eyebrow="The RA subscriber's reality"
          title="Three moments every subscriber knows too well"
          sub="The research is excellent. The problem is what happens after the PDF arrives."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          {PAINS.map((p) => (
            <div
              key={p.moment}
              className="rounded-xl border border-border bg-background p-6"
            >
              <div className="mb-3 inline-block rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                Without StockTracker
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {p.moment}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {p.story}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
