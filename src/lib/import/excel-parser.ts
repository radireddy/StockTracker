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
    if (sheetName.toLowerCase().includes("all compan")) continue;

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    if (data.length < 15) continue;

    // ── Parse header fields by label (handles varying row offsets) ────────
    const header: Record<string, unknown> = {};
    let thesisText: string | null = null;

    for (let r = 0; r < Math.min(20, data.length); r++) {
      const rawLabel = String(data[r]?.[0] ?? "");
      const label = rawLabel.toLowerCase().trim();
      const val = data[r]?.[1];

      // Skip long text cells (thesis) — they contain many words that cause false matches
      if (rawLabel.length > 100) {
        if (!thesisText) thesisText = rawLabel;
        continue;
      }

      if (label.includes("symbol")) header.symbol = val;
      else if (label === "market cap" || label === "market_cap" || label === "mcap")
        header.market_cap = val;
      else if (label.includes("number of year") || label.includes("horizon") || label.includes("investment horizon"))
        header.horizon = val;
      else if (label === "star" || label === "stars" || label === "star rating")
        header.star = val;
      else if (label.includes("strategy")) header.strategy = val;
      else if (label.includes("expected return")) header.expected_returns = val;
      else if (label === "price" || label === "current price" || label === "cmp")
        header.current_price = val;
      else if (label.includes("buy price") || label.includes("buying price"))
        header.buy_price = val;
    }

    const company: ParsedCompany = {
      name: sheetName,
      symbol: header.symbol ? String(header.symbol) : null,
      market_cap: parseNum(header.market_cap),
      investment_horizon_years: parseNum(header.horizon),
      star_rating: parseNum(header.star),
      strategy: parseStrategy(header.strategy),
      expected_returns: parseNum(header.expected_returns),
      current_price: parseNum(header.current_price),
      buy_price: parseNum(header.buy_price),
      thesis: thesisText,
      highlights: null,
      financial_years: [],
      valuation_scenarios: [],
      timeline_entries: [],
    };

    // ── Parse financial model ────────────────────────────────────────────
    const fyStartRow = findRow(data, "revenue", 10);
    if (fyStartRow >= 0) {
      const yearHeaders = data[fyStartRow - 1]?.slice(1) ?? [];
      const years = yearHeaders
        .filter((h) => h && String(h).match(/FY\d+/))
        .map(String);

      // Metrics: ordered most-specific first, with aliases for typos
      const metrics: Array<{ key: string; patterns: string[] }> = [
        { key: "revenue growth", patterns: ["revenue growth"] },
        { key: "revenue", patterns: ["revenue"] },
        { key: "ebitda margins", patterns: ["ebitda margin"] },
        { key: "ebitda growth", patterns: ["ebitda growth"] },
        { key: "ebitda", patterns: ["ebitda"] },
        { key: "depreciation", patterns: ["depreciation", "depriciation", "d&a", "depreciation & amort"] },
        { key: "finance cost", patterns: ["finance cost", "interest cost", "interest expense"] },
        { key: "other income", patterns: ["other income"] },
        { key: "exceptional", patterns: ["exceptional"] },
        { key: "pbt", patterns: ["pbt", "profit before tax"] },
        { key: "tax %", patterns: ["tax %", "tax rate"] },
        { key: "tax", patterns: ["tax"] },
        { key: "pat growth", patterns: ["pat growth"] },
        { key: "pat margins", patterns: ["pat margin"] },
        { key: "pat", patterns: ["pat", "profit after tax", "net profit"] },
        { key: "peg", patterns: ["peg"] },
        { key: "pe", patterns: ["pe "] }, // trailing space avoids matching "peg"
      ];

      const metricRows: Record<string, number> = {};
      for (let r = fyStartRow; r < Math.min(fyStartRow + 25, data.length); r++) {
        const label = String(data[r]?.[0] ?? "").toLowerCase();
        for (const m of metrics) {
          if (m.key in metricRows) continue;
          if (m.patterns.some((p) => label.includes(p))) {
            metricRows[m.key] = r;
            break; // one metric per row
          }
        }
      }

      // PE fallback: trailing space trick above might miss "PE" at end of string
      if (!("pe" in metricRows)) {
        for (let r = fyStartRow; r < Math.min(fyStartRow + 25, data.length); r++) {
          const label = String(data[r]?.[0] ?? "").toLowerCase().trim();
          if (label === "pe" && !(r === metricRows["peg"])) {
            metricRows["pe"] = r;
            break;
          }
        }
      }

      // Prefer "tax %" over "tax" for the tax_pct field
      const taxRow = metricRows["tax %"] ?? metricRows["tax"];

      for (let i = 0; i < years.length; i++) {
        const col = i + 1;
        company.financial_years.push({
          year: years[i],
          is_estimate: years[i].includes("E"),
          sort_order: i,
          revenue: getCell(data, metricRows["revenue"], col),
          revenue_growth_pct: toPct(getCell(data, metricRows["revenue growth"], col)),
          ebitda: getCell(data, metricRows["ebitda"], col),
          ebitda_margin_pct: toPct(getCell(data, metricRows["ebitda margins"], col)),
          depreciation: getCell(data, metricRows["depreciation"], col),
          finance_cost: getCell(data, metricRows["finance cost"], col),
          other_income: getCell(data, metricRows["other income"], col),
          exceptional_items: getCell(data, metricRows["exceptional"], col),
          pbt: getCell(data, metricRows["pbt"], col),
          tax_pct: toPct(getCell(data, taxRow, col)),
          pat: getCell(data, metricRows["pat"], col),
          pat_growth_pct: toPct(getCell(data, metricRows["pat growth"], col)),
          pat_margin_pct: toPct(getCell(data, metricRows["pat margins"], col)),
          pe: getCell(data, metricRows["pe"], col),
          peg: getCell(data, metricRows["peg"], col),
        });
      }
    }

    // ── Parse valuation scenarios ────────────────────────────────────────
    const valStartRow = findRow(data, "bull", fyStartRow > 0 ? fyStartRow + 10 : 30);
    if (valStartRow >= 0) {
      // Look for expected returns near the valuation table (rows above Bull)
      if (company.expected_returns == null) {
        for (let r = Math.max(0, valStartRow - 8); r < valStartRow; r++) {
          const label = String(data[r]?.[0] ?? "").toLowerCase();
          if (label.includes("expected return")) {
            company.expected_returns = parseNum(data[r]?.[1]);
            break;
          }
        }
      }

      for (const type of ["bull", "base", "bare"] as const) {
        const row = findRow(data, type, valStartRow - 1);
        if (row >= 0) {
          company.valuation_scenarios.push({
            scenario_type: type,
            target_pe: parseNum(data[row]?.[1]),
            target_market_cap: parseNum(data[row]?.[2]),
            irr: toPct(parseNum(data[row]?.[3])),
            buying_market_cap: parseNum(data[row]?.[4]),
            buy_price: parseNum(data[row]?.[5]),
          });
        }
      }
    }

    // ── Parse highlights ─────────────────────────────────────────────────
    const hlRow = findRow(data, "highlight", valStartRow > 0 ? valStartRow + 3 : 40);
    if (hlRow >= 0) {
      // Highlights text can be in column 0 or column 1
      const hlParts: string[] = [];
      const inlineHl = data[hlRow]?.[1];
      if (inlineHl && String(inlineHl).length > 5) {
        hlParts.push(String(inlineHl));
      }
      for (let r = hlRow + 1; r < data.length; r++) {
        const cell = data[r]?.[0];
        if (!cell || String(cell).match(/^(Timeline|Q\dFY)/i)) break;
        hlParts.push(String(cell));
      }
      if (hlParts.length) company.highlights = hlParts.join("\n");
    }

    // ── Parse timeline ───────────────────────────────────────────────────
    const tlRow = findRow(data, "timeline", hlRow > 0 ? hlRow : 30);
    if (tlRow >= 0) {
      let sortOrder = 0;
      // Timeline first entry can be in column 1 of the "Timeline" row itself
      const inlineTl = data[tlRow]?.[1];
      if (inlineTl && String(inlineTl).length > 10) {
        const text = String(inlineTl);
        const quarterMatch = text.match(/Q\dFY\d+/);
        company.timeline_entries.push({
          quarter: quarterMatch ? quarterMatch[0] : null,
          content: text,
          sort_order: sortOrder++,
        });
      }
      for (let r = tlRow + 1; r < data.length; r++) {
        // Timeline entries can be in column 0 or column 1
        const cell = data[r]?.[1] ?? data[r]?.[0];
        if (!cell) continue;
        const text = String(cell).trim();
        if (!text) continue;
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
    const cell = String(data[r]?.[0] ?? "");
    // Skip long text blocks (thesis/notes) to avoid false matches
    if (cell.length > 100) continue;
    if (cell.toLowerCase().includes(lower)) return r;
  }
  return -1;
}

function getCell(data: unknown[][], row: number | undefined, col: number): number | null {
  if (row == null) return null;
  return parseNum(data[row]?.[col]);
}

/** Excel stores percentages as decimals (0.14 = 14%). Convert to whole number. */
function toPct(val: number | null): number | null {
  if (val == null) return null;
  if (Math.abs(val) <= 1) return val * 100;
  return val;
}
