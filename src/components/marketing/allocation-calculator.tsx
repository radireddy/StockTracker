"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GoogleCta } from "@/components/marketing/google-cta";
import { fmtAmountShort } from "@/lib/utils/calculations";
import {
  calculate,
  type Star,
  type StarInput,
  type BucketResult,
  type CalculatorResult,
} from "@/lib/utils/allocation-calculator";

const STARS = [4, 3, 2, 1] as const;

const STAR_LABELS: Record<Star, string> = {
  4: "★★★★",
  3: "★★★",
  2: "★★",
  1: "★",
};

type RangeState = { min: string; max: string };

const DEFAULT_RANGES: Record<Star, RangeState> = {
  4: { min: "6", max: "8" },
  3: { min: "4", max: "6" },
  2: { min: "2", max: "4" },
  1: { min: "0", max: "2" },
};

function parsePct(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function fmt(val: number): string {
  return fmtAmountShort(val);
}

function fmtRange(min: number, max: number, isAbsolute: boolean): string {
  if (isAbsolute) return fmt(min);
  return `${fmt(min)} – ${fmt(max)}`;
}

function fmtPctRange(min: number, max: number, total: number): string {
  const lo = Math.round((min / total) * 100);
  const hi = Math.round((max / total) * 100);
  if (lo === hi) return `${lo}%`;
  return `${lo}% – ${hi}%`;
}

export function AllocationCalculator() {
  const [amount, setAmount] = useState("");
  const [counts, setCounts] = useState<Record<Star, string>>({ 4: "", 3: "", 2: "", 1: "" });
  const [ranges, setRanges] = useState<Record<Star, RangeState>>(DEFAULT_RANGES);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setIsLoggedIn(!!data.session));
  }, []);

  const totalAmount = parseFloat(amount) || 0;
  const canCalculate = totalAmount > 0;

  function invalidateResult() {
    setResult(null);
  }

  function handleCalculate() {
    if (!canCalculate) return;
    const inputs: StarInput[] = STARS.map((star) => ({
      star,
      count: parseInt(counts[star] || "0", 10) || 0,
      range: {
        min: parsePct(ranges[star].min),
        max: parsePct(ranges[star].max),
      },
    }));
    setResult(calculate(totalAmount, inputs));
  }

  const invalidRanges = new Set<Star>(
    STARS.filter((s) => parsePct(ranges[s].min) > parsePct(ranges[s].max))
  );

  return (
    <div className="space-y-6">
      {/* ── Calculator card ── */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
        {/* Total amount */}
        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="total-amount"
          >
            Total investment amount
          </label>
          <Input
            id="total-amount"
            type="number"
            min={0}
            step={100000}
            placeholder="e.g. 5000000"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              invalidateResult();
            }}
            className="text-base max-w-xs"
          />
          {amount !== "" && totalAmount <= 0 && (
            <p className="text-xs text-destructive mt-1">Enter a positive amount to calculate.</p>
          )}
        </div>

        {/* Stock counts */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            How many stocks per rating?
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STARS.map((star) => (
              <div key={star} className="space-y-1.5">
                <label
                  htmlFor={`count-${star}`}
                  className="block text-xs font-medium text-chart-4"
                  aria-label={`${star} star stock count`}
                >
                  {STAR_LABELS[star]}
                </label>
                <Input
                  id={`count-${star}`}
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                  value={counts[star]}
                  onChange={(e) => {
                    setCounts((p) => ({ ...p, [star]: e.target.value }));
                    invalidateResult();
                  }}
                  className="text-center"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Advanced: allocation ranges */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={advancedOpen}
          >
            <span aria-hidden>{advancedOpen ? "▾" : "▸"}</span>
            Adjust allocation ranges
          </button>

          {advancedOpen && (
            <div className="space-y-3 pt-1 pl-4 border-l border-border">
              {STARS.map((star) => {
                const invalid = invalidRanges.has(star);
                return (
                  <div key={star} className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="w-12 shrink-0 text-xs text-chart-4"
                        aria-label={`${star} star`}
                      >
                        {STAR_LABELS[star]}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        aria-label={`${star} star minimum allocation percent`}
                        value={ranges[star].min}
                        onChange={(e) => {
                          setRanges((p) => ({
                            ...p,
                            [star]: { ...p[star], min: e.target.value },
                          }));
                          invalidateResult();
                        }}
                        className={`w-20 h-8 text-sm text-center ${invalid ? "border-destructive" : ""}`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                      <span className="text-muted-foreground" aria-hidden>
                        —
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        aria-label={`${star} star maximum allocation percent`}
                        value={ranges[star].max}
                        onChange={(e) => {
                          setRanges((p) => ({
                            ...p,
                            [star]: { ...p[star], max: e.target.value },
                          }));
                          invalidateResult();
                        }}
                        className={`w-20 h-8 text-sm text-center ${invalid ? "border-destructive" : ""}`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    {invalid && (
                      <p className="text-xs text-destructive pl-14">
                        Min must be ≤ max
                      </p>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground pt-2">
                To target a fixed percentage (not a range), set both min and
                max to the same value — e.g. min 8% max 8%.
              </p>
            </div>
          )}
        </div>

        <Button
          onClick={handleCalculate}
          disabled={!canCalculate}
          className="w-full sm:w-auto"
        >
          Calculate allocation
        </Button>
      </div>

      {/* ── Results ── */}
      {result && <Results result={result} isLoggedIn={isLoggedIn} />}
    </div>
  );
}

function Results({
  result,
  isLoggedIn,
}: {
  result: CalculatorResult;
  isLoggedIn: boolean | null;
}) {
  const { isBudgetConstrained, isUnderCapitalized } = result;
  const isNormal = !isBudgetConstrained && !isUnderCapitalized;

  const cashAtMax = result.cashBufferMin; // cash remaining after max deployment
  const cashPctAtMax = Math.round((cashAtMax / result.totalAmount) * 100);
  const maxPct = Math.round((result.totalDeployedMax / result.totalAmount) * 100);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
      <h2 className="text-base font-semibold text-foreground">Results</h2>

      {/* Hard error: can't meet even minimum targets */}
      {isUnderCapitalized && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          Your total is too small to meet even the minimum targets — add more capital or reduce stock counts.
        </div>
      )}

      {/* Budget-constrained: min fits, max doesn't */}
      {isBudgetConstrained && (
        <div className="rounded-lg border border-primary/30 bg-primary/[0.05] px-4 py-2.5 text-sm text-foreground">
          Full amount deployed — each bucket&apos;s suggested % falls within your target range.
        </div>
      )}

      {/* Normal: budget covers max — show cash remaining after max deployment */}
      {isNormal && result.buckets.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-foreground">
          {cashAtMax === 0 ? (
            <>Investing at maximum targets deploys your full <span className="font-medium">{fmt(result.totalAmount)}</span> — no cash buffer.</>
          ) : (
            <>Investing at maximum targets deploys <span className="font-medium">{fmt(result.totalDeployedMax)} ({maxPct}%)</span> — <span className="font-medium">{fmt(cashAtMax)} ({cashPctAtMax}%)</span> stays as cash.</>
          )}
        </div>
      )}

      {result.buckets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Enter at least one stock count above to see allocations.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                <th className="pb-2 pr-4 font-medium">Rating</th>
                <th className="pb-2 pr-4 font-medium text-right">Stocks</th>
                <th className="pb-2 pr-4 font-medium text-right">Per stock</th>
                <th className="pb-2 font-medium text-right">Bucket total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {result.buckets.map((b: BucketResult) => (
                <tr key={b.star}>
                  <td className="py-2.5 pr-4 text-xs text-chart-4 tracking-tight">
                    {STAR_LABELS[b.star]}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {b.count}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums font-medium text-foreground">
                    {b.hasRangeError ? (
                      "—"
                    ) : isBudgetConstrained && b.suggestedAmount !== null && b.suggestedPct !== null ? (
                      `${fmt(b.suggestedAmount)} (${b.suggestedPct.toFixed(1)}%)`
                    ) : isNormal ? (
                      `${fmt(b.perStockMax)} (${b.range.max}%)`
                    ) : (
                      fmtRange(b.perStockMin, b.perStockMax, b.isAbsolute)
                    )}
                  </td>
                  <td className="py-2.5 text-right tabular-nums font-medium text-foreground">
                    {b.hasRangeError ? (
                      "—"
                    ) : isBudgetConstrained && b.suggestedAmount !== null && b.suggestedPct !== null ? (
                      `${fmt(b.suggestedAmount * b.count)} (${(b.suggestedPct * b.count).toFixed(1)}%)`
                    ) : isNormal ? (
                      `${fmt(b.bucketMax)} (${b.range.max * b.count}%)`
                    ) : (
                      fmtRange(b.bucketMin, b.bucketMax, b.isAbsolute)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border">
                <td colSpan={2} className="pt-3 text-xs text-muted-foreground">
                  {isBudgetConstrained ? (
                    <>
                      Suggested:{" "}
                      <span className="font-medium text-foreground">
                        {fmt(result.totalAmount)}
                      </span>{" "}
                      of {fmt(result.totalAmount)} total (100%)
                    </>
                  ) : isNormal ? (
                    <>
                      At max targets:{" "}
                      <span className="font-medium text-foreground">
                        {fmt(result.totalDeployedMax)}
                      </span>{" "}
                      ({maxPct}%) of {fmt(result.totalAmount)}
                    </>
                  ) : null}
                </td>
                <td
                  colSpan={2}
                  className={`pt-3 text-right text-xs font-medium ${
                    isBudgetConstrained || cashAtMax === 0
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {isBudgetConstrained ? (
                    "Fully deployed at suggested allocation"
                  ) : isNormal && cashAtMax === 0 ? (
                    "Fully deployed at max targets"
                  ) : isNormal ? (
                    <>
                      Cash buffer:{" "}
                      <span className="text-foreground">{fmt(cashAtMax)}</span>{" "}
                      ({cashPctAtMax}%)
                    </>
                  ) : null}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {isLoggedIn === false && <MarketingPitch />}
    </div>
  );
}

function MarketingPitch() {
  return (
    <div className="mt-2 rounded-xl border border-primary/20 bg-primary/[0.03] p-6 space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Your portfolio, live
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground">
          This is the plan. StockTracker shows you how you&apos;re tracking
          against it — live.
        </h2>
      </div>

      <div className="space-y-4">
        {[
          {
            title: "Import from Zerodha in seconds",
            body: "Upload your holdings statement — your actual positions appear instantly, no manual entry.",
          },
          {
            title: "See exactly where you're off-target",
            body: "Every bucket shows current weight vs. your conviction range. Under or over, flagged by name.",
          },
          {
            title: "Know the exact amount to add or trim",
            body: 'Not "rebalance" — the precise number for each stock to bring it into range.',
          },
        ].map((point) => (
          <div key={point.title} className="flex gap-3">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {point.title}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {point.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <GoogleCta className="w-full rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto">
          Continue with Google — it&apos;s free
        </GoogleCta>
        <p className="text-xs text-muted-foreground">
          No credit card. No spreadsheet. Your first portfolio is free.
        </p>
      </div>
    </div>
  );
}
