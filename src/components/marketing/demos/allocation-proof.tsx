/**
 * AllocationProof — masked replica of the StockTracker allocation view.
 *
 * Combines two real screens into one composite:
 *   1. "Allocation health" widget — conviction-bucket bars vs. target (top)
 *   2. Allocation table — grouped by star rating, 2–3 companies per bucket
 *
 * Company names and tickers are replaced with redaction bars and random initials.
 * All numbers are illustrative — not real portfolio data.
 */

type BucketRow = {
  initials: string;
  nameW: string;
  tickerW: string;
  cmp: string;
  invPct: string;
  curPct: string;
  targetRange: string;
  barFill: number; // 0–100 relative to target
  barColor: "amber" | "green" | "red";
  status: "UNDER" | "IN RANGE" | "OVER";
  delta: string;
  mos: string;
};

type Bucket = {
  stars: number;
  pct: string;
  status: "UNDER" | "IN RANGE" | "OVER";
  targetRange: string;
  actionText: string;
  rows: BucketRow[];
};

const BUCKETS: Bucket[] = [
  {
    stars: 4,
    pct: "20.2%",
    status: "UNDER",
    targetRange: "target 24–32%",
    actionText: "add ₹4,05,620 to reach 24%",
    rows: [
      { initials: "NH", nameW: "w-24", tickerW: "w-12", cmp: "1,996.9", invPct: "5.7%", curPct: "5.3%", targetRange: "6–8%", barFill: 66, barColor: "amber", status: "UNDER",    delta: "-0.3%", mos: "-13%" },
      { initials: "OC", nameW: "w-28", tickerW: "w-14", cmp: "1,208.5", invPct: "6.5%", curPct: "6.1%", targetRange: "6–8%", barFill: 90, barColor: "green", status: "IN RANGE", delta: "—",     mos: "12%"  },
      { initials: "SH", nameW: "w-24", tickerW: "w-14", cmp: "176.71",  invPct: "4.6%", curPct: "3.6%", targetRange: "6–8%", barFill: 58, barColor: "amber", status: "UNDER",    delta: "-1.4%", mos: "-30%" },
    ],
  },
  {
    stars: 3,
    pct: "54.7%",
    status: "UNDER",
    targetRange: "target 64–96%",
    actionText: "add ₹33,05,924 to reach 64%",
    rows: [
      { initials: "CB", nameW: "w-20", tickerW: "w-12", cmp: "348.1",  invPct: "3.1%", curPct: "2.5%", targetRange: "4–6%", barFill: 63, barColor: "amber", status: "UNDER",    delta: "-0.9%", mos: "32%"  },
      { initials: "HZ", nameW: "w-24", tickerW: "w-14", cmp: "538.85", invPct: "5.2%", curPct: "4.0%", targetRange: "4–6%", barFill: 88, barColor: "green", status: "IN RANGE", delta: "—",     mos: "12%"  },
      { initials: "TT", nameW: "w-28", tickerW: "w-14", cmp: "180.11", invPct: "3.0%", curPct: "2.6%", targetRange: "4–6%", barFill: 60, barColor: "amber", status: "UNDER",    delta: "-1.0%", mos: "10%"  },
    ],
  },
  {
    stars: 2,
    pct: "17.2%",
    status: "IN RANGE",
    targetRange: "target 10–20%",
    actionText: "balanced",
    rows: [
      { initials: "SM", nameW: "w-24", tickerW: "w-14", cmp: "597.65",  invPct: "2.7%", curPct: "2.7%", targetRange: "2–4%", barFill: 82, barColor: "green", status: "IN RANGE", delta: "—", mos: "-16%" },
      { initials: "EH", nameW: "w-28", tickerW: "w-12", cmp: "1,216.2", invPct: "3.7%", curPct: "3.3%", targetRange: "2–4%", barFill: 95, barColor: "green", status: "IN RANGE", delta: "—", mos: "-13%" },
    ],
  },
  {
    stars: 1,
    pct: "7.9%",
    status: "OVER",
    targetRange: "target 0–4%",
    actionText: "trim ₹1,84,320 to reach 4%",
    rows: [
      { initials: "JF", nameW: "w-20", tickerW: "w-14", cmp: "131.67", invPct: "6.6%", curPct: "5.9%", targetRange: "2–4%", barFill: 100, barColor: "red", status: "OVER", delta: "+2.6%", mos: "9%" },
    ],
  },
];

// ── Sub-components ──────────────────────────────────────────────────────────

function Stars({ n }: { n: number }) {
  return (
    <span className="tracking-tight text-xs" aria-label={`${n} star conviction`}>
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} className={i < n ? "text-chart-4" : "text-muted-foreground/20"}>★</span>
      ))}
    </span>
  );
}

