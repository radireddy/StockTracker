"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, usePrefersReducedMotion } from "@/hooks/use-in-view";
import { DemoShell, inr } from "./demo-shell";

/**
 * ZerodhaImportDemo — a holdings statement "uploads" and positions stream in,
 * across multiple demat accounts, consolidating into one portfolio.
 */
const HOLDINGS = [
  { name: "Titan", acct: "Self", qty: 120, val: 417600 },
  { name: "HDFC Bank", acct: "Self", qty: 300, val: 456000 },
  { name: "Pidilite", acct: "Spouse", qty: 90, val: 252900 },
  { name: "Astral", acct: "HUF", qty: 150, val: 261000 },
  { name: "Coforge", acct: "Self", qty: 40, val: 268000 },
];

export function ZerodhaImportDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const [count, setCount] = useState(reduced ? HOLDINGS.length : 0);
  const started = useRef(false);

  useEffect(() => {
    if (!inView || reduced || started.current) return;
    started.current = true;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setCount(n);
      if (n >= HOLDINGS.length) clearInterval(id);
    }, 450);
    return () => clearInterval(id);
  }, [inView, reduced]);

  const shown = HOLDINGS.slice(0, count);
  const total = shown.reduce((s, h) => s + h.val, 0);
  const accts = Array.from(new Set(shown.map((h) => h.acct)));

  return (
    <div ref={ref}>
      <DemoShell label="Zerodha import — positions populate automatically">
        <div className="mb-3 flex items-center justify-between rounded-lg border border-dashed border-primary/40 bg-primary/[0.03] px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">📄</span>
            <span className="font-medium text-foreground">holdings.xlsx</span>
            <span className="text-[11px] text-muted-foreground">Zerodha · Kite</span>
          </div>
          <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {count < HOLDINGS.length ? "Importing…" : "Imported ✓"}
          </span>
        </div>

        <div className="mb-2 flex flex-wrap gap-1.5">
          {accts.map((a) => (
            <span
              key={a}
              className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground"
            >
              {a}
            </span>
          ))}
        </div>

        <div className="space-y-1.5">
          {shown.map((h) => (
            <div
              key={h.name}
              className="flex items-center justify-between rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-sm duration-500 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{h.name}</span>
                <span className="text-[10px] text-muted-foreground">{h.acct}</span>
              </div>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="text-muted-foreground">{h.qty} qty</span>
                <span className="font-medium text-foreground">{inr(h.val)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            Consolidated portfolio · {accts.length} account
            {accts.length !== 1 ? "s" : ""}
          </span>
          <span className="text-sm font-bold tabular-nums text-primary">
            {inr(total)}
          </span>
        </div>
      </DemoShell>
    </div>
  );
}
