"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { marginOfSafety, isBuySignal, effectiveBuyPrice, fmtPriceShort, fmtPctShort } from "@/lib/utils/calculations";
import type { Company, ProjectionModel, ValuationScenario } from "@/types/database";

type CompanyWithProjections = Company & {
  projection_models: (ProjectionModel & { valuation_scenarios: ValuationScenario[] })[];
};

function getDefaultScenarios(company: CompanyWithProjections): ValuationScenario[] {
  const defaultModel = company.projection_models?.find((pm) => pm.is_default);
  return defaultModel?.valuation_scenarios ?? [];
}

function getScenarioReturn(
  scenarios: ValuationScenario[],
  type: "base" | "bare"
): number | null {
  const s = scenarios.find((v) => v.scenario_type === type);
  return s?.irr ?? null;
}

export function CompaniesTable({
  companies,
}: {
  companies: CompanyWithProjections[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");
  const [buyOnlyFilter, setBuyOnlyFilter] = useState(false);
  const [sortField, setSortField] = useState<string>("star_rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
      result = result.filter((c) =>
        isBuySignal(c.current_price, effectiveBuyPrice(c.buy_price, getDefaultScenarios(c)))
      );
    }

    const getSortValue = (c: CompanyWithProjections): string | number | null => {
      switch (sortField) {
        case "mos": {
          const bp = effectiveBuyPrice(c.buy_price, getDefaultScenarios(c));
          return bp && c.current_price ? marginOfSafety(bp, c.current_price) : null;
        }
        case "irr":
          return getScenarioReturn(getDefaultScenarios(c), "base");
        case "signal": {
          const bp = effectiveBuyPrice(c.buy_price, getDefaultScenarios(c));
          return isBuySignal(c.current_price, bp) ? 1 : 0;
        }
        default:
          return c[sortField as keyof Company] as string | number | null;
      }
    };

    result.sort((a, b) => {
      const aVal = getSortValue(a);
      const bVal = getSortValue(b);
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
            {[1, 2, 3, 4].map((s) => (
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
                className="sticky top-0 z-10 bg-muted/30 text-left px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("name")}
              >
                Company<SortIcon field="name" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-center px-2 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("star_rating")}
              >
                Star<SortIcon field="star_rating" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-center px-2 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("strategy")}
              >
                Strategy<SortIcon field="strategy" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-left px-2 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("sector")}
              >
                Sector<SortIcon field="sector" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("market_cap")}
              >
                MCap<SortIcon field="market_cap" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("buy_price")}
              >
                Buy Price<SortIcon field="buy_price" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("current_price")}
              >
                CMP<SortIcon field="current_price" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("mos")}
              >
                MoS%<SortIcon field="mos" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-right px-3 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("irr")}
              >
                IRR<SortIcon field="irr" />
              </th>
              <th
                className="sticky top-0 z-10 bg-muted/30 text-center px-2 py-2.5 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("signal")}
              >
                Signal<SortIcon field="signal" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((company, idx) => {
              const buyPrice = effectiveBuyPrice(company.buy_price, getDefaultScenarios(company));
              const isDefaulted = company.buy_price == null && buyPrice != null;
              const mos =
                buyPrice && company.current_price
                  ? marginOfSafety(buyPrice, company.current_price)
                  : null;
              const buy = isBuySignal(company.current_price, buyPrice);
              const baseReturn = getScenarioReturn(getDefaultScenarios(company), "base");

              return (
                <tr
                  key={company.id}
                  className={`cursor-pointer border-b border-border/20 hover:bg-muted/40 transition-colors ${
                    idx % 2 === 0 ? "" : "bg-muted/15"
                  }`}
                  onClick={() => router.push(`/company/${company.id}`)}
                >
                  <td className="px-3 py-2.5 font-medium">
                    {company.name}
                    {company.symbol && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {company.symbol}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-center text-sm">
                    {"★".repeat(company.star_rating ?? 0)}
                  </td>
                  <td className="px-2 py-2.5 text-center text-sm capitalize text-muted-foreground">
                    {company.strategy ?? "-"}
                  </td>
                  <td className="px-2 py-2.5 text-sm text-muted-foreground truncate max-w-[140px]">
                    {company.sector ?? "-"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {company.market_cap != null ? Math.round(company.market_cap).toLocaleString("en-IN") : "-"}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${isDefaulted ? "text-muted-foreground italic" : ""}`} title={isDefaulted ? "Base case buy price (no manual override)" : undefined}>
                    {fmtPriceShort(buyPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtPriceShort(company.current_price)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right tabular-nums font-medium ${
                      mos != null
                        ? mos > 0
                          ? "text-green-600"
                          : mos < -0.1
                            ? "text-red-600"
                            : "text-yellow-600"
                        : ""
                    }`}
                  >
                    {fmtPctShort(mos)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtPctShort(baseReturn)}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {buy && (
                      <span className="text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded">
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