function MaskedName({ initials, nameW, tickerW }: { initials: string; nameW: string; tickerW: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
        {initials}
      </span>
      <span className="flex flex-col gap-1">
        <span className={`h-2 rounded bg-foreground/15 ${nameW}`} />
        <span className={`h-1.5 rounded bg-muted-foreground/20 ${tickerW}`} />
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: "UNDER" | "IN RANGE" | "OVER" }) {
  const cls =
    status === "IN RANGE" ? "bg-primary/10 text-primary" :
    status === "OVER"     ? "bg-destructive/10 text-destructive" :
                            "bg-chart-4/10 text-chart-4";
  return <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${cls}`}>{status}</span>;
}

function InvestedBar({ fill, color }: { fill: number; color: "amber" | "green" | "red" }) {
  const barCls = color === "green" ? "bg-primary" : color === "red" ? "bg-destructive" : "bg-chart-4";
  return (
    <div className="relative h-2 w-16 overflow-visible rounded-full bg-muted/40">
      <div className={`absolute left-0 top-0 h-full rounded-full ${barCls}`} style={{ width: `${fill}%` }} />
      {color !== "red" && (
        <div className="absolute top-0 h-full w-px bg-muted-foreground/50" style={{ left: "90%" }} />
      )}
    </div>
  );
}

function DeltaCell({ value }: { value: string }) {
  if (value === "—") return <span className="text-muted-foreground">—</span>;
  const isPos = value.startsWith("+");
  return <span className={`tabular-nums font-semibold ${isPos ? "text-destructive" : "text-chart-4"}`}>{value}</span>;
}

function MosCell({ value }: { value: string }) {
  const isNeg = value.startsWith("-");
  return <span className={`tabular-nums font-semibold ${isNeg ? "text-destructive" : "text-primary"}`}>{value}</span>;
}

// Columns: Company | Star | CMP | Inv% | Cur% | Target | Status bar | Status | Delta | MoS% = 10
const COL_SPAN_LEFT = 9;

function BucketHeader({ bucket }: { bucket: Bucket }) {
  const currentFill = bucket.status === "OVER" ? 100 : bucket.status === "IN RANGE" ? 75 : 55;
  const headerBg =
    bucket.status === "IN RANGE" ? "bg-primary/5" :
    bucket.status === "OVER"     ? "bg-destructive/5" :
                                   "bg-chart-4/5";
  const barCls =
    bucket.status === "IN RANGE" ? "bg-primary/60" :
    bucket.status === "OVER"     ? "bg-destructive/60" :
                                   "bg-chart-4/60";
  const actionCls =
    bucket.status === "OVER"     ? "text-destructive" :
    bucket.status === "IN RANGE" ? "text-muted-foreground" :
                                   "text-chart-4";
  return (
    <tr className={`${headerBg} border-b border-border`}>
      <td colSpan={COL_SPAN_LEFT} className="py-1.5 pl-3 pr-2">
        <div className="flex items-center gap-2.5">
          <Stars n={bucket.stars} />
          <div className="relative flex h-2.5 w-32 items-center rounded-full bg-muted/50">
            <div className={`absolute left-0 top-0 h-full rounded-full ${barCls}`} style={{ width: `${currentFill}%` }} />
            <div className="absolute top-0 h-full w-px border-l border-dashed border-muted-foreground/40" style={{ left: "80%" }} />
          </div>
          <span className="tabular-nums text-[11px] font-semibold text-foreground">{bucket.pct}</span>
          <StatusBadge status={bucket.status} />
          <span className="text-[10px] text-muted-foreground">{bucket.targetRange}</span>
        </div>
      </td>
      <td className={`py-1.5 pr-3 text-right text-[9px] ${actionCls}`} colSpan={1}>
        {bucket.actionText}
      </td>
    </tr>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function AllocationProof() {
  return (
    <div className="w-full bg-background text-sm text-foreground">
      {/* ── Nav tabs ── */}
      <div className="border-b border-border px-4 pt-3">
        <div className="flex items-center gap-1">
          {["Portfolio", "Allocation", "Invested", "Current"].map((tab, i) => (
            <span
              key={tab}
              className={[
                "rounded-t px-3 py-1.5 text-xs font-medium",
                i === 1 ? "border-b-2 border-primary text-foreground" : "text-muted-foreground",
              ].join(" ")}
            >
              {tab}
            </span>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">27 companies</span>
        </div>
      </div>

      <div className="p-4">
        {/* ── Allocation health widget ── */}
        <div className="mb-4 rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-foreground">Allocation health</p>
            <p className="text-[10px] text-muted-foreground">current value vs. target by conviction</p>
          </div>
          <div className="mt-3 space-y-2.5">
            {[
              { stars: 4, currentPct: 20.2, targetPct: 28, label: "20.2%", status: "UNDER" as const },
              { stars: 3, currentPct: 54.7, targetPct: 80, label: "54.7%", status: "UNDER" as const },
              { stars: 2, currentPct: 17.2, targetPct: 15, label: "17.2%", status: "IN RANGE" as const },
              { stars: 1, currentPct: 7.9,  targetPct: 4,  label: "7.9%",  status: "OVER" as const },
            ].map(({ stars, currentPct, targetPct, label, status }) => {
              const max = Math.max(currentPct, targetPct) * 1.15;
              const fillW = (currentPct / max) * 100;
              const markerW = (targetPct / max) * 100;
              const barCls =
                status === "IN RANGE" ? "bg-primary/70" :
                status === "OVER"     ? "bg-destructive/60" :
                                       "bg-chart-4/70";
              const badgeCls =
                status === "IN RANGE" ? "bg-primary/10 text-primary" :
                status === "OVER"     ? "bg-destructive/10 text-destructive" :
                                       "bg-chart-4/10 text-chart-4";
              return (
                <div key={stars} className="flex items-center gap-2.5">
                  <span className="w-12 shrink-0 text-[11px] tracking-tight">
                    {Array.from({ length: 4 }, (_, i) => (
                      <span key={i} className={i < stars ? "text-chart-4" : "text-muted-foreground/20"}>★</span>
                    ))}
                  </span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted/40">
                    <div className={`absolute left-0 top-0 h-full rounded-full ${barCls}`} style={{ width: `${fillW}%` }} />
                    <div className="absolute top-0 h-full w-px border-l border-dashed border-muted-foreground/50" style={{ left: `${markerW}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right text-[11px] tabular-nums font-medium text-foreground">{label}</span>
                  <span className={`w-14 shrink-0 rounded px-1 py-0.5 text-center text-[9px] font-semibold ${badgeCls}`}>{status}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Grouped allocation table ── */}
        <p className="mb-1.5 text-[10px] text-muted-foreground">
          Grouped by conviction. Hover over ★, Status, or Delta for target range and rupee actions.
        </p>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[9px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pl-3 pr-1 font-medium">Company</th>
                <th className="px-1 py-1.5 font-medium">Star</th>
                <th className="px-1 py-1.5 text-right font-medium">CMP</th>
                <th className="px-1 py-1.5 text-right font-medium">Inv %</th>
                <th className="px-1 py-1.5 text-right font-medium">Cur %</th>
                <th className="px-1 py-1.5 text-right font-medium">Target</th>
                <th className="px-1 py-1.5 font-medium">Status bar</th>
                <th className="px-1 py-1.5 font-medium">Status</th>
                <th className="px-1 py-1.5 text-right font-medium">Delta</th>
                <th className="py-1.5 pl-1 pr-3 text-right font-medium">MoS%</th>
              </tr>
            </thead>
            {BUCKETS.map((bucket) => (
              <tbody key={bucket.stars}>
                <BucketHeader bucket={bucket} />
                {bucket.rows.map((row, ri) => (
                  <tr
                    key={`${bucket.stars}-${ri}`}
                    className={[
                      "border-b border-border/60 last:border-0",
                      row.status === "OVER" ? "bg-destructive/[0.03]" : "",
                    ].join(" ")}
                  >
                    <td className="py-1.5 pl-3 pr-1">
                      <MaskedName initials={row.initials} nameW={row.nameW} tickerW={row.tickerW} />
                    </td>
                    <td className="px-1 py-1.5"><Stars n={bucket.stars} /></td>
                    <td className="px-1 py-1.5 text-right tabular-nums font-medium text-foreground">{row.cmp}</td>
                    <td className="px-1 py-1.5 text-right tabular-nums text-muted-foreground">{row.invPct}</td>
                    <td className="px-1 py-1.5 text-right tabular-nums text-muted-foreground">{row.curPct}</td>
                    <td className="px-1 py-1.5 text-right tabular-nums text-muted-foreground">{row.targetRange}</td>
                    <td className="px-1 py-1.5"><InvestedBar fill={row.barFill} color={row.barColor} /></td>
                    <td className="px-1 py-1.5"><StatusBadge status={row.status} /></td>
                    <td className="px-1 py-1.5 text-right"><DeltaCell value={row.delta} /></td>
                    <td className="py-1.5 pl-1 pr-3 text-right"><MosCell value={row.mos} /></td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>

        <p className="mt-2.5 text-center text-[9px] text-muted-foreground">
          Numbers are illustrative. Company names and tickers are masked.
        </p>
      </div>
    </div>
  );
}
