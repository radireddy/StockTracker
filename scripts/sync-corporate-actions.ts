/**
 * Offline market-wide corporate-action sync. Run on a non-blocked IP (Node 22).
 *   npx tsx scripts/sync-corporate-actions.ts [--from YYYY-MM-DD]
 * Populates corporate_action_ref; advances corporate_action_sync_state per source
 * only on success. NEVER run on Vercel.
 */
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { corporateActionSources } from "../src/lib/corporate-actions/sources/registry";
import { chunkWindows, toRefRows } from "../src/lib/corporate-actions/sync-core";

config({ path: path.resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const OVERLAP_DAYS = 7;
const CHUNK_DAYS = 90;

function argFrom(): Date | null {
  const i = process.argv.indexOf("--from");
  return i >= 0 && process.argv[i + 1] ? new Date(process.argv[i + 1]) : null;
}

async function main() {
  const now = new Date();
  for (const source of corporateActionSources) {
    const { data: state } = await admin
      .from("corporate_action_sync_state").select("last_synced_at").eq("source", source.name).maybeSingle();

    let from: Date;
    if (!source.supportsHistory) {
      from = new Date(now); from.setDate(from.getDate() - 30); // forthcoming-only; short lookback
    } else if (state?.last_synced_at) {
      from = new Date(state.last_synced_at); from.setDate(from.getDate() - OVERLAP_DAYS);
    } else {
      from = argFrom() ?? new Date(now.getFullYear() - 15, now.getMonth(), now.getDate());
    }

    try {
      let total = 0;
      for (const win of chunkWindows(from, now, CHUNK_DAYS)) {
        const raw = await source.fetchWindow(win.from, win.to);
        const rows = toRefRows(raw, source.name);
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await admin.from("corporate_action_ref")
            .upsert(chunk, { onConflict: "source,symbol,action_type,ex_date", ignoreDuplicates: false });
          if (error) throw new Error(error.message);
        }
        total += rows.length;
        await new Promise((r) => setTimeout(r, 800)); // throttle
      }
      await admin.from("corporate_action_sync_state")
        .upsert({ source: source.name, last_synced_at: now.toISOString() }, { onConflict: "source" });
      console.log(`${source.name}: upserted ${total} split/bonus rows; watermark → ${now.toISOString()}`);
    } catch (e) {
      console.error(`${source.name}: FAILED, watermark not advanced —`, e instanceof Error ? e.message : e);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
