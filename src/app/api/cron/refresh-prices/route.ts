import { createAdminClient } from "@/lib/supabase/admin";
import { refreshPrices, isIndianTradingHours } from "@/lib/services/price-refresh";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isIndianTradingHours()) {
    return NextResponse.json({ skipped: true, reason: "Outside Indian trading hours" });
  }

  try {
    const adminClient = createAdminClient();
    const result = await refreshPrices(adminClient);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Price refresh cron failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
