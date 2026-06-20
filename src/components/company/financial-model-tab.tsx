"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bulkUpsertFinancialYears } from "@/app/(authenticated)/actions/financial-actions";
import type { FinancialYear } from "@/types/database";

const ROWS = [
  { key: "revenue", label: "Revenue (Cr)" },
  { key: "revenue_growth_pct", label: "Revenue Growth %" },
  { key: "ebitda", label: "EBITDA (Cr)" },
  { key: "ebitda_margin_pct", label: "EBITDA Margin %" },
  { key: "depreciation", label: "Depreciation" },
  { key: "finance_cost", label: "Finance Cost" },
  { key: "other_income", label: "Other Income" },
  { key: "exceptional_items", label: "Exceptional Items" },
  { key: "pbt", label: "PBT" },
  { key: "tax_pct", label: "Tax %" },
  { key: "pat", label: "PAT (Cr)" },
  { key: "pat_growth_pct", label: "PAT Growth %" },
  { key: "pat_margin_pct", label: "PAT Margin %" },
  { key: "pe", label: "PE" },
  { key: "peg", label: "PEG" },
] as const;

export function FinancialModelTab({
  companyId,
  financialYears,
}: {
  companyId: string;
  financialYears: FinancialYear[];
}) {
  const [data, setData] = useState<FinancialYear[]>(financialYears);
  const [saving, setSaving] = useState(false);

  const years = data.map((fy) => fy.year);

  const updateCell = useCallback(
    (yearIdx: number, key: string, value: string) => {
      setData((prev) => {
        const next = [...prev];
        next[yearIdx] = {
          ...next[yearIdx],
          [key]: value === "" ? null : Number(value),
        };
        return next;
      });
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    await bulkUpsertFinancialYears(
      companyId,
      data.map((fy, idx) => ({
        ...fy,
        sort_order: idx,
      }))
    );
    setSaving(false);
  };

  const addYear = () => {
    const lastYear = years[years.length - 1] ?? "FY25";
    const match = lastYear.match(/FY(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 26;
    const newYear: FinancialYear = {
      id: crypto.randomUUID(),
      company_id: companyId,
      user_id: "",
      year: `FY${nextNum}E`,
      is_estimate: true,
      revenue: null,
      revenue_growth_pct: null,
      ebitda: null,
      ebitda_margin_pct: null,
      ebitda_growth_pct: null,
      depreciation: null,
      finance_cost: null,
      other_income: null,
      exceptional_items: null,
      pbt: null,
      tax_pct: null,
      pat: null,
      pat_growth_pct: null,
      pat_margin_pct: null,
      minority_interest: null,
      pat_for_shareholders: null,
      pe: null,
      peg: null,
      sort_order: data.length,
      created_at: "",
      updated_at: "",
    };
    setData((prev) => [...prev, newYear]);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Financial Model</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addYear}>
            Add Year
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-medium min-w-[160px]">
                  Metric
                </th>
                {years.map((y) => (
                  <th
                    key={y}
                    className={`py-2 px-2 text-right font-medium min-w-[100px] ${
                      y.includes("E") ? "text-blue-600" : ""
                    }`}
                  >
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key} className="border-b">
                  <td className="py-1 pr-4 font-medium text-muted-foreground">
                    {row.label}
                  </td>
                  {data.map((fy, idx) => (
                    <td key={fy.year} className="py-1 px-1">
                      <Input
                        type="number"
                        className="h-7 text-right text-sm"
                        value={
                          (fy[row.key as keyof FinancialYear] as number) ?? ""
                        }
                        onChange={(e) =>
                          updateCell(idx, row.key, e.target.value)
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
