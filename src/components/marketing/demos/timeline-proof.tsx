/**
 * TimelineProof — a faithful, masked replica of the StockTracker company
 * Timeline tab. Shows quarter-labelled entries with attachment chips. Company
 * name, ticker, and rich-text content are redacted so no PII appears in the
 * DOM. All dates and notes are illustrative.
 */

type Entry = {
  q: string;
  date: string;
  bodyLines: string[]; // widths for redaction bars
  chips: string[];
};

const ENTRIES: Entry[] = [
  {
    q: "Q1 FY26",
    date: "12 Jul 2025",
    bodyLines: ["w-full", "w-5/6", "w-3/4"],
    chips: ["📊 Q1 Slides", "📄 Concall Transcript", "🔗 BSE Filing"],
  },
  {
    q: "Annual Report",
    date: "05 Jun 2025",
    bodyLines: ["w-full", "w-4/5", "w-2/3"],
    chips: ["📄 AR FY25", "🔗 Filing"],
  },
  {
    q: "Q4 FY25",
    date: "28 Apr 2025",
    bodyLines: ["w-full", "w-3/4"],
    chips: ["📊 Result Chart", "🔗 Interview"],
  },
  {
    q: "Q3 FY25",
    date: "14 Jan 2025",
    bodyLines: ["w-full", "w-5/6", "w-1/2"],
    chips: ["📄 Transcript"],
  },
  {
    q: "Concall Notes",
    date: "15 Oct 2024",
    bodyLines: ["w-full", "w-4/5"],
    chips: ["🔗 Recording"],
  },
];

function MaskedCompanyHeader() {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10"
        >
          <span className="h-3 w-5 rounded-[3px] bg-primary/30" />
        </span>
        <span className="flex flex-col gap-1.5">
          <span className="h-3.5 w-40 rounded bg-foreground/15" />
          <span className="h-2.5 w-24 rounded bg-muted-foreground/25" />
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">CMP <strong className="text-foreground">₹2,841.5</strong></span>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          ↑ 25% MoS
        </span>
      </div>
    </div>
  );
}

const TABS = ["Details", "Thesis", "Projections", "Timeline", "Highlights", "Holdings"];

function TabStrip() {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2">
      {TABS.map((t) => (
        <span
          key={t}
          className={[
            "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium",
            t === "Timeline"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground",
          ].join(" ")}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function MaskedBody({ lines }: { lines: string[] }) {
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {lines.map((w, i) => (
        <span key={i} className={`h-2.5 rounded bg-muted-foreground/20 ${w}`} />
      ))}
    </div>
  );
}

export function TimelineProof() {
  return (
    <div className="min-w-[700px] bg-background text-sm text-foreground">
      <MaskedCompanyHeader />
      <TabStrip />

      <div className="px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">
            Timeline <span className="ml-1 font-normal text-muted-foreground">(5 entries)</span>
          </h3>
          <span className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            + Add entry
          </span>
        </div>

        <ol className="relative space-y-3 border-l border-border pl-5">
          {ENTRIES.map((e) => (
            <li key={e.q} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                    {e.q}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{e.date}</span>
                </div>
                <MaskedBody lines={e.bodyLines} />
                <div className="mt-2 flex flex-wrap gap-1.5">
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
      </div>
    </div>
  );
}
