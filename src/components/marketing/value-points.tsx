import { SectionHeading } from "./section-heading";

/** A titled 3-up (or n-up) grid of short value propositions for sub-pages. */
export function ValuePoints({
  title,
  sub,
  points,
}: {
  title: string;
  sub?: string;
  points: { title: string; body: string }[];
}) {
  return (
    <section className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading title={title} sub={sub} />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-base font-semibold text-foreground">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
