/**
 * One-off heal: promote the first projection model (by sort_order) to default
 * for any company that has models but none flagged is_default. Idempotent.
 * Usage: npx tsx scripts/fix-missing-default-model.ts [--apply]
 */
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const apply = process.argv.includes("--apply");

async function main() {
  const { data: companies, error } = await supabase.from("companies").select("id, isin");
  if (error) throw error;

  let fixed = 0;
  for (const c of companies ?? []) {
    const { data: models } = await supabase
      .from("projection_models")
      .select("id, is_default, sort_order")
      .eq("company_id", c.id);
    if (!models || models.length === 0) continue;
    if (models.some((m) => m.is_default)) continue;

    const target = [...models].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
    console.log(`${apply ? "FIX" : "WOULD FIX"} company ${c.id} (${c.isin}) -> default model ${target.id}`);
    if (apply) {
      const { error: upErr } = await supabase
        .from("projection_models")
        .update({ is_default: true })
        .eq("id", target.id);
      if (upErr) {
        console.error(`  FAILED: ${upErr.message}`);
        continue;
      }
    }
    fixed++;
  }
  console.log(`\n${apply ? "Fixed" : "Would fix"} ${fixed} companies.${apply ? "" : " Re-run with --apply to write."}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
