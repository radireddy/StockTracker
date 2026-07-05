/**
 * ZerodhaProof — masked replica of the StockTracker holdings dashboard.
 * Company names, tickers, and demat account identifiers are replaced with
 * redaction bars. Three features are called out with numbered annotations:
 *   ① Multiple demat accounts (3 accounts tracked)
 *   ② Consolidated portfolio view across all accounts
 *   ③ Filter by account dropdown
 * All numbers are randomly generated for visualization only.
 */

type Row = {
  initials: string;
  nameW: string;
  tickerW: string;
  stars: number;
  type: "Core" | "Satellite";
  qty: string;
  avgBuy: string;
  cmp: string;
  cost: string;
  curVal: string;
  plPct: string;
  plAmt: string;
  target: string;
  mos: string;
  base: string;
  bare: string;
};

const ROWS: Row[] = [
  { initials: "MF", nameW: "w-44", tickerW: "w-20", stars: 4, type: "Core",      qty: "1,840", avgBuy: "842.30",   cmp: "912.5",  cost: "15,49,832", curVal: "16,79,000", plPct: "+8.3%",  plAmt: "+1,29,168", target: "780",   mos: "-17%", base: "14.2%", bare: "5.8%"  },
  { initials: "RK", nameW: "w-52", tickerW: "w-16", stars: 4, type: "Core",      qty: "650",   avgBuy: "2,134.50", cmp: "2,380.0",cost: "13,87,425", curVal: "15,47,000", plPct: "+11.5%", plAmt: "+1,59,575", target: "2,050", mos: "-16%", base: "12.8%", bare: "7.4%"  },
  { initials: "SL", nameW: "w-56", tickerW: "w-24", stars: 4, type: "Satellite", qty: "5,200", avgBuy: "312.40",   cmp: "298.7",  cost: "16,24,480", curVal: "15,53,240", plPct: "-4.4%",  plAmt: "-71,240",   target: "345",   mos: "13%",  base: "22.1%", bare: "14.9%" },
  { initials: "PG", nameW: "w-48", tickerW: "w-20", stars: 3, type: "Core",      qty: "2,100", avgBuy: "1,045.60", cmp: "1,124.8",cost: "21,95,760", curVal: "23,61,080", plPct: "+7.5%",  plAmt: "+1,65,320", target: "980",   mos: "-15%", base: "9.4%",  bare: "3.2%"  },
  { initials: "DT", nameW: "w-40", tickerW: "w-24", stars: 3, type: "Core",      qty: "8,400", avgBuy: "134.20",   cmp: "142.5",  cost: "11,27,280", curVal: "11,97,000", plPct: "+6.2%",  plAmt: "+69,720",   target: "155",   mos: "8%",   base: "18.3%", bare: "9.7%"  },
  { initials: "BR", nameW: "w-52", tickerW: "w-16", stars: 3, type: "Core",      qty: "3,200", avgBuy: "487.35",   cmp: "461.2",  cost: "15,59,520", curVal: "14,75,840", plPct: "-5.4%",  plAmt: "-83,680",   target: "520",   mos: "11%",  base: "16.5%", bare: "8.1%"  },
  { initials: "KV", nameW: "w-36", tickerW: "w-20", stars: 2, type: "Satellite", qty: "420",   avgBuy: "3,210.80", cmp: "3,486.5",cost: "13,48,536", curVal: "14,64,330", plPct: "+8.6%",  plAmt: "+1,15,794", target: "2,900", mos: "-20%", base: "6.8%",  bare: "-1.3%" },
  { initials: "WT", nameW: "w-44", tickerW: "w-24", stars: 2, type: "Core",      qty: "1,760", avgBuy: "726.90",   cmp: "684.3",  cost: "12,79,344", curVal: "12,04,368", plPct: "-5.9%",  plAmt: "-74,976",   target: "790",   mos: "13%",  base: "11.2%", bare: "4.6%"  },
];

const ACCOUNTS = ["Account A · Zerodha", "Account B · Zerodha", "Account C · Zerodha"];

function Callout({ n, label }: { n: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">
      {n} {label}
    </span>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="tracking-tight" aria-label={`${n} star conviction`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={i < n ? "text-chart-4" : "text-muted-foreground/25"}>★</span>
      ))}
    </span>
  );
}

