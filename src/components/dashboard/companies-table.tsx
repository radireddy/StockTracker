"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { marginOfSafety, isBuySignal } from "@/lib/utils/calculations";
import type { Company, ValuationScenario } from "@/types/database";

type CompanyWithScenarios = Company & {
  valuation_scenarios: ValuationScenario[];
};

function getScenarioReturn(
  scenarios: ValuationScenario[],
  type: "base" | "bare"
): number | null {
  const s = scenarios.find((v) => v.scenario_type === type);
  return s?.irr ?? null;
}

function fmtPrice(val: number | null): string {
  if (val == null) return "-";
  return val.toLocaleString("en-IN");
}

export function CompaniesTable({
  companies,
}: {
  companies: CompanyWithScenarios[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");
  const [buyOnlyFilter, setBuyOnlyFilter] = useState(false);
  const [sortField, setSortField] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    let result = companies;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.symbol?.toLowerCase().includes(q)
      );
    }
    if (starFilter !== "all") {
      result = result.filter((c) => c.star_rating === Number(starFilter));
    }
    if (strategyFilter !== "all") {
      result = result.filter((c) => c.strategy === strategyFilter);
    }
    if (buyOnlyFilter) {
      result = result.filter((c) => isBuySignal(c.current_price, c.buy_price));
    }

    result.sort((a, b) => {
      const aVal = a[sortField as keyof Company];
      const bVal = b[sortField as keyof Company];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [companies, search, starFilter, strategyFilter, buyOnlyFilter, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 h-8 text-sm"
        />
        <Select value={starFilter} onValueChange={(v) => setStarFilter(v ?? "all")}>
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue placeholder="Stars" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stars</SelectItem>
            {[1, 2, 3, 4, 5].map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} Star{s > 1 ? "s" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={strategyFilter} onValueChange={(v) => setStrategyFilter(v ?? "all")}>
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue placeholder="Strategy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="core">Core</SelectItem>
            <SelectItem value="satellite">Satellite</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={buyOnlyFilter}
            onChange={(e) => setBuyOnlyFilter(e.target.checked)}
          />
          Buy signals only
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} companies
        </span>
      </div>

      {/* Dense table */}
      <div className="border border-border/60 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-border/40 bg-muted/30">
              <th
                className="sticky top-0 z-10 bg-muted/30 text-left px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("name")}
              >
                Company<SortIcon field="name" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-center px-2 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("star_rating")}
              >
                Star<SortIcon field="star_rating" />
              </th>
              <th className="sticky top-0 z-10 bg-muted/30 text-center px-2 py-2 text-xs font-medium text-muted-foreground">
                Strategy
              </th>
              <th className="sticky top-0 z-10 bg-muted/30 text-left px-2 py-2 text-xs font-medium text-muted-foreground">
                Sector
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("market_cap")}
              >
                MCap<SortIcon field="market_cap" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("buy_price")}
              >
                Buy<SortIcon field="buy_price" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("current_price")}
              >
                CMP<SortIcon field="current_price" />
              </th>
              <th className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                MoS%
              </th>
              <th className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                IRR
              </th>
              <th className="sticky top-0 z-10 bg-muted/30 text-center px-2 py-2 text-xs font-medium text-muted-foreground">
                Signal
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((company, idx) => {
              const mos =
                company.buy_price && company.current_price
                  ? marginOfSafety(company.buy_price, company.current_price)
                  : null;
              const buy = isBuySignal(company.current_price, company.buy_price);
              const baseReturn = getScenarioReturn(company.valuation_scenarios, "base");

              return (
                <tr
                  key={company.id}
                  className={`cursor-pointer border-b border-border/20 hover:bg-muted/40 transition-colors ${
                    idx % 2 === 0 ? "" : "bg-muted/15"
                  }`}
                  onClick={() => router.push(`/company/${company.id}`)}
                >
                  <td className="px-3 py-1.5 font-medium">
                    {company.name}
                    {company.symbol && (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        {company.symbol}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center text-xs">
                    {"★".repeat(company.star_rating ?? 0)}
                  </td>
                  <td className="px-2 py-1.5 text-center text-xs capitalize text-muted-foreground">
                    {company.strategy ?? "-"}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground truncate max-w-[120px]">
                    {company.sector ?? "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {company.market_cap != null ? fmtPrice(company.market_cap) : "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {company.buy_price != null ? fmtPrice(company.buy_price) : "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {company.current_price != null ? fmtPrice(company.current_price) : "-"}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                      mos != null
                        ? mos > 0
                          ? "text-green-600"
                          : mos < -0.1
                            ? "text-red-600"
                            : "text-yellow-600"
                        : ""
                    }`}
                  >
                    {mos != null ? `${(mos * 100).toFixed(0)}%` : "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {baseReturn != null ? `${(baseReturn * 100).toFixed(0)}%` : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {buy && (
                      <span className="text-[10px] font-semibold text-green-600 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded">
                        BUY
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-sm text-muted-foreground">
                  No companies found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
