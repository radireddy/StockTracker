"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Clock,
  SkipForward,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { ImportJob } from "@/types/database";

type ImportPhase = "select" | "uploading" | "processing" | "done";

/** Lightweight job from the list endpoint (no summary/errors) */
type ImportJobSummaryRow = Omit<ImportJob, "summary" | "errors"> & {
  summary?: ImportJob["summary"];
  errors?: ImportJob["errors"];
};

export default function ImportPage() {
  const { portfolios, selectedId } = usePortfolioContext();
  const holdingsPortfolios = portfolios.filter((p) => p.type === "holdings");

  const [portfolioId, setPortfolioId] = useState(
    holdingsPortfolios.some((p) => p.id === selectedId)
      ? selectedId
      : holdingsPortfolios[0]?.id ?? ""
  );
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ImportPhase>("select");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<ImportJobSummaryRow[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchRecentJobs();
  }, []);

  const fetchRecentJobs = async () => {
    try {
      const res = await fetch("/api/import");
      if (res.ok) setRecentJobs(await res.json());
    } catch {
      /* silent */
    }
  };

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/import?job_id=${jobId}`);
        if (!res.ok) return;
        const updatedJob: ImportJob = await res.json();
        setJob(updatedJob);

        if (
          updatedJob.status === "completed" ||
          updatedJob.status === "failed"
        ) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPhase("done");
          fetchRecentJobs();

          if (updatedJob.status === "completed") {
            const hasFailures = updatedJob.failed_count > 0;
            const hasIncomplete =
              (updatedJob.summary?.symbols_incomplete_history?.length ?? 0) > 0;

            if (hasFailures) {
              toast.warning("Import completed with issues", {
                description: `${updatedJob.imported_count} imported, ${updatedJob.skipped_count} skipped, ${updatedJob.failed_count} failed.`,
                duration: 8000,
              });
            } else if (
              updatedJob.imported_count === 0 &&
              updatedJob.skipped_count > 0
            ) {
              toast.info("All trades already imported", {
                description: `${updatedJob.skipped_count} trades were already in the system.`,
                duration: 6000,
              });
            } else if (hasIncomplete) {
              toast.warning("Import completed — some stocks need older history", {
                description: `${updatedJob.imported_count} trades imported. ${updatedJob.summary!.symbols_incomplete_history!.length} stock(s) have more sells than buys — import older tradebooks.`,
                duration: 10000,
              });
            } else {
              toast.success("Import completed successfully", {
                description: `${updatedJob.imported_count} trades imported${updatedJob.summary?.new_companies_created?.length ? `, ${updatedJob.summary.new_companies_created.length} new stocks added` : ""}.`,
                duration: 6000,
              });
            }
          } else {
            toast.error("Import failed", {
              description:
                "Check the error details below for more information.",
              duration: 8000,
            });
          }
        }
      } catch {
        /* continue polling */
      }
    }, 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setUploadError(null);
  };

  const handleImport = async () => {
    if (!file || !portfolioId) return;
    setPhase("uploading");
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("portfolio_id", portfolioId);
    formData.append("broker", "zerodha");

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const result = await res.json();

      if (!res.ok) {
        setUploadError(result.error);
        setPhase("select");
        toast.error("Upload failed", { description: result.error });
        return;
      }

      setPhase("processing");
      setJob({
        id: result.job_id,
        status: "processing",
        total_rows: result.total_trades,
        processed_rows: 0,
        imported_count: 0,
        skipped_count: 0,
        failed_count: 0,
        file_name: file.name,
        source: result.broker,
      } as ImportJob);
      startPolling(result.job_id);
    } catch {
      setUploadError("Network error. Please try again.");
      setPhase("select");
      toast.error("Upload failed", { description: "Network error" });
    }
  };

  const handleReset = () => {
    setFile(null);
    setPhase("select");
    setJob(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectedPortfolioName =
    holdingsPortfolios.find((p) => p.id === portfolioId)?.name ?? "—";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Main Import Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Trades
          </CardTitle>
          <CardDescription>
            Import your tradebook from Zerodha to automatically track
            transactions, holdings, and CAGR returns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Portfolio selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Portfolio</label>
            {holdingsPortfolios.length === 0 ? (
              <p className="text-sm text-destructive">
                No holdings portfolios found. Create a holdings portfolio first.
              </p>
            ) : (
              <select
                value={portfolioId}
                onChange={(e) => setPortfolioId(e.target.value)}
                disabled={phase !== "select"}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {holdingsPortfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Zerodha Tradebook</label>
            <p className="text-xs text-muted-foreground">
              Download from Zerodha Console &rarr; Reports &rarr; Tradebook
              &rarr; Download as Excel
            </p>
            <div
              className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                file
                  ? "border-primary/50 bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              } ${phase !== "select" ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}
              onClick={() =>
                phase === "select" && fileInputRef.current?.click()
              }
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={phase !== "select"}
                className="hidden"
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click to select your tradebook file (.xlsx)
                  </p>
                </div>
              )}
            </div>
          </div>

          {uploadError && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>{uploadError}</p>
            </div>
          )}

          {phase === "select" && (
            <Button
              onClick={handleImport}
              disabled={!file || !portfolioId}
              className="w-full"
            >
              Import into {selectedPortfolioName}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}

          {(phase === "uploading" || phase === "processing") && job && (
            <ProcessingStatus job={job} />
          )}

          {phase === "done" && job && (
            <ImportResultCard job={job} onReset={handleReset} />
          )}

          {/* Info box */}
          <div className="rounded-md bg-muted/50 p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              How import works:
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
              <li>
                Trades at the same price, on the same day, for the same stock
                are grouped into a single transaction
              </li>
              <li>
                Re-importing the same file is safe — duplicate trades are
                automatically skipped
              </li>
              <li>
                Import files in any order — chronological sorting is handled
                automatically
              </li>
              <li>
                New stocks are added to your portfolio automatically
              </li>
              <li>
                Holdings (quantity, avg price) are recalculated after every
                import
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Import History — collapsible with lazy-loaded details */}
      {recentJobs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Import History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentJobs.map((j) => (
                <ImportHistoryRow key={j.id} job={j} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Processing progress bar ────────────────────────────────────────── */

function ProcessingStatus({ job }: { job: ImportJob }) {
  const progress =
    job.total_rows > 0
      ? Math.round((job.processed_rows / job.total_rows) * 100)
      : 0;

  return (
    <div className="space-y-3 p-4 rounded-lg bg-muted/50">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium">
            Processing {job.file_name ?? "tradebook"}...
          </p>
          <p className="text-xs text-muted-foreground">
            {job.processed_rows} / {job.total_rows} trades processed
          </p>
        </div>
        <span className="text-sm font-medium tabular-nums">{progress}%</span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      {(job.imported_count > 0 || job.skipped_count > 0) && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          {job.imported_count > 0 && (
            <span className="flex items-center gap-1">
              <Plus className="h-3 w-3 text-green-600" />
              {job.imported_count} imported
            </span>
          )}
          {job.skipped_count > 0 && (
            <span className="flex items-center gap-1">
              <SkipForward className="h-3 w-3" />
              {job.skipped_count} skipped
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Result card after an import completes ──────────────────────────── */

function ImportResultCard({
  job,
  onReset,
}: {
  job: ImportJob;
  onReset: () => void;
}) {
  const isSuccess = job.status === "completed";
  const hasFailures = job.failed_count > 0;
  const allSkipped = job.imported_count === 0 && job.skipped_count > 0;

  return (
    <div className="space-y-4">
      <StatusBanner job={job} />

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Imported"
          value={job.imported_count}
          icon={<Plus className="h-3.5 w-3.5" />}
          color="text-green-600"
        />
        <StatCard
          label="Skipped"
          value={job.skipped_count}
          icon={<SkipForward className="h-3.5 w-3.5" />}
          color="text-muted-foreground"
        />
        <StatCard
          label="Failed"
          value={job.failed_count}
          icon={<XCircle className="h-3.5 w-3.5" />}
          color="text-destructive"
        />
      </div>

      <JobDetails job={job} />

      <div className="flex gap-2">
        <Button onClick={onReset} variant="outline" className="flex-1">
          <RefreshCw className="h-4 w-4 mr-2" />
          Import Another File
        </Button>
        <Button
          onClick={() => (window.location.href = "/")}
          className="flex-1"
        >
          Go to Dashboard
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

/* ── Shared status banner ───────────────────────────────────────────── */

function StatusBanner({ job }: { job: ImportJob }) {
  const { label, bg, icon } = getJobVisual(job);

  return (
    <div className={`flex items-center gap-3 p-4 rounded-lg ${bg}`}>
      {icon}
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {job.total_rows} trades in file
        </p>
      </div>
    </div>
  );
}

/* ── Shared detail breakdown (symbols, errors) ──────────────────────── */

function JobDetails({ job }: { job: ImportJob }) {
  return (
    <>
      {job.summary?.new_companies_created &&
        job.summary.new_companies_created.length > 0 && (
          <div className="text-sm">
            <p className="font-medium mb-1">New stocks added:</p>
            <div className="flex flex-wrap gap-1.5">
              {job.summary.new_companies_created.map((s) => (
                <Badge key={s} variant="secondary">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

      {job.summary?.symbols_imported &&
        job.summary.symbols_imported.length > 0 && (
          <div className="text-sm">
            <p className="font-medium mb-1">
              Stocks updated ({job.summary.symbols_imported.length}):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {job.summary.symbols_imported.map((s) => (
                <Badge key={s} variant="outline">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

      {/* Incomplete history warning */}
      {job.summary?.symbols_incomplete_history &&
        job.summary.symbols_incomplete_history.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-400">
                Incomplete trade history
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                These stocks have more sells than buys in the imported data.
                Import older tradebooks to get correct holdings and avg buy
                price.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {job.summary.symbols_incomplete_history.map((s) => (
                  <Badge key={s} variant="outline" className="border-yellow-500/50 text-yellow-700 dark:text-yellow-400">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

      {job.errors && job.errors.length > 0 && (
        <div className="text-sm">
          <p className="font-medium mb-1 text-destructive">
            Issues ({job.errors.length}):
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1 rounded-md bg-muted/50 p-2">
            {job.errors.map((e, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {e.symbol && (
                  <span className="font-medium text-foreground">
                    {e.symbol}:{" "}
                  </span>
                )}
                {e.message}
              </p>
            ))}
          </div>
          {job.failed_count > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Failed trades were not imported. You can fix the issues and
              re-import — only new trades will be added.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/* ── Import history row — collapsible, lazy-loads details on expand ── */

function ImportHistoryRow({ job }: { job: ImportJobSummaryRow }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ImportJob | null>(null);
  const [loading, setLoading] = useState(false);

  const { badge, badgeClass } = getJobBadge(job);

  const handleToggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    // Only fetch if we haven't already
    if (!detail) {
      setLoading(true);
      try {
        const res = await fetch(`/api/import?job_id=${job.id}`);
        if (res.ok) {
          setDetail(await res.json());
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div>
      {/* Collapsed row header */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">
            {job.file_name ?? "Tradebook"}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(job.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Mini stats */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
            {job.imported_count > 0 && (
              <span className="text-green-600">+{job.imported_count}</span>
            )}
            {job.skipped_count > 0 && (
              <span>{job.skipped_count} skip</span>
            )}
            {job.failed_count > 0 && (
              <span className="text-destructive">
                {job.failed_count} fail
              </span>
            )}
          </div>
          <Badge variant="secondary" className={badgeClass}>
            {badge}
          </Badge>
        </div>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 ml-7 border-l-2 border-muted ml-[1.625rem]">
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading details...
            </div>
          ) : detail ? (
            <div className="space-y-3">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                <MiniStat
                  label="Imported"
                  value={detail.imported_count}
                  color="text-green-600"
                />
                <MiniStat
                  label="Skipped"
                  value={detail.skipped_count}
                  color="text-muted-foreground"
                />
                <MiniStat
                  label="Failed"
                  value={detail.failed_count}
                  color="text-destructive"
                />
              </div>

              {/* Source info */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Source: <span className="text-foreground capitalize">{detail.source}</span>
                </span>
                <span>
                  Total trades: <span className="text-foreground">{detail.total_rows}</span>
                </span>
                {detail.summary?.client_id && (
                  <span>
                    Account: <span className="text-foreground">{detail.summary.client_id}</span>
                  </span>
                )}
              </div>

              <JobDetails job={detail} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2">
              Failed to load details.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Small helper components ────────────────────────────────────────── */

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="text-center p-3 rounded-md bg-muted/50">
      <div className={`flex items-center justify-center gap-1 ${color}`}>
        {icon}
        <span className="text-lg font-semibold tabular-nums">{value}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center py-1.5 px-2 rounded bg-muted/50">
      <span className={`text-sm font-semibold tabular-nums ${color}`}>
        {value}
      </span>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

/* ── Visual helpers for job status ──────────────────────────────────── */

type JobLike = {
  status: string;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
};

function getJobVisual(job: JobLike) {
  if (job.status === "failed") {
    return {
      label: "Import failed",
      bg: "bg-destructive/10",
      icon: <XCircle className="h-5 w-5 text-destructive" />,
    };
  }
  if (job.status === "processing" || job.status === "pending") {
    return {
      label: "Processing...",
      bg: "bg-blue-500/10",
      icon: <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />,
    };
  }
  // completed
  if (job.failed_count > 0) {
    return {
      label: "Partial success",
      bg: "bg-yellow-500/10",
      icon: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
    };
  }
  if (job.imported_count === 0 && job.skipped_count > 0) {
    return {
      label: "All trades already imported",
      bg: "bg-muted/50",
      icon: <SkipForward className="h-5 w-5 text-muted-foreground" />,
    };
  }
  return {
    label: "Import successful",
    bg: "bg-green-500/10",
    icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
  };
}

function getJobBadge(job: JobLike): { badge: string; badgeClass: string } {
  if (job.status === "failed") {
    return { badge: "Failed", badgeClass: "bg-destructive/10 text-destructive" };
  }
  if (job.status === "processing" || job.status === "pending") {
    return { badge: "Processing", badgeClass: "bg-blue-500/10 text-blue-700" };
  }
  // completed
  if (job.failed_count > 0) {
    return {
      badge: "Partial",
      badgeClass: "bg-yellow-500/10 text-yellow-700",
    };
  }
  if (job.imported_count === 0 && job.skipped_count > 0) {
    return {
      badge: "Skipped",
      badgeClass: "bg-muted text-muted-foreground",
    };
  }
  return {
    badge: "Success",
    badgeClass: "bg-green-500/10 text-green-700",
  };
}
