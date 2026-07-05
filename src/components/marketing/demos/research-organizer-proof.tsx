/**
 * ResearchOrganizerProof — a masked replica of the StockTracker company
 * detail page. Shows the header verdict (CMP, target, MoS, BUY, stars, IRR)
 * and the full tab strip. Company name, ticker, and all text content are
 * redacted. All numbers are illustrative.
 */

const TABS = ["Details", "Thesis", "Projections", "Timeline", "Highlights", "Holdings"];

function Stars({ n }: { n: number }) {
  return (
    <span className="tracking-tight" aria-label={`${n} star conviction`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={i < n ? "text-chart-4" : "text-muted-foreground/30"}>
          ★
        </span>
      ))}
    </span>
  );
}

function MaskedName() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10"
      >
        <span className="h-3 w-5 rounded-[3px] bg-primary/30" />
      </span>
      <span className="flex flex-col gap-1.5">
        <span className="h-4 w-48 rounded bg-foreground/15" />
        <span className="h-2.5 w-28 rounded bg-muted-foreground/25" />
      </span>
    </div>
  );
}

function VerdictRow() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: "CMP", value: "₹2,841.5", tone: "neutral" },
        { label: "Target Buy", value: "₹2,272", tone: "neutral" },
        { label: "Margin of Safety", value: "+25%", tone: "good" },
        { label: "Base IRR (3y)", value: "18.4%", tone: "good" },
      ].map(({ label, value, tone }) => (
        <div key={label} className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground">{label}</div>
          <div
            className={[
              "mt-0.5 text-sm font-semibold tabular-nums",
              tone === "good" ? "text-primary" : "text-foreground",
            ].join(" ")}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

const THESIS_LINES = ["w-full", "w-5/6", "w-full", "w-4/5", "w-3/4", "w-full", "w-5/6", "w-2/3"];
const HIGHLIGHTS = [
  { w: "w-3/4" },
  { w: "w-5/6" },
  { w: "w-2/3" },
];

export function ResearchOrganizerProof() {
  return (
    <div className="min-w-[740px] bg-background text-sm text-foreground">
      {/* Company header */}
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <MaskedName />
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
              BUY ZONE
            </span>
            <Stars n={3} />
          </div>
        </div>
        <VerdictRow />
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2">
        {TABS.map((t) => (
          <span
            key={t}
            className={[
              "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium",
              t === "Thesis"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            ].join(" ")}
          >
            {t}
          </span>
        ))}
      </div>

      {/* Thesis tab body */}
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_220px]">
        <div>
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Investment thesis
          </div>
          <div className="flex flex-col gap-2">
            {THESIS_LINES.map((w, i) => (
              <span key={i} className={`h-2.5 rounded bg-foreground/12 ${w}`} />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Highlights
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
              {HIGHLIGHTS.map(({ w }, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                  <span className={`h-2.5 rounded bg-foreground/12 ${w}`} />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-2.5">
            <div className="mb-1 text-[10px] text-muted-foreground">Sector</div>
            <span className="h-2.5 w-24 rounded bg-foreground/12 block" />
            <div className="mt-2 mb-1 text-[10px] text-muted-foreground">Portfolio type</div>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              Core
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
