"use client";

import { useState, useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={starFilter} onValueChange={(v) => setStarFilter(v ?? "all")}>
          <SelectTrigger className="w-32">
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
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Strategy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="core">Core</SelectItem>
            <SelectItem value="satellite">Satellite</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={buyOnlyFilter}
            onChange={(e) => setBuyOnlyFilter(e.target.checked)}
          />
          Buy signals only
        </label>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} companies
        </span>
      </div>

      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>
                Company {sortField === "name" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("star_rating")}>
                Star {sortField === "star_rating" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("buy_price")}>
                Buy Price {sortField === "buy_price" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("current_price")}>
                Current Price {sortField === "current_price" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="text-right">Base Returns</TableHead>
              <TableHead className="text-right">Bare Returns</TableHead>
              <TableHead className="text-right">MoS</TableHead>
              <TableHead className="text-center">Buy Signal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((company) => {
              const mos =
                company.buy_price && company.current_price
                  ? marginOfSafety(company.buy_price, company.current_price)
                  : null;
              const buy = isBuySignal(company.current_price, company.buy_price);
              const baseReturn = getScenarioReturn(company.valuation_scenarios, "base");
              const bareReturn = getScenarioReturn(company.valuation_scenarios, "bare");

              return (
                <TableRow
                  key={company.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/company/${company.id}`)}
                >
                  <TableCell className="font-medium">
                    {company.name}
                    {company.symbol && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {company.symbol}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{"★".repeat(company.star_rating ?? 0)}</TableCell>
                  <TableCell>
                    {company.strategy && (
                      <Badge variant={company.strategy === "core" ? "default" : "secondary"}>
                        {company.strategy}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {company.buy_price != null ? `₹${company.buy_price.toLocaleString("en-IN")}` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {company.current_price != null ? `₹${company.current_price.toLocaleString("en-IN")}` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {baseReturn != null ? `${(baseReturn * 100).toFixed(0)}%` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {bareReturn != null ? `${(bareReturn * 100).toFixed(0)}%` : "-"}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
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
                  </TableCell>
                  <TableCell className="text-center">
                    {buy && <Badge className="bg-green-600 text-white">BUY</Badge>}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No companies found. Add your first company to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
