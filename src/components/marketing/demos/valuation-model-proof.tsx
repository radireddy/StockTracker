/**
 * ValuationModelProof — a masked replica of the StockTracker Projections &
 * Valuations tab. Shows a multi-year driver grid (Revenue, EBITDA, PAT, EPS)
 * and a bull / base / bare scenario table. Company name and ticker are
 * redacted; all numbers are illustrative.
 */

const YEARS = ["FY23A", "FY24A", "FY25A", "FY26E", "FY27E", "FY28E"];

type MetricRow = {
  label: string;
  values: (string | null)[]; // null = estimated / computed
  unit: string;
};

const METRICS: MetricRow[] = [
  { label: "Revenue (₹ Cr)", unit: "", values: ["3,240", "3,890", "4,620", "5,430", "6,370", "7,430"] },
  { label: "EBITDA (₹ Cr)", unit: "", values: ["487", "604", "740", "896", "1,083", "1,300"] },
  { label: "EBITDA %", unit: "", values: ["15.0%", "15.5%", "16.0%", "16.5%", "17.0%", "17.5%"] },
  { label: "PAT (₹ Cr)", unit: "", values: ["298", "374", "468", "572", "702", "862"] },
  { label: "EPS (₹)", unit: "", values: ["14.2", "17.8", "22.3", "27.2", "33.4", "41.0"] },
  { label: "EPS Growth %", unit: "", values: ["—", "25.3%", "25.3%", "22.0%", "22.7%", "22.7%"] },
];

type Scenario = {
  label: string;
  tone: "bull" | "base" | "bare";
  pe: string;
  targetEps: string;
  targetPrice: string;
  mos: string;
  irr: string;
};

const SCENARIOS: Scenario[] = [
  { label: "Bull", tone: "bull", pe: "35×", targetEps: "₹41.0", targetPrice: "₹4,345", mos: "+35%", irr: "28.4%" },
  { label: "Base", tone: "base", pe: "28×", targetEps: "₹41.0", targetPrice: "₹3,476", mos: "+18%", irr: "18.4%" },
  { label: "Bare", tone: "bare", pe: "20×", targetEps: "₹41.0", targetPrice: "₹2,481", mos: "-13%", irr: "4.1%" },
];

function toneCls(tone: Scenario["tone"]) {
  if (tone === "bull") return "text-primary";
  if (tone === "base") return "text-chart-4";
  return "text-destructive";
}

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
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {["Details", "Thesis", "Projections", "Timeline", "Highlights"].map((t) => (
            <span
              key={t}
              className={[
                "rounded-md px-2.5 py-1 text-[11px] font-medium",
                t === "Projections"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              ].join(" ")}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ValuationModelProof() {
  return (
    <div className="min-w-[820px] bg-background text-sm text-foreground">
      <MaskedCompanyHeader />

      <div className="px-5 py-4 space-y-5">
        {/* Driver grid */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Projections grid · PE / Earnings
            </h3>
            <span className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              Switch to EV/EBITDA
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pl-3 pr-2 font-medium">Metric</th>
                  {YEARS.map((y) => (
                    <th key={y} className={[
                      "px-2 py-2 text-right font-medium",
                      y.endsWith("E") ? "text-primary/70" : "",
                    ].join(" ")}>
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((row) => (
                  <tr key={row.label} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pl-3 pr-2 text-muted-foreground">{row.label}</td>
                    {row.values.map((v, i) => (
                      <td key={i} className={[
                        "px-2 py-1.5 text-right tabular-nums",
                        YEARS[i].endsWith("E") ? "text-foreground/70" : "text-foreground",
                      ].join(" ")}>
                        {v ?? <span className="h-2 w-12 rounded bg-muted-foreground/20 inline-block" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scenario table */}
        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Valuation scenarios (3-year target · FY28E)
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pl-3 pr-2 font-medium">Scenario</th>
                  <th className="px-2 py-2 text-right font-medium">PE Multiple</th>
                  <th className="px-2 py-2 text-right font-medium">Target EPS</th>
                  <th className="px-2 py-2 text-right font-medium">Target Price</th>
                  <th className="px-2 py-2 text-right font-medium">MoS %</th>
                  <th className="py-2 pl-2 pr-3 text-right font-medium">IRR</th>
                </tr>
              </thead>
              <tbody>
                {SCENARIOS.map((s) => (
                  <tr key={s.label} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pl-3 pr-2">
                      <span className={`font-semibold ${toneCls(s.tone)}`}>{s.label}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{s.pe}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{s.targetEps}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold">{s.targetPrice}</td>
                    <td className={`px-2 py-2 text-right tabular-nums font-semibold ${toneCls(s.tone)}`}>
                      {s.mos}
                    </td>
                    <td className={`py-2 pl-2 pr-3 text-right tabular-nums font-semibold ${toneCls(s.tone)}`}>
                      {s.irr}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            CMP ₹2,841.5 · Target buy ₹2,272 · Buy price back-solved from 18% required return on base case
          </p>
        </div>
      </div>
    </div>
  );
}
