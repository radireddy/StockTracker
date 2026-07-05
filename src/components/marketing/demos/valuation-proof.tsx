/**
 * ValuationProof — masked replica of the StockTracker Projections & Valuations
 * tab. Shows the full P&L model grid (Image 3) stacked above the Valuation
 * Scenarios table (Image 4). Three features are called out:
 *   ① Forward estimates (PAT) feed into the bull/base/bare scenario targets
 *   ② Expected return input back-solves Buying Market Cap + target buy price
 *   ③ Current Market Cap is live — every derived number updates with the price
 * All numbers are randomly generated for visualization only.
 */

const YEARS = ["Mar 2024", "Mar 2025", "Mar 2026E", "Mar 2027E", "Mar 2028E"];
const EST_FROM = 2; // columns ≥ this index are estimates (blue)

type GridRow =
  | { kind: "divider"; label: string; values: string[] }
  | { kind: "sub"; label: string; values: string[]; input?: boolean }
  | { kind: "input-only"; label: string; values: string[] }
  | { kind: "blank-cells"; label: string };

const GRID: GridRow[] = [
  { kind: "divider",    label: "Revenue",            values: ["840",    "945",    "1,102",   "1,296",   "1,530"  ] },
  { kind: "sub",        label: "Revenue Growth %",    values: ["—",      "+12.5%", "+16.6%",  "+17.6%",  "+18.1%" ] },
  { kind: "sub",        label: "EBITDA Margin %",     values: ["38.0 %", "36.2 %", "38.0 %",  "40.0 %",  "42.0 %" ], input: true },
  { kind: "divider",    label: "EBITDA",              values: ["319.2",  "342.0",  "418.76",  "518.40",  "642.60" ] },
  { kind: "sub",        label: "EBITDA Growth %",     values: ["—",      "+7.1%",  "+22.4%",  "+23.8%",  "+24.0%" ] },
  { kind: "sub",        label: "Depreciation",        values: ["38",     "45",     "48",      "52",      "55"     ] },
  { kind: "sub",        label: "Interest",            values: ["2",      "1",      "0",       "0",       "0"      ] },
  { kind: "sub",        label: "Other Income",        values: ["28",     "35",     "38",      "40",      "42"     ] },
  { kind: "blank-cells",label: "Exceptional Items" },
  { kind: "divider",    label: "Profit before tax",  values: ["307.2",  "331.0",  "408.76",  "506.40",  "629.60" ] },
  { kind: "sub",        label: "Tax %",              values: ["25 %",   "25 %",   "25 %",    "25 %",    "25 %"   ], input: true },
  { kind: "divider",    label: "PAT",                values: ["230.4",  "248.25", "306.57",  "379.80",  "472.20" ] },
  { kind: "sub",        label: "PAT Growth %",       values: ["—",      "+7.7%",  "+23.5%",  "+23.9%",  "+24.3%" ] },
  { kind: "sub",        label: "PAT Margin %",       values: ["27.4%",  "26.3%",  "27.8%",   "29.3%",   "30.9%"  ] },
  { kind: "sub",        label: "Forward PE",         values: ["42.1",   "39.5",   "31.8",    "25.6",    "20.6"   ] },
  { kind: "sub",        label: "Forward PEG",        values: ["—",      "—",      "1.35",    "1.07",    "0.85"   ] },
];

const SCENARIOS = [
  { label: "Bull", tone: "bull" as const, pe: "42", targetMC: "₹19,832", irr: "19.4%", buyMC: "₹11,497", buyPrice: "1,022" },
  { label: "Base", tone: "base" as const, pe: "36", targetMC: "₹17,000", irr: "15.6%", buyMC: "₹9,854",  buyPrice: "876"   },
  { label: "Bare", tone: "bare" as const, pe: "30", targetMC: "₹14,166", irr: "10.4%", buyMC: "₹8,209",  buyPrice: "730"   },
];

function toneCls(t: "bull" | "base" | "bare") {
  return t === "bull" ? "text-primary" : t === "base" ? "text-chart-4" : "text-destructive";
}

function Callout({ n, label }: { n: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">
      {n} {label}
    </span>
  );
}

function YearTh({ year, i }: { year: string; i: number }) {
  const est = i >= EST_FROM;
  return (
    <th className={[
      "px-3 py-2.5 text-right text-[11px] font-semibold",
      est ? "text-primary" : "text-foreground",
    ].join(" ")}>
      {year}
    </th>
  );
}

