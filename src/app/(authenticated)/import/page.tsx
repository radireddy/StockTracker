"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import { getAccounts } from "@/app/(authenticated)/actions/account-actions";
import { classifyDetection } from "@/lib/accounts";
import type { Account } from "@/types/database";
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
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Lock,
} from "lucide-react";

/** Result returned synchronously by POST /api/import. */
type ImportResponse = {
  import_id: string;
  broker_name: string;
  status: "completed" | "failed";
  is_reimport: boolean;
  account_id: string;
  account_label: string;
  imported_count: number;
  skipped_count: number;
  companies_count: number;
  new_companies_created: string[];
  symbols_imported: string[];
  symbols_skipped: string[];
  statement_date: string | null;
  client_id: string | null;
  errors: { symbol?: string; message: string }[];
};

type FileResult = { file: File; result: ImportResponse | null; error: string | null };

type HistoryRow = {
  id: string;
  file_name: string | null;
  statement_date: string | null;
  status: string;
  is_reimport: boolean;
  companies_count: number;
  imported_count: number;
  created_at: string;
  accounts?: { label: string; broker: string } | null;
};

/** Per-file account detection result from POST /api/import/detect. */
type DetectResult = {
  file_name: string;
  broker: string | null;
  client_id: string | null;
  statement_date: string | null;
  stock_count: number;
  matched_account: { id: string; label: string } | null;
  parse_error: string | null;
};

/** How the user chose to route each file's holdings on the review screen. */
type Resolution =
  | { mode: "matched" }
  | { mode: "create"; accountLabel: string }
  | { mode: "link"; accountId: string }
  | { mode: "error" };

