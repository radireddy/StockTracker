"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, usePrefersReducedMotion } from "@/hooks/use-in-view";
import { DemoShell } from "./demo-shell";

/**
 * ValuationScenariosDemo — shows how user-defined bull/base/bear assumptions
 * derive a buy price for each scenario, forming a live buy price range.
 * CMP ticks; IRR for each scenario updates in real time.
 */

// Projected EPS (3 yr out), required return
const EPS = 180;
const R = 0.15; // 15% required return
const YEARS = 3;
const CENTER = 3_200;

const SCENARIOS = [
  { label: "Bull", pe: 35, color: "text-primary", bg: "bg-primary/10" },
  { label: "Base", pe: 28, color: "text-chart-2", bg: "bg-chart-2/10" },
  { label: "Bear", pe: 22, color: "text-chart-4", bg: "bg-chart-4/15" },
] as const;

function derived(pe: number, cmp: number) {
  const fairValue = EPS * pe;
  const buyPrice = Math.round(fairValue / (1 + R) ** YEARS);
  const irr = ((fairValue / cmp) ** (1 / YEARS) - 1) * 100;
  return { fairValue, buyPrice, irr };
}

export function ValuationScenariosDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const [cmp, setCmp] = useState(CENTER);
  const t = useRef(0);

  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => {
      t.current += 0.06;
      // Oscillate so CMP crosses the base-case buy price threshold
      setCmp(Math.round(CENTER + Math.sin(t.current) * 500));
    }, 100);
    return () => clearInterval(id);
  }, [inView, reduced]);

  const baseD = derived(28, cmp);
  const inBuyRange = cmp <= baseD.buyPrice;

  return (
    <div ref={ref}>
      <DemoShell label="Valuation scenarios — your assumptions, your buy price range">
        {/* Header row */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-muted-foreground">CMP (live)</div>
            <div className="text-xl font-bold tabular-nums text-foreground">
              ₹{cmp.toLocaleString("en-IN")}
            </div>
          </div>
          <span
            className={[
              "rounded-md px-2.5 py-1 text-xs font-bold",
              inBuyRange
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            ].join(" ")}
          >
            {inBuyRange ? "In buy range" : "Above base buy price"}
          </span>
        </div>

        {/* Column headers */}
        <div className="mb-1.5 grid grid-cols-[56px_1fr_1fr_1fr] gap-x-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Case</span>
          <span className="text-right">Fair value</span>
          <span className="text-right">Buy price</span>
          <span className="text-right">IRR</span>
        </div>

        {/* Scenario rows */}
        <div className="space-y-1.5">
          {SCENARIOS.map((s) => {
            const d = derived(s.pe, cmp);
            const isBuy = cmp <= d.buyPrice;
            return (
              <div
                key={s.label}
                className="grid grid-cols-[56px_1fr_1fr_1fr] items-center gap-x-2 rounded-lg border border-border/60 bg-background px-2.5 py-2"
              >
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.bg} ${s.color}`}
                >
                  {s.label}
                </span>
                <span className="text-right text-[12px] tabular-nums text-muted-foreground">
                  ₹{d.fairValue.toLocaleString("en-IN")}
                </span>
                <span
                  className={`text-right text-[12px] font-semibold tabular-nums ${isBuy ? "text-primary" : "text-foreground"}`}
                >
                  ₹{d.buyPrice.toLocaleString("en-IN")}
                  {isBuy && (
                    <span className="ml-1 text-[9px] font-bold text-primary">
                      ✓
                    </span>
                  )}
                </span>
                <span
                  className={`text-right text-[12px] font-semibold tabular-nums ${d.irr > 15 ? "text-primary" : d.irr > 0 ? "text-chart-4" : "text-destructive"}`}
                >
                  {d.irr.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>

        {/* Buy range label */}
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Buy price range:{" "}
          <span className="font-semibold text-foreground">
            ₹{derived(22, cmp).buyPrice.toLocaleString("en-IN")} – ₹
            {derived(35, cmp).buyPrice.toLocaleString("en-IN")}
          </span>{" "}
          · derived from your assumptions
        </p>
      </DemoShell>
    </div>
  );
}