function ValueCell({ val, colIdx, divider, special }: { val: string; colIdx: number; divider?: boolean; special?: boolean }) {
  const est = colIdx >= EST_FROM;
  const cls = [
    "px-3 py-2 text-right tabular-nums text-[12px]",
    divider
      ? est
        ? "font-bold text-primary"
        : "font-bold text-foreground"
      : special
        ? val.startsWith("-") ? "text-destructive" : ""
        : est
          ? "text-primary/80"
          : "text-muted-foreground",
  ].join(" ");
  return <td className={cls}>{val}</td>;
}

function InputCell({ val, colIdx }: { val: string; colIdx: number }) {
  return (
    <td className="px-3 py-2 text-right">
      <span className={[
        "inline-flex items-center justify-end rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px] tabular-nums",
        colIdx >= EST_FROM ? "text-primary/90" : "text-foreground/80",
      ].join(" ")}>
        {val}
      </span>
    </td>
  );
}

function BlankCell() {
  return (
    <td className="px-3 py-2">
      <span className="block h-5 rounded border border-border bg-background" />
    </td>
  );
}

export function ValuationProof() {
  return (
    <div className="min-w-[960px] bg-background text-sm text-foreground">

      {/* ── Section header ── */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="text-base font-bold text-foreground">Projections &amp; Valuations</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">+ Add Model</span>
          <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Save All</span>
        </div>
      </div>

      <div className="px-5 py-5 space-y-6">

        {/* ── Model tab ── */}
        <div className="rounded-xl border border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <span className="text-[11px] text-muted-foreground">▾</span>
            <span className="text-[13px] font-semibold text-foreground">PE / Earnings</span>
            <span className="rounded-md bg-chart-4/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-chart-4">
              Default
            </span>
          </div>

          {/* P&L Grid */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-bold text-foreground">Profit &amp; Loss</p>
                <p className="text-[11px] text-muted-foreground">Figures in Rs. Crores</p>
              </div>
              <span className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                + Add Year
              </span>
            </div>

            <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="py-2.5 pl-4 pr-3 text-left text-[11px] font-medium text-muted-foreground w-44" />
                    {YEARS.map((y, i) => <YearTh key={y} year={y} i={i} />)}
                  </tr>
                </thead>
                <tbody>
                  {GRID.map((row, ri) => {
                    if (row.kind === "blank-cells") {
                      return (
                        <tr key={ri} className="border-b border-border/40">
                          <td className="py-2 pl-4 pr-3 text-[12px] text-muted-foreground">{row.label}</td>
                          {YEARS.map((_, ci) => <BlankCell key={ci} />)}
                        </tr>
                      );
                    }

                    const isDivider = row.kind === "divider";
                    const isPAT = row.label === "PAT";

                    return (
                      <tr
                        key={ri}
                        className={[
                          "border-b border-border/40 last:border-0",
                          isDivider ? "bg-primary/[0.03]" : "",
                        ].join(" ")}
                      >
                        <td className={[
                          "py-2 pl-4 pr-3",
                          isDivider
                            ? "font-bold text-foreground"
                            : "pl-6 text-muted-foreground",
                        ].join(" ")}>
                          <div className="flex items-center justify-between gap-2">
                            {row.label}
                            {isPAT && (
                              <span className="-mr-1">
                                <Callout n="①" label="Feeds scenarios →" />
                              </span>
                            )}
                          </div>
                        </td>
                        {row.values.map((v, ci) =>
                          ("input" in row && row.input) ? (
                            <InputCell key={ci} val={v} colIdx={ci} />
                          ) : (
                            <ValueCell
                              key={ci}
                              val={v}
                              colIdx={ci}
                              divider={isDivider}
                              special={row.label === "Forward PEG"}
                            />
                          )
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-1.5 flex gap-4 text-[10px]">
              <span className="text-muted-foreground">Click any auto-calculated cell to override</span>
              <span className="font-medium text-violet-500">Purple = manually overridden</span>
              <span className="font-medium text-primary">Blue columns = estimates</span>
            </div>
          </div>
        </div>

        {/* ── Valuation Scenarios ── */}
        <div className="rounded-xl border border-border">
          <div className="border-b border-border px-4 py-3">
            <p className="text-[13px] font-bold text-foreground">Valuation Scenarios</p>
          </div>
          <div className="px-4 py-3">
            {/* Scenario inputs row */}
            <div className="flex flex-wrap items-end gap-6">
              {/* Current Market Cap — highlight ③ */}
              <div className="relative rounded-lg border border-primary/40 px-3 py-2 ring-2 ring-primary/25 ring-offset-1 ring-offset-background">
                <span className="absolute -top-3.5 left-0">
                  <Callout n="③" label="Live — updates with price" />
                </span>
                <p className="mt-1 text-[10px] text-muted-foreground">Current Market Cap</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">₹9,690 Cr</p>
              </div>

              {/* Expected Returns — highlight ② */}
              <div className="relative rounded-lg border border-primary/40 px-3 py-2 ring-2 ring-primary/25 ring-offset-1 ring-offset-background">
                <span className="absolute -top-3.5 left-0">
                  <Callout n="②" label="Sets target buy price" />
                </span>
                <p className="mt-1 text-[10px] text-muted-foreground">Expected Returns (%)</p>
                <span className="mt-0.5 block rounded border border-primary/50 bg-primary/5 px-2 py-1 text-sm font-bold tabular-nums text-foreground w-24 text-center">
                  20
                </span>
              </div>

              {/* Terminal PAT — highlight ① */}
              <div className="relative rounded-lg border border-primary/40 px-3 py-2 ring-2 ring-primary/25 ring-offset-1 ring-offset-background">
                <span className="absolute -top-3.5 left-0">
                  <Callout n="①" label="From forward estimate" />
                </span>
                <p className="mt-1 text-[10px] text-muted-foreground">Terminal PAT</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">₹472.2 Cr</p>
              </div>

              <div className="px-2 py-2">
                <p className="text-[10px] text-muted-foreground">Horizon</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">3 years</p>
              </div>
            </div>

            {/* Scenarios table */}
            <div className="mt-5 overflow-hidden rounded-lg border border-border">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[11px] font-semibold">
                    <th className="py-2.5 pl-4 pr-3 text-left text-muted-foreground w-16" />
                    <th className="px-3 py-2.5 text-right text-chart-4">Target PE</th>
                    <th className="px-3 py-2.5 text-right text-chart-4">Target Market Cap</th>
                    <th className="px-3 py-2.5 text-right text-chart-4">IRR %</th>
                    <th className="px-3 py-2.5 text-right text-chart-4">Buying Market Cap</th>
                    {/* Buy Price column — highlight ② */}
                    <th className="relative py-2.5 pl-3 pr-4 text-right">
                      <span className="text-chart-4">Buy Price</span>
                      <span className="absolute -top-3 right-3">
                        <Callout n="②" label="Base = your target" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SCENARIOS.map((s) => (
                    <tr
                      key={s.label}
                      className={[
                        "border-b border-border/50 last:border-0",
                        s.tone === "base" ? "bg-primary/[0.02]" : "",
                      ].join(" ")}
                    >
                      <td className="py-2.5 pl-4 pr-3">
                        <span className={`font-semibold ${toneCls(s.tone)}`}>{s.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{s.pe}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{s.targetMC}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{s.irr}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{s.buyMC}</td>
                      <td className={[
                        "py-2.5 pl-3 pr-4 text-right tabular-nums font-bold",
                        s.tone === "base" ? "text-primary" : "text-foreground",
                      ].join(" ")}>
                        {s.tone === "base" ? (
                          <span className="inline-flex items-center gap-1.5">
                            {s.buyPrice}
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-semibold text-primary">
                              TARGET BUY
                            </span>
                          </span>
                        ) : s.buyPrice}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer stats */}
            <div className="mt-3 flex flex-wrap items-center gap-6 rounded-lg border border-border bg-muted/20 px-4 py-2.5">
              {[
                { label: "Trailing PE",        value: "39.2",  tone: "" },
                { label: "Earnings CAGR (3Y)", value: "18.4%", tone: "" },
                { label: "Forward PEG Ratio",  value: "1.62",  tone: "text-chart-4" },
              ].map(({ label, value, tone }) => (
                <div key={label} className="flex items-baseline gap-2">
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                  <span className={`text-sm font-bold tabular-nums ${tone || "text-foreground"}`}>{value}</span>
                </div>
              ))}
              <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
                Fairly valued
              </span>
            </div>
          </div>
        </div>

        {/* ── Disclosure ── */}
        <p className="text-center text-[10px] text-muted-foreground">
          Numbers are randomly generated and only for visualization.
        </p>
      </div>
    </div>
  );
}
