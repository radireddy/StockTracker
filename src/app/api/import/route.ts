import { createClient } from "@/lib/supabase/server";
import { detectBroker, getBrokerAdapter } from "@/lib/import/broker-registry";
import { executeImport } from "@/lib/import/import-engine";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import type { BrokerType } from "@/lib/import/types";

const log = createLogger({ service: "import-api" });

/**
 * POST /api/import
 * Upload a broker tradebook for async processing.
 * Returns a job_id immediately for polling.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const portfolioId = formData.get("portfolio_id") as string;
  if (!portfolioId)
    return NextResponse.json({ error: "No portfolio selected" }, { status: 400 });

  const brokerHint = formData.get("broker") as BrokerType | null;

  // Validate portfolio
  const { data: portfolio, error: pErr } = await supabase
    .from("portfolios")
    .select("id, type, name")
    .eq("id", portfolioId)
    .single();

  if (pErr || !portfolio) {
    return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  }

  if (portfolio.type !== "holdings") {
    return NextResponse.json(
      { error: "Trades can only be imported into holdings-type portfolios" },
      { status: 400 }
    );
  }

  // Parse the file
  const buffer = await file.arrayBuffer();

  // Resolve broker adapter
  const adapter = brokerHint
    ? getBrokerAdapter(brokerHint)
    : detectBroker(buffer);

  if (!adapter) {
    return NextResponse.json(
      {
        error:
          "Could not identify the broker format. Please select the correct broker or ensure the file is a valid tradebook.",
      },
      { status: 400 }
    );
  }

  let parseResult;
  try {
    parseResult = adapter.parse(buffer);
  } catch (err) {
    log.error("Parse failed", { broker: adapter.broker, error: (err as Error).message });
    return NextResponse.json(
      {
        error: `Failed to parse ${adapter.displayName} tradebook. Ensure the file is a valid tradebook download.`,
      },
      { status: 400 }
    );
  }

  // Check for fatal parse errors (no trades at all)
  const fatalErrors = parseResult.errors.filter((e) => e.severity === "error");
  if (parseResult.trades.length === 0) {
    return NextResponse.json(
      {
        error:
          fatalErrors.length > 0
            ? fatalErrors[0].message
            : "No valid trades found in the file",
      },
      { status: 400 }
    );
  }

  // Create import job
  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .insert({
      user_id: user.id,
      portfolio_id: portfolioId,
      source: adapter.broker,
      status: "processing",
      file_name: file.name,
      total_rows: parseResult.trades.length,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    log.error("Failed to create import job", { error: jobErr?.message });
    return NextResponse.json(
      { error: "Failed to create import job" },
      { status: 500 }
    );
  }

  const jobId = job.id;

  // Fire-and-forget async processing
  executeImport(user.id, portfolioId, jobId, parseResult, supabase).catch(
    (err) => {
      log.error("Import processing crashed", {
        jobId,
        error: (err as Error).message,
      });
      // Try to mark job as failed
      supabase
        .from("import_jobs")
        .update({
          status: "failed",
          errors: [{ message: `Unexpected error: ${(err as Error).message}` }],
        })
        .eq("id", jobId)
        .then(() => {});
    }
  );

  return NextResponse.json({
    job_id: jobId,
    broker: adapter.broker,
    broker_name: adapter.displayName,
    total_trades: parseResult.trades.length,
    client_id: parseResult.metadata.client_id,
    date_range: parseResult.metadata.date_range,
    parse_warnings: parseResult.errors.filter((e) => e.severity === "warning")
      .length,
    parse_errors: fatalErrors.length,
  });
}

/**
 * GET /api/import?job_id=<id>          — full detail for a single job (for polling & expand)
 * GET /api/import                       — lightweight list of recent jobs (no summary/errors)
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const jobId = url.searchParams.get("job_id");

  if (jobId) {
    // Full detail — includes summary & errors JSONB
    const { data: job, error } = await supabase
      .from("import_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  }

  // Lightweight list — skip heavy JSONB columns for fast page load
  const { data: jobs, error } = await supabase
    .from("import_jobs")
    .select("id, user_id, portfolio_id, source, status, file_name, total_rows, processed_rows, imported_count, skipped_count, failed_count, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(jobs);
}
