"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, usePrefersReducedMotion } from "@/hooks/use-in-view";
import { DemoShell } from "./demo-shell";

/**
 * DashboardScanDemo — the 60-second morning scan. A compact companies table
 * with the decision columns (MoS, IRR, signal). One row's price drifts below
 * its target and flips to a green BUY.
 */
type Co = {
  name: string;
  stars: number;
  cmp: number;
  buy: number;
  irr: number;
  drift?: boolean; // this row's CMP animates down past the buy line
};

const COS: Co[] = [
  { name: "Titan", stars: 4, cmp: 3480, buy: 3400, irr: 16.2, drift: true },
  { name: "HDFC Bank", stars: 4, cmp: 1520, buy: 1650, irr: 19.4 },
  { name: "Pidilite", stars: 3, cmp: 2810, buy: 2500, irr: 12.1 },
  { name: "Astral", stars: 3, cmp: 1740, buy: 1900, irr: 21.0 },
];

export function DashboardScanDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const [drift, setDrift] = useState(0);
  const t = useRef(0);

  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => {
      t.current += 0.1;
      setDrift(Math.round(Math.sin(t.current) * 120 - 40)); // dips negative → below buy
    }, 100);
    return () => clearInterval(id);
  }, [inView, reduced]);

  return (
    <div ref={ref}>
      <DemoShell label="Dashboard — sort by margin of safety, spot the buys">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {["All", "★★★★", "★★★", "Core", "Satellite"].map((c, i) => (
            <span
              key={c}
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                i === 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              {c}
            </span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Company</th>
                <th className="px-2 py-1.5 text-right font-medium">CMP</th>
                <th className="px-2 py-1.5 text-right font-medium">Target</th>
                <th className="px-2 py-1.5 text-right font-medium">MoS%</th>
                <th className="px-2 py-1.5 text-right font-medium">IRR</th>
                <th className="py-1.5 pl-2 text-right font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {COS.map((c) => {
                const cmp = c.drift ? c.cmp + drift : c.cmp;
                const mos = ((c.buy - cmp) / c.buy) * 100;
                const isBuy = cmp <= c.buy;
                return (
                  <tr key={c.name} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-2">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="ml-1.5 text-[10px] text-chart-4">
                        {"★".repeat(c.stars)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-foreground">
                      ₹{cmp.toLocaleString("en-IN")}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      ₹{c.buy.toLocaleString("en-IN")}
                    </td>
                    <td
                      className={[
                        "px-2 py-2 text-right font-semibold tabular-nums",
                        mos > 0 ? "text-primary" : mos > -10 ? "text-chart-4" : "text-destructive",
                      ].join(" ")}
                    >
                      {mos > 0 ? "+" : ""}
                      {mos.toFixed(1)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-foreground">
                      {c.irr.toFixed(1)}%
                    </td>
                    <td className="py-2 pl-2 text-right">
                      {isBuy ? (
                        <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                          BUY
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DemoShell>
    </div>
  );
}
