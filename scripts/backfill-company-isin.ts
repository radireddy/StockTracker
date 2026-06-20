/**
 * Backfill script: matches existing companies to indian_stocks by symbol or name,
 * then sets their isin column.
 *
 * Usage:
 *   npx tsx scripts/backfill-company-isin.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  // 1. Fetch all companies where isin IS NULL
  const { data: companies, error: compErr } = await supabase
    .from("companies")
    .select("id, name, symbol")
    .is("isin", null);

  if (compErr) {
    console.error("Error fetching companies:", compErr.message);
    process.exit(1);
  }

  if (!companies || companies.length === 0) {
    console.log("No companies with NULL isin found. Nothing to backfill.");
    return;
  }

  console.log(`Found ${companies.length} companies with NULL isin\n`);

  // 2. Fetch all indian_stocks for matching (paginate to get all rows)
  const stocks: { isin: string; name: string; nse_symbol: string | null }[] = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error: stockErr } = await supabase
      .from("indian_stocks")
      .select("isin, name, nse_symbol")
      .range(from, from + PAGE_SIZE - 1);
    if (stockErr) {
      console.error("Error fetching indian_stocks:", stockErr.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    stocks.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (stocks.length === 0) {
    console.error(
      "No indian_stocks found. Run the seed script first (npm run seed:stocks)."
    );
    process.exit(1);
  }

  // Build lookup maps
  const bySymbol = new Map<string, string>(); // nse_symbol (uppercased) -> isin
  const stockList = stocks.map((s) => ({
    isin: s.isin as string,
    name: (s.name as string).toLowerCase(),
  }));

  for (const stock of stocks) {
    if (stock.nse_symbol) {
      bySymbol.set((stock.nse_symbol as string).toUpperCase(), stock.isin as string);
    }
  }

  let matched = 0;
  let unmatched = 0;
  const unmatchedList: string[] = [];

  for (const company of companies) {
    let isin: string | null = null;

    // Strategy 1: Match by symbol (strip "NSE:" prefix if present)
    if (company.symbol) {
      let symbol = (company.symbol as string).trim().toUpperCase();
      if (symbol.startsWith("NSE:")) {
        symbol = symbol.slice(4);
      }
      isin = bySymbol.get(symbol) ?? null;
    }

    // Strategy 2: Fallback to name ILIKE match (case-insensitive contains)
    if (!isin && company.name) {
      const companyNameLower = (company.name as string).trim().toLowerCase();
      const match = stockList.find(
        (s) =>
          s.name === companyNameLower ||
          s.name.includes(companyNameLower) ||
          companyNameLower.includes(s.name)
      );
      if (match) {
        isin = match.isin;
      }
    }

    if (isin) {
      const { error: updateErr } = await supabase
        .from("companies")
        .update({ isin })
        .eq("id", company.id);

      if (updateErr) {
        console.error(
          `  Error updating company "${company.name}" (${company.id}):`,
          updateErr.message
        );
        unmatched++;
        unmatchedList.push(`${company.name} (${company.symbol ?? "no symbol"}) - update error`);
      } else {
        console.log(
          `  Matched: "${company.name}" (${company.symbol ?? "no symbol"}) -> ${isin}`
        );
        matched++;
      }
    } else {
      unmatched++;
      unmatchedList.push(`${company.name} (${company.symbol ?? "no symbol"})`);
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Matched:   ${matched}`);
  console.log(`Unmatched: ${unmatched}`);

  if (unmatchedList.length > 0) {
    console.log(`\nUnmatched companies:`);
    for (const name of unmatchedList) {
      console.log(`  - ${name}`);
    }
    console.log(
      `\nPlease manually set isin for unmatched companies before running the normalize migration.`
    );
  }
}

main().catch((err) => {
  console.error("Backfill script failed:", err);
  process.exit(1);
});
