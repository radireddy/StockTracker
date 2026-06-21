import { createAdminClient } from "@/lib/supabase/admin";
import { refreshPrices, isIndianTradingHours } from "@/lib/services/price-refresh";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger({ service: "cron", job: "refresh-prices" });

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    log.warn("Cron unauthorized access attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isIndianTradingHours()) {
    log.info("Cron skipped — outside trading hours");
    return NextResponse.json({ skipped: true, reason: "Outside Indian trading hours" });
  }

  const start = Date.now();
  try {
    const adminClient = createAdminClient();
    const result = await refreshPrices(adminClient);
    log.info("Cron completed", {
      ...result,
      duration_ms: Date.now() - start,
    });
    return NextResponse.json(result);
  } catch (error) {
    log.error("Cron failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration_ms: Date.now() - start,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
