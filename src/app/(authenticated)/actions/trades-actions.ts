"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import type { OpenPosition, OpenLot } from "@/lib/import/tradebook-types";

const log = createLogger({ service: "trades-actions" });

/** Returns open positions for the user, optionally filtered to specific accounts. */
export async function getOpenPositions(
  accountIds?: string[]
): Promise<OpenPosition[]> {
  const { supabase } = await getAuthUser();
  const { data, error } = await supabase.rpc("get_open_positions", {
    p_account_ids: accountIds ?? null,
  });
  if (error) {
    log.error("getOpenPositions failed", { error: error.message });
    throw new Error(error.message);
  }
  return (data ?? []) as OpenPosition[];
}

/** Returns per-lot open lots for a single stock (lazy-loaded on row expand). */
export async function getOpenLotsForStock(
  isin: string,
  accountIds?: string[]
): Promise<OpenLot[]> {
  const { supabase } = await getAuthUser();
  const { data, error } = await supabase.rpc("get_open_lots_for_stock", {
    p_isin: isin,
    p_account_ids: accountIds ?? null,
  });
  if (error) {
    log.error("getOpenLotsForStock failed", { error: error.message, isin });
    throw new Error(error.message);
  }
  return (data ?? []) as OpenLot[];
}
