import { getAuthUserOrNull } from "@/lib/supabase/server";
import { detectBroker, getBrokerAdapter } from "@/lib/import/broker-registry";
import { executeImport } from "@/lib/import/import-engine";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { BrokerType } from "@/lib/import/types";

const log = createLogger({ service: "import-api" });

/**
 * POST /api/import
 * Upload a broker tradebook for async processing.
 * Requires portfolio_id and owner_id.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, RATE_LIMITS.import);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const portfolioId = formData.get("portfolio_id") as string;
  if (!portfolioId)
    return NextResponse.json({ error: "No portfolio selected" }, { status: 400 });

  const ownerId = formData.get("owner_id") as string;
  if (!ownerId)
    return NextResponse.json({ error: "No owner selected. Please select who this tradebook belongs to." }, { status: 400 });

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

  // Validate owner
  const { data: owner, error: oErr } = await supabase
    .from("portfolio_owners")
    .select("id, name")
    .eq("id", ownerId)
    .single();

  if (oErr || !owner) {
    return NextResponse.json({ error: "Owner not found" }, { status: 404 });
  }

  // Parse the file
  const buffer = await file.arrayBuffer();

  // Validate ZIP magic bytes (XLSX = ZIP format)
  const bytes = new Uint8Array(buffer.slice(0, 4));
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (!isZip) {
    return NextResponse.json({ error: "Invalid file format. Please upload a valid .xlsx file." }, { status: 400 });
  }

  // Enforce 5MB limit for import files
  const MAX_IMPORT_SIZE = 5 * 1024 * 1024;
  if (buffer.byteLength > MAX_IMPORT_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum import file size is 5MB." }, { status: 400 });
  }

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
      owner_id: ownerId,
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
  executeImport(user.id, portfolioId, ownerId, jobId, parseResult, supabase).catch(
    (err) => {
      log.error("Import processing crashed", {
        jobId,
        error: (err as Error).message,
      });
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
    owner_name: owner.name,
    parse_warnings: parseResult.errors.filter((e) => e.severity === "warning")
      .length,
    parse_errors: fatalErrors.length,
  });
}

/**
 * GET /api/import?job_id=<id>          — full detail for a single job
 * GET /api/import                       — lightweight list of recent jobs
 */
export async function GET(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, RATE_LIMITS.import);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("job_id");

  if (jobId) {
    const { data: job, error } = await supabase
      .from("import_jobs")
      .select("*, portfolio_owners(name)")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  }

  const { data: jobs, error } = await supabase
    .from("import_jobs")
    .select("id, user_id, portfolio_id, owner_id, source, status, file_name, total_rows, processed_rows, imported_count, skipped_count, failed_count, created_at, updated_at, portfolio_owners(name)")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(jobs);
}

/**
 * DELETE /api/import?job_id=<id>  — delete a single import job
 * DELETE /api/import              — delete all import jobs for the user
 */
export async function DELETE(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, RATE_LIMITS.import);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("job_id");

  if (jobId) {
    const { error } = await supabase
      .from("import_jobs")
      .delete()
      .eq("id", jobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Delete all jobs for this user
  const { error } = await supabase
    .from("import_jobs")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
