/**
 * Maintenance script: recompute FIFO trade_lot_matches for every account from
 * the COMPLETE trade history.
 *
 * Why this exists: earlier imports fetched trades without paging, so PostgREST's
 * 1000-row cap silently truncated the input to computeFifoMatches — corrupting
 * lot matches (and therefore open positions) for any account with >1000 trades.
 * The import engine is now fixed to page; this script backfills existing data.
 *
 * Usage:
 *   npx tsx scripts/recompute-lot-matches.ts            # all accounts
 *   npx tsx scripts/recompute-lot-matches.ts <accountId>  # one account
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { computeFifoMatches } from "../src/lib/import/fifo-engine";
import { fetchAllRows } from "../src/lib/supabase/paginate";
import type { RawTradeForFifo } from "../src/lib/import/tradebook-types";

config({ path: path.resolve(process.cwd(), ".env.local") });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const N = (v: unknown) => Number(v);

async function recomputeAccount(accountId: string, userId: string): Promise<void> {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
    admin
      .from("trades")
      .select("id, isin, stock_id, trade_date, trade_type, quantity, price, executed_at")
      .eq("account_id", accountId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  const trades: RawTradeForFifo[] = rows.map((r) => ({
    id: r.id as string,
    isin: r.isin as string,
    stock_id: (r.stock_id as string | null) ?? null,
    trade_date: r.trade_date as string,
    trade_type: r.trade_type as "buy" | "sell",
    quantity: N(r.quantity),
    price: N(r.price),
    executed_at: (r.executed_at as string | null) ?? null,
  }));

  const matches = computeFifoMatches({ userId, accountId, trades });

  const { count: before } = await admin
    .from("trade_lot_matches")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId);

  await admin.from("trade_lot_matches").delete().eq("account_id", accountId);

  // Insert in chunks to stay well within request limits.
  for (let i = 0; i < matches.length; i += 500) {
    const chunk = matches.slice(i, i + 500);
    const { error } = await admin.from("trade_lot_matches").insert(chunk);
    if (error) throw new Error(`insert failed for ${accountId}: ${error.message}`);
  }

  console.log(
    `  ${accountId}: trades=${trades.length}  lot_matches ${before ?? 0} → ${matches.length}`
  );
}

async function main() {
  const only = process.argv[2];

  const { data: accounts, error } = await admin
    .from("accounts")
    .select("id, label, user_id");
  if (error) throw new Error(error.message);

  const targets = (accounts ?? []).filter((a) => !only || a.id === only);
  console.log(`Recomputing lot matches for ${targets.length} account(s)...`);

  for (const a of targets) {
    // Skip accounts with no trades quickly.
    const { count } = await admin
      .from("trades")
      .select("*", { count: "exact", head: true })
      .eq("account_id", a.id);
    if (!count) continue;
    await recomputeAccount(a.id, a.user_id as string);
  }
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
