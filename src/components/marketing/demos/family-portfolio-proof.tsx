/**
 * FamilyPortfolioProof — masked composite of two StockTracker screens:
 *   ① Import Holdings — two statements queued (Self + Spouse demat accounts),
 *      review cards showing per-account stock counts and replace behaviour.
 *   ② Portfolio dashboard — "All accounts" filter open, consolidated holdings
 *      table across 3 masked demat accounts (Self, Spouse, HUF).
 * Company names, tickers, and demat account identifiers are redacted.
 * Numbers are illustrative.
 */

type HoldingRow = {
  initials: string;
  nameW: string;
  tickerW: string;
  stars: number;
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

const ROWS: HoldingRow[] = [
  { initials: "NH", nameW: "w-44", tickerW: "w-14", stars: 4, qty: "1,460", avgBuy: "1,786.98", cmp: "1,996.9",  cost: "26,08,990", curVal: "29,15,474", plPct: "+11.7%", plAmt: "+3,06,484",  target: "1,775", mos: "-13%", base: "17.5%", bare: "1.7%"  },
  { initials: "OC", nameW: "w-52", tickerW: "w-16", stars: 4, qty: "2,780", avgBuy: "1,074.69", cmp: "1,208.5",  cost: "29,87,641", curVal: "33,59,630", plPct: "+12.5%", plAmt: "+3,71,989",  target: "1,370", mos: "12%",  base: "17.4%", bare: "11.3%" },
  { initials: "SH", nameW: "w-40", tickerW: "w-20", stars: 4, qty: "11,150",avgBuy: "188.41",   cmp: "176.71",   cost: "21,00,729", curVal: "19,70,317", plPct: "-6.2%",  plAmt: "-1,30,413", target: "135.9", mos: "-30%", base: "21.7%", bare: "15.5%" },
  { initials: "AP", nameW: "w-48", tickerW: "w-24", stars: 3, qty: "3,985", avgBuy: "733.89",   cmp: "710.6",    cost: "29,24,546", curVal: "28,31,741", plPct: "-3.2%",  plAmt: "-92,805",   target: "800",   mos: "11%",  base: "19.2%", bare: "8.8%"  },
  { initials: "CB", nameW: "w-36", tickerW: "w-16", stars: 3, qty: "4,000", avgBuy: "353.72",   cmp: "348.1",    cost: "14,14,894", curVal: "13,92,400", plPct: "-1.6%",  plAmt: "-22,494",   target: "510",   mos: "32%",  base: "42.0%", bare: "27.0%" },
  { initials: "TT", nameW: "w-44", tickerW: "w-24", stars: 3, qty: "8,020", avgBuy: "173.77",   cmp: "180.11",   cost: "13,93,639", curVal: "14,44,482", plPct: "+3.6%",  plAmt: "+50,844",   target: "199.67",mos: "10%",  base: "41.1%", bare: "26.2%" },
  { initials: "GI", nameW: "w-40", tickerW: "w-16", stars: 3, qty: "1,150", avgBuy: "1,392.87", cmp: "1,740.0",  cost: "16,01,801", curVal: "20,01,000", plPct: "+24.9%", plAmt: "+3,99,199", target: "1,520", mos: "-14%", base: "19.0%", bare: "6.4%"  },
  { initials: "HZ", nameW: "w-52", tickerW: "w-20", stars: 3, qty: "4,130", avgBuy: "574.24",   cmp: "538.85",   cost: "23,71,616", curVal: "22,25,451", plPct: "-6.2%",  plAmt: "-1,46,166", target: "610",   mos: "12%",  base: "31.2%", bare: "14.8%" },
];

function Stars({ n }: { n: number }) {
  return (
    <span className="tracking-tight text-sm" aria-label={`${n} star conviction`}>
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
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground"
      >
        {initials}
      </span>
      <span className="flex flex-col gap-1.5">
        <span className={`h-2.5 rounded bg-foreground/15 ${nameW}`} />
        <span className={`h-2 rounded bg-muted-foreground/20 ${tickerW}`} />
      </span>
    </div>
  );
}

function PlCell({ value }: { value: string }) {
  const positive = value.startsWith("+");
  const negative = value.startsWith("-");
  return (
    <span className={`tabular-nums font-semibold ${positive ? "text-primary" : negative ? "text-destructive" : "text-muted-foreground"}`}>
      {value}
    </span>
  );
}

function MosCell({ value }: { value: string }) {
  return (
    <span className={`tabular-nums font-semibold ${value.startsWith("-") ? "text-destructive" : "text-primary"}`}>
      {value}
    </span>
  );
}

export function FamilyPortfolioProof() {
  return (
    <div className="min-w-[1100px] space-y-6 bg-background p-5 text-sm text-foreground">

      {/* ── ① Import Holdings screen ── */}
      <div className="rounded-xl border border-border bg-card p-5">

        {/* Page heading */}
        <div className="mb-5 border-b border-border pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Data</p>
          <p className="mt-0.5 text-lg font-bold text-foreground">Import Holdings</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Import a Zerodha holdings statement. Each statement is a snapshot for one account;
            re-importing an account replaces its existing holdings.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left — upload area */}
          <div className="space-y-4">
            {/* Portfolio selector */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Portfolio <span className="text-destructive">*</span>
              </label>
              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                Holdings (default)
                <span aria-hidden className="text-muted-foreground/60">▾</span>
              </div>
            </div>

            {/* File dropzone — two files queued */}
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Zerodha Holdings Statement <span className="text-destructive">*</span>
              </label>
              <p className="mb-2 text-[10px] text-muted-foreground">
                Zerodha Console → Reports → Holdings → Download as Excel. The account is detected
                automatically from the statement. You can select multiple files (e.g. one per account).
              </p>
              <div className="rounded-lg border-2 border-dashed border-border/60 bg-muted/20 p-3 space-y-2">
                {[
                  { name: "holdings-SELF (18).xlsx",   size: "22.2 KB" },
                  { name: "holdings-SPOUSE (23).xlsx", size: "23.3 KB" },
                ].map((f) => (
                  <div key={f.name} className="flex items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2">
                    <span className="text-muted-foreground text-base">📄</span>
                    <div>
                      <p className="text-xs font-medium text-foreground">{f.name}</p>
                      <p className="text-[10px] text-muted-foreground">{f.size}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — review cards */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Review how each statement will be imported into <strong>Holdings</strong>.
            </p>
            {[
              { file: "holdings-SELF (18).xlsx",   count: "18 stocks",  id: "SELF",   account: "Self (Zerodha)"   },
              { file: "holdings-SPOUSE (23).xlsx", count: "24 stocks",  id: "SPOUSE", account: "Spouse (Zerodha)" },
            ].map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">📄</span>
                    <span className="font-medium text-foreground">{r.file}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{r.count} · {r.id}</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span aria-hidden className="text-primary">↺</span>
                  Will replace holdings in{" "}
                  <span className="font-semibold text-foreground">{r.account}</span>
                </div>
              </div>
            ))}

            {/* How import works */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-[10px] text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground/80">How import works:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>The account is auto-detected from the statement's Client ID.</li>
                <li>Re-importing an account's statement replaces its holdings.</li>
                <li>Consolidated view sums positions across all accounts; filter by account on the dashboard.</li>
                <li>New stocks are added to your portfolio automatically.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── ② Dashboard — consolidated + account filter open ── */}
      <div className="rounded-xl border border-border bg-card p-5">

        {/* Filter bar with account dropdown open */}
        <div className="mb-4 flex flex-wrap items-start gap-3">
          {/* View toggle */}
          <span className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
            <span className="rounded-md bg-card px-3 py-1.5 font-medium text-foreground shadow-sm">Portfolio</span>
            <span className="px-3 py-1.5 text-muted-foreground">Allocation</span>
          </span>

          {/* Search */}
          <span className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground w-44">
            Search companies…
          </span>

          {/* Account dropdown — shown open */}
          <div className="relative">
            <div className="absolute left-0 top-full z-20 mt-0.5 w-52 rounded-lg border border-border bg-card shadow-lg ring-1 ring-primary/20">
              <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs font-medium text-foreground">
                All accounts
                <span className="text-primary text-xs">✓</span>
              </div>
              {["Self · Zerodha", "Spouse · Zerodha", "HUF · Zerodha"].map((a) => (
                <div key={a} className="px-3 py-1.5 text-xs text-muted-foreground">
                  {a}
                </div>
              ))}
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-background px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-primary/20">
              All accounts <span aria-hidden>▾</span>
            </button>
          </div>

          {/* Other filters */}
          <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
            All Stars <span aria-hidden>▾</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
            All <span aria-hidden>▾</span>
          </span>
          <span className="ml-auto text-xs text-muted-foreground self-center">27 companies</span>
        </div>

        {/* Holdings table */}
        <div className="mt-10 overflow-hidden rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2.5 pl-4 pr-2 font-medium">Company</th>
                <th className="px-2 py-2.5 font-medium">Stars</th>
                <th className="px-2 py-2.5 text-right font-medium">Qty</th>
                <th className="px-2 py-2.5 text-right font-medium">Avg Buy</th>
                <th className="px-2 py-2.5 text-right font-medium">CMP</th>
                <th className="px-2 py-2.5 text-right font-medium">Cost</th>
                <th className="px-2 py-2.5 text-right font-medium">Cur. Value</th>
                <th className="px-2 py-2.5 text-right font-medium">P&amp;L %</th>
                <th className="px-2 py-2.5 text-right font-medium">P&amp;L ₹</th>
                <th className="px-2 py-2.5 text-right font-medium">Target Buy</th>
                <th className="px-2 py-2.5 text-right font-medium">MoS%</th>
                <th className="px-2 py-2.5 text-right font-medium">Base</th>
                <th className="py-2.5 pl-2 pr-4 text-right font-medium">Bare</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                  <td className="py-2.5 pl-4 pr-2">
                    <MaskedName initials={r.initials} nameW={r.nameW} tickerW={r.tickerW} />
                  </td>
                  <td className="px-2 py-2.5"><Stars n={r.stars} /></td>
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

        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Numbers are randomly generated for visualization only. Company names and account identifiers are masked.
        </p>
      </div>
    </div>
  );
}
