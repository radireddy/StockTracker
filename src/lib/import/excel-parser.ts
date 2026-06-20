import * as XLSX from "xlsx";

export interface ParsedCompany {
  name: string;
  symbol: string | null;
  market_cap: number | null;
  investment_horizon_years: number | null;
  star_rating: number | null;
  strategy: "core" | "satellite" | null;
  current_price: number | null;
  buy_price: number | null;
  expected_returns: number | null;
  thesis: string | null;
  highlights: string | null;
  financial_years: Array<{
    year: string;
    is_estimate: boolean;
    sort_order: number;
    revenue: number | null;
    revenue_growth_pct: number | null;
    ebitda: number | null;
    ebitda_margin_pct: number | null;
    depreciation: number | null;
    finance_cost: number | null;
    other_income: number | null;
    exceptional_items: number | null;
    pbt: number | null;
    tax_pct: number | null;
    pat: number | null;
    pat_growth_pct: number | null;
    pat_margin_pct: number | null;
    pe: number | null;
    peg: number | null;
  }>;
  valuation_scenarios: Array<{
    scenario_type: "bull" | "base" | "bare";
    target_pe: number | null;
    target_market_cap: number | null;
    irr: number | null;
    buying_market_cap: number | null;
    buy_price: number | null;
  }>;
  timeline_entries: Array<{
    quarter: string | null;
    content: string;
    sort_order: number;
  }>;
}

export function parseExcel(buffer: ArrayBuffer): ParsedCompany[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const companies: ParsedCompany[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName === "All Companies") continue;

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    if (data.length < 15) continue;

    const company: ParsedCompany = {
      name: String(data[1]?.[1] ?? sheetName),
      symbol: data[2]?.[1] ? String(data[2][1]) : null,
      market_cap: parseNum(data[3]?.[1]),
      investment_horizon_years: parseNum(data[4]?.[1]),
      star_rating: parseNum(data[5]?.[1]),
      strategy: parseStrategy(data[6]?.[1]),
      expected_returns: parseNum(data[7]?.[1]),
      current_price: parseNum(data[8]?.[1]),
      buy_price: parseNum(data[9]?.[1]),
      thesis: data[12]?.[0] ? String(data[12][0]) : null,
      highlights: null,
      financial_years: [],
      valuation_scenarios: [],
      timeline_entries: [],
    };

    // Parse financial model
    const fyStartRow = findRow(data, "Revenue", 13);
    if (fyStartRow >= 0) {
      const yearHeaders = data[fyStartRow - 1]?.slice(1) ?? [];
      const years = yearHeaders
        .filter((h) => h && String(h).match(/FY\d+/))
        .map(String);

      const metricRows: Record<string, number> = {};
      const metrics = [
        "Revenue", "Revenue growth", "EBITDA", "EBITDA margins",
        "Depreciation", "Finance cost", "Other income", "Exceptional",
        "PBT", "Tax", "PAT", "PAT growth", "PAT margins", "PE", "PEG",
      ];
      for (let r = fyStartRow; r < Math.min(fyStartRow + 25, data.length); r++) {
        const label = String(data[r]?.[0] ?? "").toLowerCase();
        for (const m of metrics) {
          if (label.includes(m.toLowerCase()) && !(m.toLowerCase() in metricRows)) {
            metricRows[m.toLowerCase()] = r;
          }
        }
      }

      for (let i = 0; i < years.length; i++) {
        const col = i + 1;
        company.financial_years.push({
          year: years[i],
          is_estimate: years[i].includes("E"),
          sort_order: i,
          revenue: getCell(data, metricRows["revenue"], col),
          revenue_growth_pct: getCell(data, metricRows["revenue growth"], col),
          ebitda: getCell(data, metricRows["ebitda"], col),
          ebitda_margin_pct: getCell(data, metricRows["ebitda margins"], col),
          depreciation: getCell(data, metricRows["depreciation"], col),
          finance_cost: getCell(data, metricRows["finance cost"], col),
          other_income: getCell(data, metricRows["other income"], col),
          exceptional_items: getCell(data, metricRows["exceptional"], col),
          pbt: getCell(data, metricRows["pbt"], col),
          tax_pct: getCell(data, metricRows["tax"], col),
          pat: getCell(data, metricRows["pat"], col),
          pat_growth_pct: getCell(data, metricRows["pat growth"], col),
          pat_margin_pct: getCell(data, metricRows["pat margins"], col),
          pe: getCell(data, metricRows["pe"], col),
          peg: getCell(data, metricRows["peg"], col),
        });
      }
    }

    // Parse valuation scenarios
    const valStartRow = findRow(data, "Bull", fyStartRow > 0 ? fyStartRow + 10 : 30);
    if (valStartRow >= 0) {
      for (const type of ["bull", "base", "bare"] as const) {
        const row = findRow(data, type, valStartRow - 1);
        if (row >= 0) {
          company.valuation_scenarios.push({
            scenario_type: type,
            target_pe: parseNum(data[row]?.[1]),
            target_market_cap: parseNum(data[row]?.[2]),
            irr: parseNum(data[row]?.[3]),
            buying_market_cap: parseNum(data[row]?.[4]),
            buy_price: parseNum(data[row]?.[5]),
          });
        }
      }
    }

    // Parse highlights
    const hlRow = findRow(data, "Highlight", valStartRow > 0 ? valStartRow + 5 : 40);
    if (hlRow >= 0) {
      const hlParts: string[] = [];
      for (let r = hlRow + 1; r < data.length; r++) {
        const cell = data[r]?.[0];
        if (!cell || String(cell).match(/^(Timeline|Q\dFY)/i)) break;
        hlParts.push(String(cell));
      }
      if (hlParts.length) company.highlights = hlParts.join("\n");
    }

    // Parse timeline
    const tlRow = findRow(data, "Timeline", hlRow > 0 ? hlRow : 30);
    if (tlRow >= 0) {
      let sortOrder = 0;
      for (let r = tlRow + 1; r < data.length; r++) {
        const cell = data[r]?.[0];
        if (!cell) continue;
        const text = String(cell);
        const quarterMatch = text.match(/Q\dFY\d+/);
        company.timeline_entries.push({
          quarter: quarterMatch ? quarterMatch[0] : null,
          content: text,
          sort_order: sortOrder++,
        });
      }
    }

    companies.push(company);
  }

  return companies;
}

function parseNum(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function parseStrategy(val: unknown): "core" | "satellite" | null {
  if (!val) return null;
  const s = String(val).toLowerCase();
  if (s.includes("core")) return "core";
  if (s.includes("satellite")) return "satellite";
  return null;
}

function findRow(data: unknown[][], text: string, startFrom: number): number {
  const lower = text.toLowerCase();
  for (let r = Math.max(0, startFrom); r < data.length; r++) {
    if (String(data[r]?.[0] ?? "").toLowerCase().includes(lower)) return r;
  }
  return -1;
}

function getCell(data: unknown[][], row: number | undefined, col: number): number | null {
  if (row == null) return null;
  return parseNum(data[row]?.[col]);
}
