"use client";

import { useState, useMemo, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Save } from "lucide-react";
import { upsertValuation } from "@/app/(authenticated)/actions/valuation-actions";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import type { ValuationScenario, FinancialYear } from "@/types/database";

type ScenarioType = "bull" | "base" | "bare";

const SCENARIO_LABELS: Record<ScenarioType, { label: string; color: string }> = {
  bull: { label: "Bull", color: "text-green-700 dark:text-green-400" },
  base: { label: "Base", color: "text-blue-700 dark:text-blue-400" },
  bare: { label: "Bare", color: "text-orange-700 dark:text-orange-400" },
};

function fmtNum(val: number | null | undefined, decimals = 2): string {
  if (val == null || !isFinite(val)) return "";
  return val.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(val: number | null | undefined): string {
  if (val == null || !isFinite(val)) return "";
  return `${(val * 100).toFixed(2)}%`;
}

export function ValuationTab({
  companyId,
  scenarios,
  currentPrice,
  marketCap,
  expectedReturns,
  horizonYears,
  financialYears,
}: {
  companyId: string;
  scenarios: ValuationScenario[];
  currentPrice: number | null;
  marketCap: number | null;
  expectedReturns: number | null;
  horizonYears: number | null;
  financialYears: FinancialYear[];
}) {
  const [expReturns, setExpReturns] = useState<number>(
    expectedReturns != null ? expectedReturns * 100 : 25
  );
  const [saving, setSaving] = useState(false);

  const [scenarioData, setScenarioData] = useState<
    Record<ScenarioType, { target_pe: number | null; target_market_cap: number | null }>
  >(() => {
    const result: Record<ScenarioType, { target_pe: number | null; target_market_cap: number | null }> = {
      bull: { target_pe: null, target_market_cap: null },
      base: { target_pe: null, target_market_cap: null },
      bare: { target_pe: null, target_market_cap: null },
    };
    for (const s of scenarios) {
      if (s.scenario_type in result) {
        result[s.scenario_type as ScenarioType] = {
          target_pe: s.target_pe,
          target_market_cap: s.target_market_cap,
        };
      }
    }
    return result;
  });

  const horizon = horizonYears ?? 2;
  const curMC = marketCap ?? 0;
  const curPrice = currentPrice ?? 0;

  // Get terminal year PAT for auto-computing market cap from PE
  const terminalPAT = useMemo(() => {
    if (financialYears.length === 0) return null;
    const last = financialYears[financialYears.length - 1];
    return last.pat ?? null;
  }, [financialYears]);

  const computeDerived = useCallback(
    (targetMC: number | null) => {
      if (targetMC == null || curMC <= 0 || horizon <= 0) {
        return { irr: null, buyingMC: null, buyPrice: null };
      }
      const irr = Math.pow(targetMC / curMC, 1 / horizon) - 1;
      const rate = expReturns / 100;
      const buyingMC = targetMC / Math.pow(1 + rate, horizon);
      const buyPrice = curPrice > 0 && curMC > 0
        ? buyingMC * (curPrice / curMC)
        : null;
      return { irr, buyingMC, buyPrice };
    },
    [curMC, curPrice, horizon, expReturns]
  );

  const updateScenario = (type: ScenarioType, field: "target_pe" | "target_market_cap", value: string) => {
    const numVal = value === "" ? null : Number(value);
    setScenarioData((prev) => {
      const updated = { ...prev[type] };
      if (field === "target_pe") {
        updated.target_pe = numVal;
        // Auto-compute market cap from PE × terminal PAT
        if (numVal != null && terminalPAT != null) {
          updated.target_market_cap = Math.round(numVal * terminalPAT * 100) / 100;
        }
      } else {
        updated.target_market_cap = numVal;
      }
      return { ...prev, [type]: updated };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const promises: Promise<void>[] = [];
      for (const type of ["bull", "base", "bare"] as const) {
        const s = scenarioData[type];
        const derived = computeDerived(s.target_market_cap);
        promises.push(
          upsertValuation(companyId, {
            scenario_type: type,
            target_pe: s.target_pe,
            target_market_cap: s.target_market_cap,
            irr: derived.irr != null ? Math.round(derived.irr * 10000) / 10000 : null,
            buying_market_cap: derived.buyingMC != null ? Math.round(derived.buyingMC * 100) / 100 : null,
            buy_price: derived.buyPrice != null ? Math.round(derived.buyPrice * 100) / 100 : null,
          })
        );
      }
      // Also save expected_returns on the company
      promises.push(
        updateCompany(companyId, { expected_returns: expReturns / 100 })
      );
      await Promise.all(promises);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 px-2.5 text-xs gap-1">
          <Save className="h-3 w-3" /> {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      <div className="space-y-4">
        {/* Top info row */}
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <Label className="text-xs text-muted-foreground">Current Market Cap</Label>
            <div className="text-sm font-semibold tabular-nums">
              {curMC > 0 ? `₹${fmtNum(curMC)} Cr` : "-"}
            </div>
          </div>
          <div className="w-40">
            <Label className="text-xs text-muted-foreground">Expected Returns (%)</Label>
            <Input
              type="number"
              step="any"
              className="h-8 text-sm"
              value={expReturns}
              onChange={(e) => setExpReturns(e.target.value === "" ? 25 : Number(e.target.value))}
            />
          </div>
          {terminalPAT != null && (
            <div>
              <Label className="text-xs text-muted-foreground">Terminal PAT</Label>
              <div className="text-sm font-semibold tabular-nums">
                ₹{fmtNum(terminalPAT)} Cr
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Horizon</Label>
            <div className="text-sm font-semibold tabular-nums">
              {horizon} years
            </div>
          </div>
        </div>

        {/* Scenarios table */}
        <div className="rounded-md border border-border/50 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20"></TableHead>
                <TableHead className="text-center font-bold text-amber-700 dark:text-amber-400">P/E Ratio</TableHead>
                <TableHead className="text-right font-bold text-amber-700 dark:text-amber-400">Market Cap</TableHead>
                <TableHead className="text-right font-bold text-amber-700 dark:text-amber-400">IRR</TableHead>
                <TableHead className="text-right font-bold text-amber-700 dark:text-amber-400">Buying MC</TableHead>
                <TableHead className="text-right font-bold text-amber-700 dark:text-amber-400">Buy Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(["bull", "base", "bare"] as const).map((type) => {
                const s = scenarioData[type];
                const derived = computeDerived(s.target_market_cap);
                const cfg = SCENARIO_LABELS[type];

                return (
                  <TableRow key={type}>
                    <TableCell className={`font-semibold ${cfg.color}`}>
                      {cfg.label}
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        step="any"
                        className="h-8 text-right text-sm tabular-nums"
                        value={s.target_pe ?? ""}
                        onChange={(e) => updateScenario(type, "target_pe", e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        step="any"
                        className="h-8 text-right text-sm tabular-nums"
                        value={s.target_market_cap ?? ""}
                        onChange={(e) => updateScenario(type, "target_market_cap", e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">
                      {fmtPct(derived.irr)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {fmtNum(derived.buyingMC)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">
                      {derived.buyPrice != null ? fmtNum(derived.buyPrice) : ""}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
