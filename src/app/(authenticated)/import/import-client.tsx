"use client";

import { useState, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import { AccountsManager } from "@/components/account/accounts-manager";
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

export type HistoryRow = {
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

type Phase = "select" | "importing" | "done";

export default function ImportClient({
  initialHistory,
  initialAccounts,
}: {
  initialHistory: HistoryRow[];
  initialAccounts: Account[];
}) {
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
  const [history, setHistory] = useState<HistoryRow[]>(initialHistory);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History and accounts are seeded from the server on first render, so there
  // is no on-mount fetch. fetchHistory is only used to refresh after an import.
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/import");
      if (res.ok) setHistory(await res.json());
    } catch {
      /* silent */
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    setFiles(selected && selected.length > 0 ? Array.from(selected) : []);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const importOne = async (file: File): Promise<FileResult> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("portfolio_id", portfolioId);
    formData.append("broker", "zerodha");
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
      setCurrentIndex(i);
      const r = await importOne(files[i]);
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Holdings
          </CardTitle>
          <CardDescription>
            Import a Zerodha holdings statement. Each statement is a snapshot for one
            account; re-importing an account replaces its existing holdings.
          </CardDescription>
        </CardHeader>
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
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
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
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button className="w-full" />}
                disabled={files.length === 0 || !portfolioId}
              >
                Import {files.length > 1 ? `${files.length} files` : ""} into {selectedPortfolioName}
                <ArrowRight className="h-4 w-4 ml-2" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Import holdings?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Re-importing an account <strong>replaces</strong> its existing holdings,
                    including any manual edits you&rsquo;ve made for that account.
                    <span className="mt-2 block font-semibold text-destructive">
                      This can&rsquo;t be undone.
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleImport}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Replace &amp; import
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {phase === "importing" && (
            <div role="status" aria-live="polite" className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" />
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
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Accounts management */}
      <AccountsManager
        initialAccounts={initialAccounts}
        onChanged={() => { fetchHistory(); invalidateDashboard(); }}
      />

      {/* Import history */}
      {history.length > 0 && (
        <Card>
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
                          : "bg-green-500/10 text-green-700"
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

/* ── Result list after import ───────────────────────────────────────── */

function ResultList({ results, onReset }: { results: FileResult[]; onReset: () => void }) {
  const totalStocks = results.reduce((s, r) => s + (r.result?.companies_count ?? 0), 0);
  const anyError = results.some((r) => r.error || r.result?.status === "failed");

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-3 p-4 rounded-lg ${anyError ? "bg-yellow-500/10" : "bg-green-500/10"}`}>
        {anyError ? (
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
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
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
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
                    <Plus className="h-3 w-3 text-green-600" />
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
