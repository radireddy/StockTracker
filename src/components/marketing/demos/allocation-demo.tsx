"use client";

import { useInView } from "@/hooks/use-in-view";
import { DemoShell, inr } from "./demo-shell";

/**
 * AllocationDemo — the conviction → target-band → rupee-delta loop.
 * Each row shows a holding's current weight against its star-rating band as a
 * RangeBar; under-allocated rows reveal exactly how much to add.
 */
type Row = {
  name: string;
  stars: number;
  weight: number; // current % of portfolio
  min: number;
  max: number;
  addLo?: number;
  addHi?: number;
};

const ROWS: Row[] = [
  { name: "Titan", stars: 4, weight: 3.8, min: 6, max: 8, addLo: 180000, addHi: 340000 },
  { name: "HDFC Bank", stars: 4, weight: 7.1, min: 6, max: 8 },
  { name: "Pidilite", stars: 3, weight: 5.2, min: 4, max: 6 },
  { name: "Coforge", stars: 2, weight: 4.6, min: 2, max: 4 },
  { name: "Astral", stars: 3, weight: 2.1, min: 4, max: 6, addLo: 210000, addHi: 430000 },
];

function status(r: Row): "under" | "in" | "over" {
  if (r.weight < r.min) return "under";
  if (r.weight > r.max) return "over";
  return "in";
}

const SCALE = 10; // % axis max for the bars

export function AllocationDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref}>
      <DemoShell label="Allocation view — weight vs. conviction target">
        <div className="space-y-2.5">
          <div className="grid grid-cols-[1fr_auto] items-center px-1 text-[11px] font-medium text-muted-foreground">
            <span>Holding</span>
            <span>Weight vs. target band</span>
          </div>
          {ROWS.map((r, i) => {
            const st = status(r);
            const barColor =
              st === "over"
                ? "bg-destructive"
                : st === "under"
                  ? "bg-chart-4"
                  : "bg-primary";
            return (
              <div
                key={r.name}
                className="grid grid-cols-[1fr] gap-1 rounded-lg border border-border/60 bg-background px-2.5 py-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {r.name}
                    </span>
                    <span className="text-[10px] text-chart-4" aria-label={`${r.stars} star`}>
                      {"★".repeat(r.stars)}
                      <span className="text-muted-foreground/40">
                        {"★".repeat(4 - r.stars)}
                      </span>
                    </span>
                  </div>
                  <span
                    className={[
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                      st === "over"
                        ? "bg-destructive/10 text-destructive"
                        : st === "under"
                          ? "bg-chart-4/15 text-chart-4"
                          : "bg-primary/10 text-primary",
                    ].join(" ")}
                  >
                    {st === "over" ? "Over" : st === "under" ? "Under" : "In range"}
                  </span>
                </div>
                {/* RangeBar */}
                <div className="relative mt-1 h-3 w-full rounded-full bg-muted">
                  {/* target band */}
                  <div
                    className="absolute top-0 h-3 rounded-full bg-primary/15"
                    style={{
                      left: `${(r.min / SCALE) * 100}%`,
                      width: `${((r.max - r.min) / SCALE) * 100}%`,
                    }}
                  />
                  {/* actual weight fill */}
                  <div
                    className={`absolute top-0 h-3 rounded-full ${barColor} transition-[width] duration-1000 ease-out motion-reduce:transition-none`}
                    style={{
                      width: inView ? `${(r.weight / SCALE) * 100}%` : "0%",
                      transitionDelay: `${i * 120}ms`,
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-2 text-[11px]">
                  <span className="tabular-nums text-muted-foreground">
                    {r.weight.toFixed(1)}% now · target {r.min}–{r.max}%
                  </span>
                  {r.addLo && (
                    <span className="font-semibold text-primary">
                      add {inr(r.addLo)}–{inr(r.addHi!)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DemoShell>
    </div>
  );
}