type Phase = "select" | "review" | "importing" | "done";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ImportPage() {
  const { portfolios, selectedId } = usePortfolioContext();
  const invalidateDashboard = useInvalidateDashboard();
  const holdingsPortfolios = portfolios.filter((p) => p.type === "holdings");

  const [portfolioId, setPortfolioId] = useState(
    holdingsPortfolios.some((p) => p.id === selectedId) ? selectedId : holdingsPortfolios[0]?.id ?? ""
  );
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("select");
  const [results, setResults] = useState<FileResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [detections, setDetections] = useState<DetectResult[]>([]);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [detecting, setDetecting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The upload form renders immediately; import history is lazy-fetched after
  // paint so it never blocks the page. Also re-run to refresh after an import.
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/import");
      if (res.ok) setHistory(await res.json());
    } catch {
      /* silent */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred on-mount fetch; setState happens after the awaited response,
    // not synchronously — this is the intended effect behaviour.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHistory();
  }, [fetchHistory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    setFiles(selected && selected.length > 0 ? Array.from(selected) : []);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Parse-only pre-flight: detect each file's account and move to the review step.
  const handleContinue = async () => {
    if (files.length === 0 || !portfolioId) return;
    setDetecting(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      formData.append("broker", "zerodha");
      const [res, accts] = await Promise.all([
        fetch("/api/import/detect", { method: "POST", body: formData }),
        getAccounts().catch(() => [] as Account[]),
      ]);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error("Couldn't read the statement(s)", { description: body.error ?? "Please try again." });
        return;
      }
      const { results } = (await res.json()) as { results: DetectResult[] };
      setAccounts(accts);
      setDetections(results);
      setResolutions(
        results.map((d): Resolution => {
          if (d.parse_error) return { mode: "error" };
          switch (classifyDetection({ clientId: d.client_id, matchedAccountId: d.matched_account?.id ?? null })) {
            case "matched":
              return { mode: "matched" };
            case "unmatched":
              // Client ID present but no confident account match. Default to linking
              // (blank, user must choose) rather than creating, so holdings aren't
              // silently imported into a wrong/new account. Fall back to create only
              // when there are no accounts to link to.
              return accts.length > 0
                ? { mode: "link", accountId: "" }
                : { mode: "create", accountLabel: `${d.client_id} (${capitalize(d.broker ?? "broker")})` };
            case "no-client-id":
              return { mode: "link", accountId: "" };
          }
        })
      );
      setPhase("review");
    } catch {
      toast.error("Network error", { description: "Couldn't reach the server. Please try again." });
    } finally {
      setDetecting(false);
    }
  };

  const importOne = async (file: File, resolution: Resolution): Promise<FileResult> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("portfolio_id", portfolioId);
    formData.append("broker", "zerodha");
    if (resolution.mode === "link") formData.append("account_id", resolution.accountId);
    else if (resolution.mode === "create") formData.append("account_label", resolution.accountLabel);
    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) return { file, result: null, error: body.error ?? "Import failed" };
      return { file, result: body as ImportResponse, error: null };
    } catch {
      return { file, result: null, error: "Network error. Please try again." };
    }
  };

  const handleImport = async () => {
    if (files.length === 0 || !portfolioId) return;
    setPhase("importing");
    setResults([]);
    setCurrentIndex(0);

    const collected: FileResult[] = [];
    for (let i = 0; i < files.length; i++) {
      // Files that failed to parse are surfaced as errors and never committed.
      if (resolutions[i]?.mode === "error") {
        collected.push({ file: files[i], result: null, error: detections[i]?.parse_error ?? "Could not read this file." });
        setResults([...collected]);
        toast.error(`Skipped: ${files[i].name}`, { description: detections[i]?.parse_error ?? "Could not read this file." });
        continue;
      }
      setCurrentIndex(i);
      const r = await importOne(files[i], resolutions[i]);
      collected.push(r);
      setResults([...collected]);

      if (r.error) {
        toast.error(`Failed: ${files[i].name}`, { description: r.error });
      } else if (r.result) {
        const verb = r.result.is_reimport ? "Replaced" : "Imported";
        toast.success(`${files[i].name}: ${r.result.account_label}`, {
          description: `${verb} ${r.result.companies_count} stock(s)`,
        });
      }
    }

    setPhase("done");
    invalidateDashboard();
    fetchHistory();
  };

  const handleReset = () => {
    setFiles([]);
    setPhase("select");
    setResults([]);
    setCurrentIndex(0);
    setDetections([]);
    setResolutions([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Every non-error file must be resolved before committing: link rows need an account chosen.
  const commitReady =
    detections.length > 0 &&
    resolutions.some((r) => r.mode !== "error") &&
    resolutions.every((r) => r.mode !== "link" || r.accountId !== "");

  const handleDeleteHistory = async (id: string) => {
    const res = await fetch(`/api/import?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setHistory((prev) => prev.filter((h) => h.id !== id));
      toast.success("Import record deleted");
    } else {
      toast.error("Failed to delete record");
    }
  };

  const handleClearHistory = async () => {
    const res = await fetch("/api/import", { method: "DELETE" });
    if (res.ok) {
      setHistory([]);
      toast.success("Import history cleared");
    } else {
      toast.error("Failed to clear history");
    }
  };

  const selectedPortfolioName = holdingsPortfolios.find((p) => p.id === portfolioId)?.name ?? "—";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Data"
        title="Import Holdings"
        description="Import a Zerodha holdings statement. Each statement is a snapshot for one account; re-importing an account replaces its existing holdings."
      />
      <Card className="shadow-soft">
        <CardContent className="space-y-5">
          {/* Portfolio selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Portfolio <span className="text-destructive">*</span></label>
            {holdingsPortfolios.length === 0 ? (
              <p className="text-sm text-destructive">
                No holdings portfolios found. Create a holdings portfolio first.
              </p>
            ) : (
              <select
                value={portfolioId}
                onChange={(e) => setPortfolioId(e.target.value)}
                disabled={phase !== "select"}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
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
            <label className="text-sm font-medium">Zerodha Holdings Statement <span className="text-destructive">*</span></label>
            <p className="text-xs text-muted-foreground">
              Zerodha Console &rarr; Reports &rarr; Holdings &rarr; Download as Excel.
              The account is detected automatically from the statement. You can select
              multiple files (e.g. one per account).
            </p>
            <div
              className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                files.length > 0
                  ? "border-primary/50 bg-primary/5"
                  : "border-muted-foreground/40 hover:border-muted-foreground/60"
              } ${phase !== "select" ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}
              onClick={() => phase === "select" && fileInputRef.current?.click()}
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
                    <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 text-left">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{f.name}</p>
                          <p className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      {phase === "select" && (
                        <button
                          type="button"
                          aria-label={`Remove ${f.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(i);
                          }}
                          className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                        >
                          <XCircle className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click to select holdings statement(s) (.xlsx)
                  </p>
                </div>
              )}
            </div>
          </div>

          {phase === "select" && (
            <>
              <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span>
                  Your statement is stored under your account only and is never visible to other users.
                  Settings → Delete Account removes it permanently.
                </span>
              </div>
              <Button className="w-full" disabled={files.length === 0 || !portfolioId || detecting} onClick={handleContinue}>
                {detecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Continue{files.length > 1 ? ` (${files.length} files)` : ""}
                {!detecting && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
            </>
          )}

          {phase === "review" && (
            <ReviewList
              detections={detections}
              resolutions={resolutions}
              accounts={accounts}
              portfolioName={selectedPortfolioName}
              commitReady={commitReady}
              onChange={(i, r) => setResolutions((prev) => prev.map((p, idx) => (idx === i ? r : p)))}
              onBack={() => setPhase("select")}
              onConfirm={handleImport}
            />
          )}

          {phase === "importing" && (
            <div role="status" aria-live="polite" className="flex items-center gap-3 p-4 rounded-lg bg-primary/10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm font-medium">
                Importing {files[currentIndex]?.name} ({currentIndex + 1}/{files.length})…
              </p>
            </div>
          )}

          {phase === "done" && <ResultList results={results} onReset={handleReset} />}

          {/* Info box */}
          <div className="rounded-md bg-muted/50 p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">How import works:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
              <li>The account is auto-detected from the statement&rsquo;s Client ID.</li>
              <li>Re-importing an account&rsquo;s statement replaces its holdings (including manual edits).</li>
              <li>Consolidated view sums positions across all accounts; filter by account on the dashboard.</li>
              <li>New stocks are added to your portfolio automatically.</li>
              <li>Statements are limited to 100 stocks for now.</li>
              <li>Your data is isolated per user with row-level security — only you can see it.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Import history — lazy-loaded; show a placeholder until it arrives */}
      {historyLoading ? (
        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Import History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading import history…
            </div>
          </CardContent>
        </Card>
      ) : history.length > 0 && (
        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Import History
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={handleClearHistory}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {h.accounts?.label ?? "Account"}
                      {h.is_reimport && (
                        <RotateCcw className="inline h-3 w-3 ml-1.5 text-muted-foreground" aria-label="reimport" />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {h.file_name ?? "statement"}
                      {h.statement_date ? ` · as on ${h.statement_date}` : ""}
                      {" · "}
                      {new Date(h.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {h.companies_count} stocks
                    </span>
                    <Badge
                      variant="secondary"
                      className={
                        h.status === "failed"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-positive/10 text-positive"
                      }
                    >
                      {h.status === "failed" ? "Failed" : h.is_reimport ? "Replaced" : "Imported"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete import record for ${h.accounts?.label ?? "account"}`}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleDeleteHistory(h.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Review step: link or create an account per file, before committing ─ */

function ReviewList({
  detections,
  resolutions,
  accounts,
  portfolioName,
  commitReady,
  onChange,
  onBack,
  onConfirm,
}: {
  detections: DetectResult[];
  resolutions: Resolution[];
  accounts: Account[];
  portfolioName: string;
  commitReady: boolean;
  onChange: (index: number, resolution: Resolution) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Review how each statement will be imported into <strong>{portfolioName}</strong>.
      </p>

      <div className="space-y-3">
        {detections.map((d, i) => {
          const r = resolutions[i];
          return (
            <div key={`${d.file_name}-${i}`} className="rounded-md border border-border/60 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{d.file_name}</span>
                {!d.parse_error && (
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {d.stock_count} stocks{d.client_id ? ` · ${d.client_id}` : ""}
                  </span>
                )}
              </div>

              {d.parse_error ? (
                <p className="flex items-start gap-2 text-xs text-destructive">
                  <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {d.parse_error} — this file will be skipped.
                </p>
              ) : r?.mode === "matched" ? (
                <p className="flex items-center gap-2 text-sm">
                  <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Will replace holdings in <strong>{d.matched_account?.label}</strong>
                </p>
              ) : d.client_id ? (
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name={`res-${i}`}
                      className="mt-1"
                      checked={r?.mode === "create"}
                      onChange={() =>
                        onChange(i, { mode: "create", accountLabel: `${d.client_id} (${capitalize(d.broker ?? "broker")})` })
                      }
                    />
                    <span className="flex-1 space-y-1">
                      <span className="block">Create a new account</span>
                      {r?.mode === "create" && (
                        <Input
                          aria-label={`New account name for ${d.file_name}`}
                          value={r.accountLabel}
                          onChange={(e) => onChange(i, { mode: "create", accountLabel: e.target.value })}
                          className="h-8"
                        />
                      )}
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name={`res-${i}`}
                      className="mt-1"
                      checked={r?.mode === "link"}
                      onChange={() => onChange(i, { mode: "link", accountId: "" })}
                      disabled={accounts.length === 0}
                    />
                    <span className="flex-1 space-y-1">
                      <span className="block">
                        Link to an existing account{" "}
                        <span className="text-muted-foreground">(sets its Client ID for next time)</span>
                      </span>
                      {r?.mode === "link" && (
                        <select
                          aria-label={`Account to link for ${d.file_name}`}
                          value={r.accountId}
                          onChange={(e) => onChange(i, { mode: "link", accountId: e.target.value })}
                          className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        >
                          <option value="" disabled>
                            Select account…
                          </option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </span>
                  </label>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="flex items-start gap-2 text-xs text-warning">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    No Client ID in this statement — choose which account it belongs to.
                  </p>
                  {accounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No accounts yet. Create one in Settings, then import again.
                    </p>
                  ) : (
                    <select
                      aria-label={`Account for ${d.file_name}`}
                      value={r?.mode === "link" ? r.accountId : ""}
                      onChange={(e) => onChange(i, { mode: "link", accountId: e.target.value })}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="" disabled>
                        Select account…
                      </option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" disabled={!commitReady} onClick={onConfirm}>
          Import
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

/* ── Result list after import ───────────────────────────────────────── */

function ResultList({ results, onReset }: { results: FileResult[]; onReset: () => void }) {
  const totalStocks = results.reduce((s, r) => s + (r.result?.companies_count ?? 0), 0);
  const anyError = results.some((r) => r.error || r.result?.status === "failed");

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-3 p-4 rounded-lg ${anyError ? "bg-warning/10" : "bg-positive/10"}`}>
        {anyError ? (
          <AlertTriangle className="h-5 w-5 text-warning" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-positive" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium">
            {results.length} statement{results.length > 1 ? "s" : ""} processed
          </p>
          <p className="text-xs text-muted-foreground">{totalStocks} stock position(s) recorded</p>
        </div>
      </div>

      <div className="space-y-3">
        {results.map((r, i) => (
          <div key={i} className="rounded-md border border-border/60 p-3 space-y-2">
            <div className="flex items-center gap-2">
              {r.error ? (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-positive shrink-0" />
              )}
              <span className="text-sm font-medium truncate">{r.file.name}</span>
              {r.result && (
                <Badge variant="outline" className="ml-auto">
                  {r.result.is_reimport ? "Replaced" : "New"} · {r.result.account_label}
                </Badge>
              )}
            </div>

            {r.error && <p className="text-xs text-destructive">{r.error}</p>}

            {r.result && (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Plus className="h-3 w-3 text-positive" />
                    {r.result.companies_count} stocks
                  </span>
                  {r.result.statement_date && <span>as on {r.result.statement_date}</span>}
                  {r.result.client_id && <span>Client {r.result.client_id}</span>}
                </div>

                {r.result.new_companies_created.length > 0 && (
                  <div className="text-xs">
                    <span className="font-medium">New stocks added: </span>
                    <span className="text-muted-foreground">
                      {r.result.new_companies_created.join(", ")}
                    </span>
                  </div>
                )}

                {r.result.errors.length > 0 && (
                  <div className="max-h-28 overflow-y-auto space-y-0.5 rounded bg-muted/50 p-2">
                    {r.result.errors.map((e, j) => (
                      <p key={j} className="text-xs text-muted-foreground">
                        {e.symbol && <span className="font-medium text-foreground">{e.symbol}: </span>}
                        {e.message}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={onReset} variant="outline" className="flex-1">
          <RefreshCw className="h-4 w-4 mr-2" />
          Import More
        </Button>
        <Button onClick={() => (window.location.href = "/")} className="flex-1">
          Go to Dashboard
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
