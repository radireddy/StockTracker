/**
 * Maintenance script: seed corporate-action identity + factors, then recompute.
 *
 * Requires migration 006_corporate_actions.sql to be applied first.
 *
 * For each affected security it:
 *   1. sets indian_stocks.canonical_stock_id on the OLD (superseded) row → NEW row,
 *   2. inserts a corporate_actions split row on the NEW (canonical) stock_id,
 *   3. recomputes FIFO + open_position_snapshots for every affected account.
 *
 * Ratios verified against public records AND cross-checked against the data
 * (old_net × factor + new_net == 0 for a fully-exited position):
 *   JSLL  1:5  ex 2025-06-12  (270 × 5  = 1350 sold)
 *   SDBL  5:2  ex 2024-05-24  (100 × 2.5 = 250 sold)
 *   AVL   10:1 ex 2024-08-27  (53 × 10  = 530 sold)
 *   SENCO — net-zero on both ISINs already; identity pointer only, no factor.
 *
 * Usage:  npx tsx scripts/backfill-corporate-actions.ts [--apply]
 */
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../src/lib/supabase/paginate";
import { recomputeFifoForAccount } from "../src/lib/import/tradebook-import-engine";

config({ path: path.resolve(process.cwd(), ".env.local") });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const APPLY = process.argv.includes("--apply");

interface Seed {
  symbol: string;
  oldIsin: string;
  newIsin: string;
  split: { ex_date: string; factor: number } | null;
}

const SEEDS: Seed[] = [
  { symbol: "JSLL",  oldIsin: "INE0J5801011", newIsin: "INE0J5801029", split: { ex_date: "2025-06-12", factor: 5 } },
  { symbol: "SDBL",  oldIsin: "INE480C01020", newIsin: "INE480C01038", split: { ex_date: "2024-05-24", factor: 2.5 } },
  { symbol: "AVL",   oldIsin: "INE679V01019", newIsin: "INE679V01027", split: { ex_date: "2024-08-27", factor: 10 } },
  { symbol: "SENCO", oldIsin: "INE602W01019", newIsin: "INE602W01027", split: null },
];

async function stockIdByIsin(isin: string): Promise<string | null> {
  const { data } = await admin.from("indian_stocks").select("id").eq("isin", isin).maybeSingle();
  return data ? (data.id as string) : null;
}

async function main() {
  const affectedIsins: string[] = [];

  for (const s of SEEDS) {
    const oldId = await stockIdByIsin(s.oldIsin);
    const newId = await stockIdByIsin(s.newIsin);
    affectedIsins.push(s.oldIsin, s.newIsin);
    if (!oldId || !newId) {
      console.log(`  ${s.symbol}: SKIP — missing stock (old=${oldId} new=${newId})`);
      continue;
    }
    console.log(`  ${s.symbol}: ${s.oldIsin}(${oldId.slice(0, 8)}) → ${s.newIsin}(${newId.slice(0, 8)})` +
      (s.split ? `  split factor ${s.split.factor} @ ${s.split.ex_date}` : `  (identity only)`));

    if (APPLY) {
      const { error: e1 } = await admin
        .from("indian_stocks")
        .update({ canonical_stock_id: newId })
        .eq("id", oldId);
      if (e1) console.log(`    ! canonical update: ${e1.message}`);

      if (s.split) {
        const { error: e2 } = await admin.from("corporate_actions").upsert(
          {
            stock_id: newId,
            action_type: "split",
            ex_date: s.split.ex_date,
            factor: s.split.factor,
            note: `${s.symbol} ${s.oldIsin}→${s.newIsin}`,
          },
          { onConflict: "stock_id,action_type,ex_date" }
        );
        if (e2) console.log(`    ! corporate_actions insert: ${e2.message}`);
      }
    }
  }

  // Affected accounts = any account trading these ISINs.
  const trades = await fetchAllRows<{ account_id: string; user_id: string }>((f, t) =>
    admin.from("trades").select("account_id, user_id").in("isin", affectedIsins).order("account_id").range(f, t)
  );
  const accounts = new Map<string, string>();
  for (const r of trades) accounts.set(r.account_id, r.user_id);
  console.log(`\nAffected accounts: ${accounts.size}`);

  if (!APPLY) {
    console.log("\nDry run — pass --apply to write pointers/actions and recompute.");
    return;
  }

  console.log("Recomputing FIFO + snapshots…");
  for (const [accountId, userId] of accounts) {
    await recomputeFifoForAccount(admin, userId, accountId);
    console.log(`  recomputed ${accountId}`);
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
