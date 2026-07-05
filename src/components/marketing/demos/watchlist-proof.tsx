/**
 * WatchlistProof — a faithful, masked replica of the real StockTracker watchlist
 * screen. Company names, tickers, and avatars are rendered as redaction bars so
 * the layout reads as the genuine product while no real holding/PII appears in
 * the DOM. All numbers are illustrative. Static markup only (no hooks).
 */

type Row = {
  /** Redaction-bar widths (Tailwind classes) for the masked name/ticker. */
  name: string;
  ticker: string;
  stars: number;
  type: "Core" | "Satellite";
  cmp: string;
  target: string;
  mos: string; // e.g. "-42%", "25%", or "–"
  base: string;
  bare: string;
  signal: "WAIT" | "BUY ZONE";
};

const ROWS: Row[] = [
  { name: "w-44", ticker: "w-20", stars: 3, type: "Core", cmp: "582.9", target: "409.68", mos: "-42%", base: "-12.4%", bare: "-29.9%", signal: "WAIT" },
  { name: "w-56", ticker: "w-24", stars: 3, type: "Core", cmp: "1,823.3", target: "1,050", mos: "-74%", base: "-3.8%", bare: "-9.3%", signal: "WAIT" },
  { name: "w-52", ticker: "w-16", stars: 3, type: "Core", cmp: "785.25", target: "770", mos: "-2%", base: "9.0%", bare: "2.5%", signal: "WAIT" },
  { name: "w-56", ticker: "w-24", stars: 3, type: "Core", cmp: "6,796.5", target: "4,150", mos: "-64%", base: "-18.4%", bare: "-32.0%", signal: "WAIT" },
  { name: "w-40", ticker: "w-20", stars: 3, type: "Core", cmp: "388.15", target: "515", mos: "25%", base: "55.8%", bare: "39.3%", signal: "BUY ZONE" },
  { name: "w-36", ticker: "w-16", stars: 2, type: "Satellite", cmp: "204.76", target: "254.9", mos: "20%", base: "55.6%", bare: "3.7%", signal: "BUY ZONE" },
  { name: "w-48", ticker: "w-24", stars: 2, type: "Core", cmp: "974", target: "1,370.54", mos: "29%", base: "36.1%", bare: "28.8%", signal: "BUY ZONE" },
  { name: "w-56", ticker: "w-20", stars: 2, type: "Core", cmp: "153.12", target: "150", mos: "-2%", base: "16.6%", bare: "4.9%", signal: "WAIT" },
  { name: "w-40", ticker: "w-24", stars: 2, type: "Core", cmp: "801.35", target: "–", mos: "–", base: "–", bare: "–", signal: "WAIT" },
  { name: "w-48", ticker: "w-16", stars: 2, type: "Core", cmp: "1,165", target: "600", mos: "-94%", base: "–", bare: "–", signal: "WAIT" },
  { name: "w-52", ticker: "w-24", stars: 2, type: "Core", cmp: "1,116.9", target: "822.18", mos: "-36%", base: "-2.1%", bare: "-12.4%", signal: "WAIT" },
  { name: "w-44", ticker: "w-24", stars: 1, type: "Core", cmp: "471.95", target: "550", mos: "14%", base: "42.8%", bare: "16.6%", signal: "BUY ZONE" },
];

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

function MosCell({ value }: { value: string }) {
  const cls =
    value === "–"
      ? "text-muted-foreground"
      : value.startsWith("-")
        ? "text-destructive"
        : "text-primary";
  return <span className={`font-semibold tabular-nums ${cls}`}>{value}</span>;
}

/** A masked name/ticker block: a redaction bar for the name and a smaller one for the ticker. */
function MaskedName({ name, ticker }: { name: string; ticker: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10"
      >
        <span className="h-2.5 w-4 rounded-[3px] bg-primary/30" />
      </span>
      <span className="flex flex-col gap-1.5">
        <span className={`h-3.5 rounded bg-foreground/15 ${name}`} />
        <span className={`h-2 rounded bg-muted-foreground/25 ${ticker}`} />
      </span>
    </div>
  );
}

export function WatchlistProof() {
  return (
    <div className="min-w-[860px] bg-background p-5 text-sm text-foreground">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight">
            Watchlist 1 <span className="font-medium text-muted-foreground">(12)</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">12 companies tracked</p>
        </div>
        <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          + Add company
        </span>
      </div>

      {/* Portfolio nav */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full border border-border p-0.5 text-xs">
          <span className="rounded-full px-3 py-1 text-muted-foreground">Portfolios</span>
          <span className="rounded-full bg-card px-3 py-1 font-medium text-foreground shadow-sm">
            Watchlists
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/80" />
          Watchlist 1 <span className="opacity-80">12</span>
        </span>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          + New
        </span>
        <span className="px-1 text-xs text-muted-foreground">Manage</span>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="w-56 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
          Search companies…
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
          All Stars <span aria-hidden>▾</span>
        </span>
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-3.5 w-3.5 rounded-[4px] border border-border" />
          Buy signals only
        </span>
        <span className="ml-auto text-xs text-muted-foreground">12 companies</span>
      </div>

      {/* Table */}
      <div className="mt-3 overflow-hidden rounded-xl border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2.5 pl-4 pr-2 font-medium">Company</th>
              <th className="px-2 py-2.5 font-medium">Star ↓</th>
              <th className="px-2 py-2.5 font-medium">Type</th>
              <th className="px-2 py-2.5 text-right font-medium">CMP</th>
              <th className="px-2 py-2.5 text-right font-medium">Target Buy</th>
              <th className="px-2 py-2.5 text-right font-medium">MoS%</th>
              <th className="px-2 py-2.5 text-right font-medium">Base</th>
              <th className="px-2 py-2.5 text-right font-medium">Bare</th>
              <th className="px-2 py-2.5 text-center font-medium">Signal</th>
              <th className="py-2.5 pl-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 pl-4 pr-2">
                  <MaskedName name={r.name} ticker={r.ticker} />
                </td>
                <td className="px-2 py-2.5 text-sm">
                  <Stars n={r.stars} />
                </td>
                <td className="px-2 py-2.5">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {r.type}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.cmp}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                  {r.target}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <MosCell value={r.mos} />
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-foreground/80">
                  {r.base}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-foreground/80">
                  {r.bare}
                </td>
                <td className="px-2 py-2.5 text-center">
                  {r.signal === "BUY ZONE" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                      Buy Zone
                    </span>
                  ) : (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      Wait
                    </span>
                  )}
                </td>
                <td className="py-2.5 pl-2 pr-4">
                  <span className="flex items-center justify-end gap-2 text-muted-foreground/50">
                    <span aria-hidden className="text-xs">▤</span>
                    <span aria-hidden className="text-xs">⋮</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
