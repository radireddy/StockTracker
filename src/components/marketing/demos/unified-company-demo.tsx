"use client";

import { DemoShell } from "./demo-shell";

/**
 * UnifiedCompanyDemo — the "everything scattered" pain resolved: four sources
 * (Notes, Excel, PDF, Zerodha) unify into one tabbed company workspace.
 */
const SCATTERED = [
  { icon: "🗒️", label: "Thesis in Notes" },
  { icon: "📊", label: "Model in Excel" },
  { icon: "📄", label: "Target in a PDF" },
  { icon: "🏦", label: "Holdings in Zerodha" },
];

const TABS = ["Details", "Thesis", "Projections", "Timeline", "Highlights"];

export function UnifiedCompanyDemo() {
  return (
    <DemoShell label="One company workspace — research and position together">
      <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {SCATTERED.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground"
          >
            <span>{s.icon}</span>
            <span className="truncate">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-center py-0.5 text-muted-foreground/60">↓</div>

      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Titan Company</div>
            <div className="text-[11px] text-muted-foreground">TITAN · ₹3,480 · ★★★★</div>
          </div>
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
            BUY
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {TABS.map((t, i) => (
            <span
              key={t}
              className={[
                "rounded-md px-2 py-1 text-[11px] font-medium",
                i === 0
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              ].join(" ")}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {[
            ["MoS", "+2.3%"],
            ["Base IRR", "16.2%"],
            ["Horizon", "3 yrs"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md bg-muted/40 py-1.5">
              <div className="text-[10px] text-muted-foreground">{k}</div>
              <div className="text-sm font-semibold tabular-nums text-foreground">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </DemoShell>
  );
}
