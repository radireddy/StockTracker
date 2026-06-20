import { readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");
const NSE_PATH = resolve(ROOT, "supabase/seed/raw/EQUITY_L.csv");
const BSE_PATH = resolve(ROOT, "supabase/seed/raw/BSE_LIST.csv");
const OUTPUT_PATH = resolve(ROOT, "supabase/seed/indian_stocks.csv");

interface MergedStock {
  isin: string;
  name: string;
  nse_symbol: string;
  bse_code: string;
  sector: string;
  industry: string;
  series: string;
  exchange: string;
}

// --- Read NSE ---
const nseRaw = readFileSync(NSE_PATH, "utf-8");
const nseRecords: Record<string, string>[] = parse(nseRaw, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

// Build NSE map keyed by ISIN
const nseByIsin = new Map<
  string,
  { symbol: string; name: string; series: string; isin: string }
>();

for (const row of nseRecords) {
  const series = (row["SERIES"] || "").trim();
  if (series !== "EQ") continue;

  const isin = (row["ISIN NUMBER"] || "").trim();
  if (!isin.startsWith("INE")) continue;

  nseByIsin.set(isin, {
    symbol: (row["SYMBOL"] || "").trim(),
    name: (row["NAME OF COMPANY"] || "").trim(),
    series,
    isin,
  });
}

// --- Read BSE ---
const bseRaw = readFileSync(BSE_PATH, "utf-8");
const bseRecords: Record<string, string>[] = parse(bseRaw, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

// Build BSE map keyed by ISIN
const bseByIsin = new Map<
  string,
  { bseCode: string; name: string; industry: string; isin: string }
>();

for (const row of bseRecords) {
  const isin = (row["ISIN_NUMBER"] || "").trim();
  if (!isin.startsWith("INE")) continue;

  // Skip duplicates — keep first occurrence
  if (bseByIsin.has(isin)) continue;

  bseByIsin.set(isin, {
    bseCode: (row["SCRIP_CD"] || "").trim(),
    name: (row["Issuer_Name"] || "").trim(),
    industry: (row["INDUSTRY"] || "").trim(),
    isin,
  });
}

// --- Merge ---
const allIsins = new Set([...nseByIsin.keys(), ...bseByIsin.keys()]);
const merged: MergedStock[] = [];

let nseOnly = 0;
let bseOnly = 0;
let both = 0;

for (const isin of allIsins) {
  const nse = nseByIsin.get(isin);
  const bse = bseByIsin.get(isin);

  let exchange: string;
  if (nse && bse) {
    exchange = "BOTH";
    both++;
  } else if (nse) {
    exchange = "NSE";
    nseOnly++;
  } else {
    exchange = "BSE";
    bseOnly++;
  }

  // Prefer NSE name for dual-listed stocks
  const name = nse ? nse.name : bse!.name;
  const industry = bse?.industry || "";

  merged.push({
    isin,
    name,
    nse_symbol: nse?.symbol || "",
    bse_code: bse?.bseCode || "",
    sector: industry, // Use INDUSTRY for both sector and industry
    industry,
    series: nse?.series || "",
    exchange,
  });
}

// Sort alphabetically by name
merged.sort((a, b) => a.name.localeCompare(b.name));

// --- Write output ---
const csvOutput = stringify(merged, {
  header: true,
  columns: [
    "isin",
    "name",
    "nse_symbol",
    "bse_code",
    "sector",
    "industry",
    "series",
    "exchange",
  ],
});

writeFileSync(OUTPUT_PATH, csvOutput);

// --- Print stats ---
console.log("=== Stock List Merge Complete ===");
console.log(`NSE input (EQ series, valid ISIN): ${nseByIsin.size}`);
console.log(`BSE input (valid ISIN):            ${bseByIsin.size}`);
console.log(`---`);
console.log(`Dual-listed (BOTH):  ${both}`);
console.log(`NSE only:            ${nseOnly}`);
console.log(`BSE only:            ${bseOnly}`);
console.log(`Total merged:        ${merged.length}`);
console.log(`---`);
console.log(`Output: ${OUTPUT_PATH}`);
