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
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
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
  Scissors,
  Gift,
  GitBranch,
  ArrowLeftRight,
  Tag,
  Check,
} from "lucide-react";
import { OwnerPicker } from "@/components/owner/owner-picker";
import type { ImportJob, ImportAnomaly } from "@/types/database";

type ImportPhase = "select" | "uploading" | "processing" | "done";

/** Tracks per-file result when processing multiple files */
type FileResult = {
  file: File;
  job: ImportJob | null;
  error: string | null;
};

/** Lightweight job from the list endpoint (no summary/errors) */
type ImportJobSummaryRow = Omit<ImportJob, "summary" | "errors"> & {
  summary?: ImportJob["summary"];
  errors?: ImportJob["errors"];
};

export default function ImportPage() {
  const { portfolios, selectedId } = usePortfolioContext();
  const invalidateDashboard = useInvalidateDashboard();
  const holdingsPortfolios = portfolios.filter((p) => p.type === "holdings");

  const [portfolioId, setPortfolioId] = useState(
    holdingsPortfolios.some((p) => p.id === selectedId)
      ? selectedId
      : holdingsPortfolios[0]?.id ?? ""
  );
  const [ownerId, setOwnerId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<ImportPhase>("select");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<ImportJobSummaryRow[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Multi-file tracking
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const abortRef = useRef(false);
  // Corporate action anomalies detected after all files finish
  const [detectedAnomalies, setDetectedAnomalies] = useState<ImportAnomaly[]>([]);

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

  /** Poll a single job until it completes/fails, then resolve with final job */
  const waitForJob = useCallback((jobId: string): Promise<ImportJob> => {
    return new Promise((resolve) => {
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
            resolve(updatedJob);
          }
        } catch {
          /* continue polling */
        }
      }, 1500);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) {
      setFiles([]);
    } else {
      setFiles(Array.from(selected));
    }
    setUploadError(null);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    // Reset the input so the same files can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** Upload and process a single file, return the result */
  const processOneFile = async (file: File): Promise<FileResult> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("portfolio_id", portfolioId);
    formData.append("owner_id", ownerId);
    formData.append("broker", "zerodha");

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const result = await res.json();

      if (!res.ok) {
        return { file, job: null, error: result.error };
      }

      setPhase("processing");
      const initialJob = {
        id: result.job_id,
        status: "processing",
        total_rows: result.total_trades,
        processed_rows: 0,
        imported_count: 0,
        skipped_count: 0,
        failed_count: 0,
        file_name: file.name,
        source: result.broker,
      } as ImportJob;
      setJob(initialJob);

      const finalJob = await waitForJob(result.job_id);
      return { file, job: finalJob, error: null };
    } catch {
      return { file, job: null, error: "Network error. Please try again." };
    }
  };

  const handleImport = async () => {
    if (files.length === 0 || !portfolioId || !ownerId) return;
    setPhase("uploading");
    setUploadError(null);
    setFileResults([]);
    setCurrentFileIndex(0);
    abortRef.current = false;

    const results: FileResult[] = [];

    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) break;
      setCurrentFileIndex(i);
      setPhase("uploading");

      const result = await processOneFile(files[i]);
      results.push(result);
      setFileResults([...results]);

      // Show per-file toast
      if (result.error) {
        toast.error(`Failed: ${files[i].name}`, { description: result.error });
      } else if (result.job?.status === "completed") {
        const j = result.job;
        if (j.failed_count > 0) {
          toast.warning(`${files[i].name}: partial`, {
            description: `${j.imported_count} imported, ${j.failed_count} failed`,
          });
        } else if (j.imported_count === 0 && j.skipped_count > 0) {
          toast.info(`${files[i].name}: all skipped`, {
            description: `${j.skipped_count} already imported`,
          });
        } else {
          toast.success(`${files[i].name}: done`, {
            description: `${j.imported_count} imported`,
          });
        }
      } else if (result.job?.status === "failed") {
        toast.error(`Failed: ${files[i].name}`);
      }
    }

    // Run corporate action detection after ALL files are processed.
    // Always runs (not just when new trades imported) because:
    // - User may upload files one-by-one across sessions
    // - Each run clears stale pending detections and re-analyzes the full dataset
    // - A false positive from file 1 gets resolved when file 2 adds the missing buys
    setDetectedAnomalies([]);
    try {
      const detectRes = await fetch("/api/corporate-actions/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio_id: portfolioId, owner_id: ownerId }),
      });
      if (detectRes.ok) {
        const { anomalies } = await detectRes.json();
        if (anomalies && anomalies.length > 0) {
          setDetectedAnomalies(anomalies);
        }
      }
    } catch {
      // Non-fatal — detection failure shouldn't block import results
    }

    setPhase("done");
    invalidateDashboard();
    fetchRecentJobs();
  };

  const handleReset = () => {
    setFiles([]);
    setPhase("select");
    setJob(null);
    setUploadError(null);
    setFileResults([]);
    setCurrentFileIndex(0);
    abortRef.current = false;
    setDetectedAnomalies([]);
    // Keep ownerId for convenience (likely re-importing for same person)
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectedPortfolioName =
    holdingsPortfolios.find((p) => p.id === portfolioId)?.name ?? "—";

  const isMultiFile = files.length > 1;

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

          {/* Owner picker */}
          <OwnerPicker
            value={ownerId}
            onChange={setOwnerId}
            disabled={phase !== "select"}
          />

          {/* File upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Zerodha Tradebook</label>
            <p className="text-xs text-muted-foreground">
              Download from Zerodha Console &rarr; Reports &rarr; Tradebook
              &rarr; Download as Excel. You can select multiple files at once.
            </p>
            <div
              className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                files.length > 0
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
                multiple
                onChange={handleFileChange}
                disabled={phase !== "select"}
                className="hidden"
              />
              {files.length > 0 ? (
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {f.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(f.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      {phase === "select" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(i);
                          }}
                          className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {phase === "select" && (
                    <p className="text-xs text-muted-foreground pt-1">
                      {files.length} file{files.length > 1 ? "s" : ""} selected
                      — click to change
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click to select tradebook files (.xlsx) — multiple allowed
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
              disabled={files.length === 0 || !portfolioId || !ownerId}
              className="w-full"
            >
              Import {files.length > 1 ? `${files.length} files` : ""} into{" "}
              {selectedPortfolioName}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}

          {(phase === "uploading" || phase === "processing") && (
            <div className="space-y-3">
              {/* Multi-file overall progress */}
              {isMultiFile && (
                <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                  <span>
                    File {currentFileIndex + 1} of {files.length}:{" "}
                    <span className="text-foreground font-medium">
                      {files[currentFileIndex]?.name}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {fileResults.length}/{files.length} done
                  </span>
                </div>
              )}
              {job && <ProcessingStatus job={job} />}
              {/* Already-completed files in this batch */}
              {fileResults.length > 0 && (
                <div className="space-y-1">
                  {fileResults.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs px-1"
                    >
                      {r.error ? (
                        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      ) : r.job?.status === "completed" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      )}
                      <span className="truncate">{r.file.name}</span>
                      {r.job && (
                        <span className="text-muted-foreground ml-auto shrink-0">
                          +{r.job.imported_count} / {r.job.skipped_count} skip
                        </span>
                      )}
                      {r.error && (
                        <span className="text-destructive ml-auto shrink-0 truncate max-w-[200px]">
                          {r.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {phase === "done" && fileResults.length > 0 && (
            <MultiFileResultCard results={fileResults} onReset={handleReset} />
          )}
          {phase === "done" && fileResults.length === 0 && job && (
            <ImportResultCard job={job} onReset={handleReset} />
          )}

          {/* Corporate action anomalies — shown after all files processed */}
          {phase === "done" && detectedAnomalies.length > 0 && (
            <AnomalyList anomalies={detectedAnomalies} />
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
                You can select multiple files at once — they are processed
                sequentially in order
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

/* ── Corporate action anomaly list ────────────────────────────────── */

const ANOMALY_ICONS: Record<ImportAnomaly["type"], React.ReactNode> = {
  STOCK_SPLIT: <Scissors className="h-4 w-4" />,
  BONUS: <Gift className="h-4 w-4" />,
  DEMERGER: <GitBranch className="h-4 w-4" />,
  MERGER: <ArrowLeftRight className="h-4 w-4" />,
  SYMBOL_RENAME: <Tag className="h-4 w-4" />,
};

const ANOMALY_LABELS: Record<ImportAnomaly["type"], string> = {
  STOCK_SPLIT: "Stock Split",
  BONUS: "Bonus Issue",
  DEMERGER: "Demerger",
  MERGER: "Merger",
  SYMBOL_RENAME: "Symbol Rename",
};

const CONFIDENCE_COLORS: Record<ImportAnomaly["confidence"], string> = {
  high: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  medium: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
  low: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
};

function AnomalyList({ anomalies }: { anomalies: ImportAnomaly[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 p-3 rounded-md bg-orange-500/10 text-sm">
        <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-orange-800 dark:text-orange-400">
            Corporate actions detected ({anomalies.length})
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            These stocks may have had splits, bonuses, or other corporate actions
            that affect your holdings. Review each item and confirm or dismiss.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {anomalies.map((a, i) => (
          <AnomalyCard key={`${a.symbol}-${a.type}-${i}`} anomaly={a} />
        ))}
      </div>

      <a
        href="/corporate-actions"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        Manage all corporate actions
        <ArrowRight className="h-3 w-3" />
      </a>
    </div>
  );
}

function AnomalyCard({ anomaly }: { anomaly: ImportAnomaly }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border bg-card text-card-foreground">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <span className="text-muted-foreground shrink-0">
          {ANOMALY_ICONS[anomaly.type]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-primary">{anomaly.symbol}</span>
            <span className="text-sm text-muted-foreground truncate">{anomaly.description}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {ANOMALY_LABELS[anomaly.type]}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${CONFIDENCE_COLORS[anomaly.confidence]}`}
            >
              {anomaly.confidence} confidence
            </Badge>
            {anomaly.suggested_ratio_from != null && anomaly.suggested_ratio_to != null && (
              <span className="text-[10px] text-muted-foreground">
                Ratio: {anomaly.suggested_ratio_from}:{anomaly.suggested_ratio_to}
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {anomaly.details}
          </p>

          {(anomaly.estimated_date_from || anomaly.estimated_date_to) && (
            <p className="text-xs text-muted-foreground">
              Estimated period:{" "}
              <span className="text-foreground">
                {anomaly.estimated_date_from ?? "?"} to{" "}
                {anomaly.estimated_date_to ?? "?"}
              </span>
            </p>
          )}

          {anomaly.new_isin && (
            <p className="text-xs text-muted-foreground">
              New ISIN: <span className="text-foreground font-mono">{anomaly.new_isin}</span>
            </p>
          )}

          <p className="text-xs text-muted-foreground italic">
            Go to{" "}
            <a href="/corporate-actions" className="text-primary hover:underline">
              Corporate Actions
            </a>{" "}
            to confirm, edit details, or dismiss this detection.
          </p>
        </div>
      )}
    </div>
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

/* ── Multi-file result card ─────────────────────────────────────────── */

function MultiFileResultCard({
  results,
  onReset,
}: {
  results: FileResult[];
  onReset: () => void;
}) {
  const totals = results.reduce(
    (acc, r) => {
      if (r.job) {
        acc.imported += r.job.imported_count;
        acc.skipped += r.job.skipped_count;
        acc.failed += r.job.failed_count;
        if (r.job.status === "completed") acc.succeeded++;
        else acc.jobFailed++;
      } else {
        acc.uploadFailed++;
      }
      return acc;
    },
    { imported: 0, skipped: 0, failed: 0, succeeded: 0, jobFailed: 0, uploadFailed: 0 }
  );

  const allGood = totals.jobFailed === 0 && totals.uploadFailed === 0 && totals.failed === 0;

  return (
    <div className="space-y-4">
      {/* Overall banner */}
      <div
        className={`flex items-center gap-3 p-4 rounded-lg ${
          allGood ? "bg-green-500/10" : "bg-yellow-500/10"
        }`}
      >
        {allGood ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium">
            {results.length} file{results.length > 1 ? "s" : ""} processed
          </p>
          <p className="text-xs text-muted-foreground">
            {totals.imported} trades imported, {totals.skipped} skipped
            {totals.failed > 0 ? `, ${totals.failed} failed` : ""}
          </p>
        </div>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Imported"
          value={totals.imported}
          icon={<Plus className="h-3.5 w-3.5" />}
          color="text-green-600"
        />
        <StatCard
          label="Skipped"
          value={totals.skipped}
          icon={<SkipForward className="h-3.5 w-3.5" />}
          color="text-muted-foreground"
        />
        <StatCard
          label="Failed"
          value={totals.failed}
          icon={<XCircle className="h-3.5 w-3.5" />}
          color="text-destructive"
        />
      </div>

      {/* Per-file breakdown */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Per-file results:</p>
        <div className="rounded-md bg-muted/50 divide-y divide-border">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
              {r.error ? (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              ) : r.job?.status === "completed" && r.job.failed_count === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              ) : r.job?.status === "completed" ? (
                <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
              <span className="truncate min-w-0 flex-1">{r.file.name}</span>
              {r.job && (
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  +{r.job.imported_count} / {r.job.skipped_count} skip
                  {r.job.failed_count > 0
                    ? ` / ${r.job.failed_count} fail`
                    : ""}
                </span>
              )}
              {r.error && (
                <span className="text-xs text-destructive shrink-0 truncate max-w-[200px]">
                  {r.error}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Show details from the last successful job (incomplete history etc) */}
      {results
        .filter((r) => r.job?.status === "completed")
        .map((r, i) => {
          const j = r.job!;
          const hasDetails =
            (j.summary?.symbols_incomplete_history?.length ?? 0) > 0 ||
            (j.errors && j.errors.length > 0);
          if (!hasDetails) return null;
          return (
            <div key={i} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Details for {r.file.name}:
              </p>
              <JobDetails job={j} />
            </div>
          );
        })}

      <div className="flex gap-2">
        <Button onClick={onReset} variant="outline" className="flex-1">
          <RefreshCw className="h-4 w-4 mr-2" />
          Import More Files
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
