"use client";

import { DemoShell } from "./demo-shell";

/**
 * TimelineDemo — quarterly research as a living, dated record with attachments
 * (image / PDF / link). Conveys "every quarter, in one place, forever".
 */
const ENTRIES = [
  {
    q: "Q1 FY26",
    date: "12 Jul 2025",
    text: "Revenue +18% YoY, margins held despite input costs. Mgmt guided 20%+ for FY26.",
    chips: ["📊 chart", "📄 concall PDF"],
  },
  {
    q: "Annual Report",
    date: "05 Jun 2025",
    text: "Capex cycle nearing completion — FCF inflection expected FY27. Promoter pledge nil.",
    chips: ["📄 AR FY25", "🔗 filing"],
  },
  {
    q: "Q4 FY25",
    date: "28 Apr 2025",
    text: "Beat estimates on volume. New segment scaling faster than modelled.",
    chips: ["🔗 interview"],
  },
];

export function TimelineDemo() {
  return (
    <DemoShell label="Company timeline — quarterly notes with attachments">
      <ol className="relative space-y-3 border-l border-border pl-4">
        {ENTRIES.map((e) => (
          <li key={e.q} className="relative">
            <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
            <div className="rounded-lg border border-border/60 bg-background p-2.5">
              <div className="flex items-center justify-between">
                <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                  {e.q}
                </span>
                <span className="text-[10px] text-muted-foreground">{e.date}</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-snug text-foreground">
                {e.text}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {e.chips.map((c) => (
                  <span
                    key={c}
                    className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </DemoShell>
  );
}
