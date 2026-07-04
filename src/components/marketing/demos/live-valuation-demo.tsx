"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, usePrefersReducedMotion } from "@/hooks/use-in-view";
import { DemoShell } from "./demo-shell";

/**
 * LiveValuationDemo — the anti-"dead PDF" centerpiece. The CMP ticks up and
 * down; buy price, margin of safety, IRR and the BUY signal all recompute in
 * real time. A frozen "PDF" chip alongside shows what a static report can't do.
 */

// Base-case model: back-solve buy price from a required return on target MC.
const TARGET_PRICE = 4200; // fair value from the model
const CENTER = 3600;

function metricsFor(cmp: number) {
  const buyPrice = 3400; // model's disciplined entry
  const mos = ((buyPrice - cmp) / buyPrice) * 100; // margin of safety %
  const irr = ((TARGET_PRICE / cmp) ** (1 / 3) - 1) * 100; // 3-yr IRR
  const isBuy = cmp <= buyPrice;
  return { buyPrice, mos, irr, isBuy };
}

export function LiveValuationDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const [cmp, setCmp] = useState(CENTER);
  const t = useRef(0);

  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => {
      t.current += 0.08;
      // oscillate through the buy threshold so the BUY badge toggles
      const next = CENTER + Math.sin(t.current) * 360;
      setCmp(Math.round(next));
    }, 90);
    return () => clearInterval(id);
  }, [inView, reduced]);

  const m = metricsFor(cmp);

  return (
    <div ref={ref}>
      <DemoShell label="Company valuation — recomputes with the live price">
        <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr]">
          {/* Live side */}
          <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Live in StockTracker
              </span>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <div className="text-[11px] text-muted-foreground">CMP</div>
                <div className="text-2xl font-bold tabular-nums text-foreground">
                  ₹{cmp.toLocaleString("en-IN")}
                </div>
              </div>
              {m.isBuy ? (
                <span className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">
                  BUY
                </span>
              ) : (
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  Watch
                </span>
              )}
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Metric label="Target buy" value={`₹${m.buyPrice.toLocaleString("en-IN")}`} />
              <Metric
                label="Margin of safety"
                value={`${m.mos > 0 ? "+" : ""}${m.mos.toFixed(1)}%`}
                tone={m.mos > 0 ? "good" : m.mos > -10 ? "warn" : "bad"}
              />
              <Metric
                label="Base-case IRR (3y)"
                value={`${m.irr.toFixed(1)}%`}
                tone={m.irr > 15 ? "good" : "warn"}
              />
            </dl>
          </div>

          {/* Frozen PDF side */}
          <div className="relative rounded-lg border border-dashed border-border bg-muted/30 p-3">
            <span className="absolute right-2 top-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              PDF · as of 3 months ago
            </span>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Your research report
            </div>
            <div className="mt-2 space-y-1.5 text-sm text-muted-foreground/70 grayscale">
              <div className="flex justify-between">
                <span>CMP (frozen)</span>
                <span className="tabular-nums line-through">₹3,120</span>
              </div>
              <div className="flex justify-between">
                <span>Target buy</span>
                <span className="tabular-nums">₹3,400</span>
              </div>
              <div className="flex justify-between">
                <span>Margin of safety</span>
                <span className="tabular-nums">+8.2%</span>
              </div>
              <div className="flex justify-between">
                <span>IRR</span>
                <span className="tabular-nums">18.0%</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
              Numbers frozen the day it was printed. Is it still a buy today? You
              can&apos;t tell.
            </p>
          </div>
        </div>
      </DemoShell>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-primary"
      : tone === "bad"
        ? "text-destructive"
        : tone === "warn"
          ? "text-chart-4"
          : "text-foreground";
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-semibold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}
