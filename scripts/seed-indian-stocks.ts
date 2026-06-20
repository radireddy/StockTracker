/**
 * Seed script: reads indian_stocks.csv and upserts into the indian_stocks table.
 *
 * Usage:
 *   npx tsx scripts/seed-indian-stocks.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
config({ path: path.resolve(process.cwd(), ".env.local") });

const BATCH_SIZE = 500;

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

interface CsvRow {
  isin: string;
  name: string;
  nse_symbol: string;
  bse_code: string;
  sector: string;
  industry: string;
  series: string;
  exchange: string;
}

function nullIfEmpty(value: string): string | null {
  return value && value.trim() !== "" ? value.trim() : null;
}

async function main() {
  const csvPath = path.resolve(__dirname, "../supabase/seed/indian_stocks.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");

  const rows: CsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Parsed ${rows.length} rows from CSV`);

  const records = rows.map((row) => ({
    isin: row.isin.trim(),
    name: row.name.trim(),
    nse_symbol: nullIfEmpty(row.nse_symbol),
    bse_code: nullIfEmpty(row.bse_code),
    sector: nullIfEmpty(row.sector),
    industry: nullIfEmpty(row.industry),
    series: nullIfEmpty(row.series),
    exchange: row.exchange.trim(),
  }));

  let upserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const { error } = await supabase.from("indian_stocks").upsert(batch, {
      onConflict: "isin",
      ignoreDuplicates: false,
    });

    if (error) {
      console.error(
        `Error upserting batch starting at index ${i}:`,
        error.message
      );
      process.exit(1);
    }

    upserted += batch.length;
    console.log(`  Upserted ${upserted} / ${records.length}`);
  }

  console.log(`\nDone. Total records upserted: ${upserted}`);
}

main().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
