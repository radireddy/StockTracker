import { SectionHeading } from "./section-heading";

export type HowToStep = { title: string; body: string };

/**
 * HowTo — a compact numbered "how to do this in StockTracker" block so each
 * story doubles as onboarding. Rendered as a semantic ordered list with
 * primary-tinted step badges; themes cleanly in light and dark.
 */
export function HowTo({
  title = "How to do this in StockTracker",
  sub,
  steps,
}: {
  title?: string;
  sub?: string;
  steps: HowToStep[];
}) {
  return (
    <section className="border-t bg-card">
      <div className="mx-auto max-w-3xl px-4 py-20">
        <SectionHeading eyebrow="Step by step" title={title} sub={sub} />
        <ol className="mt-12 space-y-6">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              >
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <h3 className="text-base font-semibold text-foreground">
                  {s.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
