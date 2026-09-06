/**
 * Maintenance script: backfill trades whose ISIN is blank (Zerodha omits it on
 * some BSE / Series-'A' rows), then recompute FIFO for affected accounts.
 *
 * Within each account, a blank ISIN is recovered from another trade of the same
 * symbol (unique per symbol in practice). stock_id is set from indian_stocks so
 * the position resolves its name/price correctly. Idempotent.
 *
 * Usage:  npx tsx scripts/backfill-blank-isins.ts [--apply]
 *   (dry-run by default; pass --apply to write changes)
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

async function main() {
  const trades = await fetchAllRows<Record<string, unknown>>((f, t) =>
    admin
      .from("trades")
      .select("id, user_id, account_id, symbol, isin, stock_id")
      .order("id", { ascending: true })
      .range(f, t)
  );

  const isBlank = (v: unknown) => v == null || String(v).trim() === "";

  // Per-account symbol → ISIN (from populated rows only).
  const symToIsin = new Map<string, string>(); // key: account_id\x00symbol
  for (const t of trades) {
    if (!isBlank(t.isin)) {
      symToIsin.set(`${t.account_id}\x00${t.symbol}`, String(t.isin));
    }
  }

  // isin → stock_id from the master.
  const populatedIsins = [...new Set(trades.map((t) => t.isin).filter((v) => !isBlank(v)))] as string[];
  const stockIdByIsin = new Map<string, string>();
  for (let i = 0; i < populatedIsins.length; i += 500) {
    const chunk = populatedIsins.slice(i, i + 500);
    const { data } = await admin.from("indian_stocks").select("id, isin").in("isin", chunk);
    for (const s of (data ?? []) as Array<{ id: string; isin: string }>) {
      stockIdByIsin.set(s.isin, s.id);
    }
  }

  const blanks = trades.filter((t) => isBlank(t.isin));
  const affectedAccounts = new Map<string, string>(); // account_id → user_id
  let fixable = 0;
  let unresolved = 0;

  console.log(`Found ${blanks.length} trades with a blank ISIN.\n`);

  for (const t of blanks) {
    const resolvedIsin = symToIsin.get(`${t.account_id}\x00${t.symbol}`);
    if (!resolvedIsin) {
      unresolved++;
      console.log(`  UNRESOLVED  ${t.symbol} (account ${t.account_id}) — no same-symbol ISIN`);
      continue;
    }
    fixable++;
    const stockId = stockIdByIsin.get(resolvedIsin) ?? t.stock_id ?? null;
    affectedAccounts.set(t.account_id as string, t.user_id as string);

    if (APPLY) {
      const { error } = await admin
        .from("trades")
        .update({ isin: resolvedIsin, stock_id: stockId })
        .eq("id", t.id as string);
      if (error) console.log(`  ERROR updating ${t.id}: ${error.message}`);
    }
  }

  console.log(`\n${fixable} fixable · ${unresolved} unresolved · ${affectedAccounts.size} accounts affected`);

  if (!APPLY) {
    console.log("\nDry run — pass --apply to write changes and recompute FIFO.");
    return;
  }

  console.log("\nRecomputing FIFO for affected accounts…");
  for (const [accountId, userId] of affectedAccounts) {
    await recomputeFifoForAccount(admin, userId, accountId);
    console.log(`  recomputed ${accountId}`);
  }
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