function MaskedName({ initials, nameW, tickerW }: { initials: string; nameW: string; tickerW: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground"
      >
        {initials}
      </span>
      <span className="flex flex-col gap-1.5">
        <span className={`h-3 rounded bg-foreground/15 ${nameW}`} />
        <span className={`h-2 rounded bg-muted-foreground/20 ${tickerW}`} />
      </span>
    </div>
  );
}

function PlCell({ value }: { value: string }) {
  const cls = value.startsWith("+")
    ? "text-primary font-semibold"
    : value.startsWith("-")
      ? "text-destructive font-semibold"
      : "text-muted-foreground";
  return <span className={`tabular-nums ${cls}`}>{value}</span>;
}

function MosCell({ value }: { value: string }) {
  const cls = value.startsWith("-") ? "text-destructive font-semibold" : "text-primary font-semibold";
  return <span className={`tabular-nums ${cls}`}>{value}</span>;
}

export function ZerodhaProof() {
  return (
    <div className="min-w-[1180px] bg-background p-5 text-sm text-foreground">

      {/* ── Portfolio nav ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full border border-border p-0.5 text-xs">
          <span className="rounded-full px-3 py-1 text-muted-foreground">Portfolios</span>
          <span className="rounded-full bg-card px-3 py-1 font-medium shadow-sm text-foreground">Watchlists</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/80" />
          Portfolio A <span className="opacity-80">23</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
          Portfolio B <span className="opacity-60">0</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
          Portfolio C <span className="opacity-60">0</span>
        </span>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">+ New</span>
        <span className="px-1 text-xs text-muted-foreground">Manage</span>
      </div>

      {/* ── Summary cards ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">

        {/* Left — consolidated value (highlight ②) */}
        <div className="relative rounded-xl border border-primary/40 bg-card p-5 ring-2 ring-primary/30 ring-offset-2 ring-offset-background">
          <span className="absolute -top-3.5 right-4 z-10">
            <Callout n="②" label="Consolidated view" />
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Current Value
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">₹3,12,45,680</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              ▲ +₹48,32,190 · +18.3%
            </span>
            <span className="text-xs text-muted-foreground">all-time P&amp;L</span>
          </div>
          <div className="mt-4 flex gap-6 border-t border-border pt-4">
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">₹2,64,13,490</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Invested</p>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">23</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Companies</p>
            </div>
            {/* Accounts stat (highlight ①) */}
            <div className="relative rounded-lg border border-primary/40 px-3 py-1 ring-2 ring-primary/30 ring-offset-1 ring-offset-background">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                <Callout n="①" label="Multi-account" />
              </span>
              <p className="mt-2 text-lg font-bold text-foreground">3</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Accounts</p>
            </div>
          </div>
        </div>

        {/* Right — allocation health */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-foreground">Allocation health</p>
            <p className="text-[10px] text-muted-foreground">current value vs. target by conviction</p>
          </div>
          <div className="mt-4 space-y-3">
            {[
              { stars: 4, pct: 18, max: 25, label: "20.2%", status: "UNDER", barCls: "bg-chart-4/70" },
              { stars: 3, pct: 52, max: 65, label: "52.4%", status: "UNDER", barCls: "bg-chart-4/70" },
              { stars: 2, pct: 19, max: 22, label: "19.1%", status: "IN RANGE", barCls: "bg-primary/70" },
              { stars: 1, pct: 9,  max: 10, label: "8.3%",  status: "OVER",     barCls: "bg-destructive/70" },
            ].map(({ stars, pct, max, label, status, barCls }) => (
              <div key={stars} className="flex items-center gap-3">
                <span className="w-14 shrink-0 tracking-tight text-chart-4 text-xs">
                  {Array.from({ length: 4 }, (_, i) => (
                    <span key={i} className={i < stars ? "text-chart-4" : "text-muted-foreground/25"}>★</span>
                  ))}
                </span>
                <div className="relative flex-1 overflow-hidden rounded-full bg-muted/40 h-3.5">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full ${barCls}`}
                    style={{ width: `${(pct / max) * 100}%` }}
                  />
                  <div
                    className="absolute top-0 h-full w-px bg-muted-foreground/40"
                    style={{ left: `${(pct / max) * 90}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-foreground">{label}</span>
                <span className={[
                  "w-16 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[9px] font-semibold",
                  status === "IN RANGE" ? "bg-primary/10 text-primary" :
                  status === "OVER"     ? "bg-destructive/10 text-destructive" :
                                          "bg-chart-4/10 text-chart-4",
                ].join(" ")}>
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="relative mt-4">
        <div className="flex flex-wrap items-start gap-3">
          {/* View toggle */}
          <span className="inline-flex rounded-lg border border-border p-0.5 text-xs">
            <span className="rounded-md bg-card px-3 py-1.5 font-medium text-foreground shadow-sm">Portfolio</span>
            <span className="px-3 py-1.5 text-muted-foreground">Allocation</span>
          </span>

          {/* Search */}
          <span className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground w-52">
            Search companies…
          </span>

          {/* Account dropdown — shown open (highlight ③) */}
          <div className="relative">
            <span className="absolute -top-3.5 left-0 z-20">
              <Callout n="③" label="Filter by account" />
            </span>
            <div className="mt-1 rounded-lg border border-primary/50 bg-card shadow-lg ring-2 ring-primary/30 z-10">
              <div className="flex items-center justify-between gap-6 border-b border-border px-3 py-1.5 text-xs font-medium text-foreground">
                All accounts
                <span className="text-primary">✓</span>
              </div>
              {ACCOUNTS.map((a) => (
                <div key={a} className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40">
                  {a}
                </div>
              ))}
            </div>
          </div>

          {/* Other filters */}
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
            All Stars <span aria-hidden>▾</span>
          </span>
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
            All <span aria-hidden>▾</span>
          </span>
          <span className="mt-1 ml-auto text-xs text-muted-foreground self-center">23 companies</span>
        </div>
      </div>

      {/* ── Company table ── */}
      <div className="mt-10 overflow-hidden rounded-xl border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2.5 pl-4 pr-2 font-medium">Company</th>
              <th className="px-2 py-2.5 font-medium">Stars</th>
              <th className="px-2 py-2.5 font-medium">Type</th>
              <th className="px-2 py-2.5 text-right font-medium">Qty</th>
              <th className="px-2 py-2.5 text-right font-medium">Avg Buy</th>
              <th className="px-2 py-2.5 text-right font-medium">CMP</th>
              <th className="px-2 py-2.5 text-right font-medium">Cost</th>
              <th className="px-2 py-2.5 text-right font-medium">Cur. Value</th>
              <th className="px-2 py-2.5 text-right font-medium">P&amp;L %</th>
              <th className="px-2 py-2.5 text-right font-medium">P&amp;L ₹</th>
              <th className="px-2 py-2.5 text-right font-medium">Target</th>
              <th className="px-2 py-2.5 text-right font-medium">MoS%</th>
              <th className="px-2 py-2.5 text-right font-medium">Base</th>
              <th className="py-2.5 pl-2 pr-4 text-right font-medium">Bare</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 pl-4 pr-2">
                  <MaskedName initials={r.initials} nameW={r.nameW} tickerW={r.tickerW} />
                </td>
                <td className="px-2 py-2.5 text-sm"><Stars n={r.stars} /></td>
                <td className="px-2 py-2.5">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {r.type}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{r.qty}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{r.avgBuy}</td>
                <td className="px-2 py-2.5 text-right tabular-nums font-medium text-foreground">{r.cmp}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{r.cost}</td>
                <td className="px-2 py-2.5 text-right tabular-nums font-medium text-foreground">{r.curVal}</td>
                <td className="px-2 py-2.5 text-right"><PlCell value={r.plPct} /></td>
                <td className="px-2 py-2.5 text-right"><PlCell value={r.plAmt} /></td>
                <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{r.target}</td>
                <td className="px-2 py-2.5 text-right"><MosCell value={r.mos} /></td>
                <td className="px-2 py-2.5 text-right tabular-nums text-foreground/80">{r.base}</td>
                <td className="py-2.5 pl-2 pr-4 text-right tabular-nums text-foreground/80">{r.bare}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Disclosure ── */}
      <p className="mt-4 text-center text-[10px] text-muted-foreground">
        Numbers are randomly generated and only for visualization. Company names and account identifiers are masked.
      </p>
    </div>
  );
}
