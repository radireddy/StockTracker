"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertValuation } from "@/app/(authenticated)/actions/valuation-actions";
import type { ValuationScenario } from "@/types/database";

const SCENARIO_CONFIG = {
  bull: { label: "Bull Case", color: "border-green-500 bg-green-50 dark:bg-green-950" },
  base: { label: "Base Case", color: "border-blue-500 bg-blue-50 dark:bg-blue-950" },
  bare: { label: "Bare Case", color: "border-orange-500 bg-orange-50 dark:bg-orange-950" },
} as const;

export function ValuationTab({
  companyId,
  scenarios,
  currentPrice,
}: {
  companyId: string;
  scenarios: ValuationScenario[];
  currentPrice: number | null;
}) {
  const [data, setData] = useState<Record<string, Partial<ValuationScenario>>>(
    () => {
      const map: Record<string, Partial<ValuationScenario>> = {};
      for (const type of ["bull", "base", "bare"] as const) {
        const existing = scenarios.find((s) => s.scenario_type === type);
        map[type] = existing ?? { scenario_type: type };
      }
      return map;
    }
  );
  const [saving, setSaving] = useState<string | null>(null);

  const handleSave = async (type: "bull" | "base" | "bare") => {
    setSaving(type);
    await upsertValuation(companyId, {
      scenario_type: type,
      target_pe: data[type].target_pe ?? null,
      target_market_cap: data[type].target_market_cap ?? null,
      irr: data[type].irr ?? null,
      buying_market_cap: data[type].buying_market_cap ?? null,
      buy_price: data[type].buy_price ?? null,
    });
    setSaving(null);
  };

  const updateField = (
    type: string,
    field: string,
    value: string
  ) => {
    setData((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value === "" ? null : Number(value),
      },
    }));
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {(["bull", "base", "bare"] as const).map((type) => {
        const config = SCENARIO_CONFIG[type];
        const s = data[type];
        return (
          <Card key={type} className={`border-2 ${config.color}`}>
            <CardHeader>
              <CardTitle className="text-lg">{config.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: "target_pe", label: "Target PE" },
                { key: "target_market_cap", label: "Target Market Cap (Cr)" },
                { key: "irr", label: "IRR (%)" },
                { key: "buying_market_cap", label: "Buying Market Cap (Cr)" },
                { key: "buy_price", label: "Buy Price (₹)" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    className="h-8"
                    value={(s[key as keyof ValuationScenario] as number) ?? ""}
                    onChange={(e) => updateField(type, key, e.target.value)}
                  />
                </div>
              ))}
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleSave(type)}
                disabled={saving === type}
              >
                {saving === type ? "Saving..." : "Save"}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
