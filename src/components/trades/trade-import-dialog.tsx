"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  importTradebookFile,
  recomputeTradebookAccounts,
  detectCorporateActionsAfterImport,
  applyCorporateAction,
} from "@/app/(authenticated)/actions/tradebook-actions";
import { getAccounts } from "@/app/(authenticated)/actions/account-actions";
import { useInvalidateTrades } from "@/hooks/use-trades-data";
import type { DashboardAccount } from "@/hooks/use-dashboard-data";
import { toastError } from "@/lib/toast-error";
import type { AppliedCorporateAction, PendingCorporateAction, OrphanPairSuggestion } from "@/lib/import/tradebook-types";

const MAX_BATCH_FILES = 20;
const ACCEPTED = /\.(xlsx|xls|csv)$/i;

type FileStatus = "pending" | "uploading" | "done" | "failed";

interface FileEntry {
  file: File;
  status: FileStatus;
  imported: number;
  skipped: number;
  accountLabel: string | null;
  error: string | null;
}

type Phase = "select" | "uploading" | "finalizing" | "summary";

interface TradeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TradeImportDialog({ open, onOpenChange }: TradeImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidateTrades();

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [phase, setPhase] = useState<Phase>("select");
  const [dragActive, setDragActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [corporateActions, setCorporateActions] = useState<{
    applied: AppliedCorporateAction[];
    pending: PendingCorporateAction[];
    merger_suggestions: OrphanPairSuggestion[];
  } | null>(null);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  // "" = auto-detect the account from each file; otherwise import all files here.
  const [overrideAccountId, setOverrideAccountId] = useState("");

  const busy = phase === "uploading" || phase === "finalizing";

  // Load the user's accounts so they can override auto-detection (e.g. a CSV
  // whose filename doesn't carry the Client ID).
  useEffect(() => {
    if (!open) return;
    getAccounts()
      .then((a) => setAccounts(a as DashboardAccount[]))
      .catch(() => setAccounts([]));
  }, [open]);

  // Elapsed-time ticker while work is in flight.
  useEffect(() => {
    if (!busy) return;
    const start = Date.now() - elapsed * 1000;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const reset = () => {
    setEntries([]);
    setPhase("select");
    setDragActive(false);
    setElapsed(0);
    setCorporateActions(null);
    setConfirmingKey(null);
    setOverrideAccountId("");
  };

  const handleOpenChange = (next: boolean) => {
    if (busy) return; // don't allow closing mid-import
    if (!next) reset();
    onOpenChange(next);
  };

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((f) => ACCEPTED.test(f.name));
    setEntries((prev) => {
      const seen = new Set(prev.map((e) => `${e.file.name}\x00${e.file.size}`));
      const fresh = incoming
        .filter((f) => !seen.has(`${f.name}\x00${f.size}`))
        .map<FileEntry>((file) => ({
          file,
          status: "pending",
          imported: 0,
          skipped: 0,
          accountLabel: null,
          error: null,
        }));
      return [...prev, ...fresh].slice(0, MAX_BATCH_FILES);
    });
  };

  const removeEntry = (idx: number) =>
    setEntries((prev) => prev.filter((_, i) => i !== idx));

  const patchEntry = (idx: number, patch: Partial<FileEntry>) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const startImport = async () => {
    if (entries.length === 0) return;
    setPhase("uploading");
    setElapsed(0);

    const accountIds = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      patchEntry(i, { status: "uploading" });
      const fd = new FormData();
      fd.append("file", entries[i].file);
      if (overrideAccountId) fd.append("accountId", overrideAccountId);
      const result = await importTradebookFile(fd);

      if (result.ok) {
        const r = result.data;
        if (r.imported_count > 0) accountIds.add(r.account_id);
        patchEntry(i, {
          status: "done",
          imported: r.imported_count,
          skipped: r.skipped_count,
          accountLabel: r.account_label,
        });
      } else {
        patchEntry(i, {
          status: "failed",
          error: result.error ?? "Import failed.",
        });
      }
    }

    if (accountIds.size > 0) {
      setPhase("finalizing");
      await recomputeTradebookAccounts([...accountIds]);
      const caResult = await detectCorporateActionsAfterImport([...accountIds]);
      if (caResult.ok) {
        setCorporateActions(caResult.data);
      }
    }

    await invalidate();
    setPhase("summary");
  };

  const confirmAction = async (p: PendingCorporateAction) => {
    const key = `${p.stock_id}|${p.action_type}|${p.ex_date_window.from}`;
    if (confirmingKey !== null) return;
    setConfirmingKey(key);
    try {
      const result = await applyCorporateAction({
        stock_id: p.stock_id!,
        action_type: p.action_type,
        ex_date: p.ex_date_window.from,
        factor: p.factor,
        matched_stock_ids: p.matched_stock_ids,
      });
      if (result.ok) {
        await invalidate();
        setCorporateActions((prev) =>
          prev
            ? {
                ...prev,
                pending: prev.pending.filter(
                  (q) =>
                    !(q.stock_id === p.stock_id && q.action_type === p.action_type && q.ex_date_window.from === p.ex_date_window.from)
                ),
              }
            : prev
        );
      } else {
        toastError(result);
      }
    } finally {
      setConfirmingKey(null);
    }
  };

  const total = entries.length;
  const completed = entries.filter((e) => e.status === "done" || e.status === "failed").length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const importedTrades = entries.reduce((s, e) => s + e.imported, 0);
  const skippedTrades = entries.reduce((s, e) => s + e.skipped, 0);
  const failedCount = entries.filter((e) => e.status === "failed").length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Import Tradebooks</DialogTitle>
          <DialogDescription>
            Drag in one or more Zerodha tradebook files (.xlsx or .csv). Up to{" "}
            {MAX_BATCH_FILES} at a time.
          </DialogDescription>
        </DialogHeader>

        {/* Dropzone (select phase only) */}
        {phase === "select" && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              Drop files here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">.xlsx, .xls or .csv</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {/* Account override (select phase) — needed when a CSV filename carries no Client ID */}
        {phase === "select" && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">Import into</span>
              <Select
                value={overrideAccountId || "auto"}
                onValueChange={(v) => setOverrideAccountId(!v || v === "auto" ? "" : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue>
                    {(v) =>
                      !v || v === "auto"
                        ? "Auto-detect from file"
                        : accounts.find((a) => a.id === v)?.label ?? "Auto-detect from file"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect from file</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {accounts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No accounts yet — auto-detect creates one from the file, or{" "}
                <Link href="/settings" className="text-primary underline underline-offset-2">
                  add one in Settings
                </Link>
                .
              </p>
            )}
          </div>
        )}

        {/* Progress bar (uploading / finalizing) */}
        {busy && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {phase === "finalizing"
                  ? "Computing positions…"
                  : `Uploading ${completed} of ${total}…`}
              </span>
              <span>{elapsed}s</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: phase === "finalizing" ? "100%" : `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* File list */}
        {entries.length > 0 && (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {entries.map((e, i) => (
              <li
                key={`${e.file.name}-${e.file.size}`}
                className="flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.file.name}</p>
                  {e.status === "done" && (
                    <p className="text-xs text-muted-foreground">
                      {e.imported} new · {e.skipped} already existed
                      {e.accountLabel ? ` · ${e.accountLabel}` : ""}
                    </p>
                  )}
                  {e.status === "failed" && (
                    <p className="text-xs text-red-600 dark:text-red-400">{e.error}</p>
                  )}
                </div>
                {e.status === "pending" && phase === "select" && (
                  <button
                    onClick={() => removeEntry(i)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {e.status === "uploading" && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                )}
                {e.status === "done" && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                )}
                {e.status === "failed" && (
                  <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Summary */}
        {phase === "summary" && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              Imported {importedTrades} trade{importedTrades !== 1 ? "s" : ""}
              {skippedTrades > 0 ? ` · ${skippedTrades} already existed` : ""}
            </p>
            {failedCount > 0 && (
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                {failedCount} file{failedCount !== 1 ? "s" : ""} failed — see above.
              </p>
            )}
          </div>
        )}

        {/* Corporate actions section (summary phase only) */}
        {phase === "summary" &&
          corporateActions &&
          (corporateActions.applied.length > 0 || corporateActions.pending.length > 0) && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="font-medium">Corporate actions</p>

              {corporateActions.applied.map((a, i) => (
                <p key={`ap-${i}`} className="text-xs text-green-700 dark:text-green-400">
                  ✓ We detected a {a.action_type} (×{a.factor}) for {a.symbol} on {a.ex_date} and
                  adjusted the trades accordingly.
                </p>
              ))}

              {corporateActions.pending
                .filter((p) => p.status === "inferred")
                .map((p, i) => {
                  const cardKey = `${p.stock_id}|${p.action_type}|${p.ex_date_window.from}`;
                  const isConfirming = confirmingKey === cardKey;
                  // Show the evidence that actually triggered detection:
                  //  - oversold (Signal A): sold more than bought — buy/sell math is the proof
                  //  - holdings mismatch (Signal B): current holdings ≠ FIFO-open by a clean factor
                  const isOversold = p.observed.sells > p.observed.buys;
                  return (
                    <div key={`pd-${i}`} className="rounded-md border bg-muted/30 p-2 text-xs">
                      <p>
                        <span className="font-medium">{p.symbol}</span>:{" "}
                        {isOversold ? (
                          <>
                            sold {p.observed.sells} but bought only {p.observed.buys} — impossible without
                            extra shares.
                          </>
                        ) : (
                          <>
                            you hold {p.observed.holdings} shares but trades net to only {p.observed.fifoOpen}.
                          </>
                        )}{" "}
                        A ×{p.factor} {p.action_type} (~{p.ex_date_window.from}…{p.ex_date_window.to}) explains it.
                      </p>
                      <div className="mt-1.5 flex gap-2">
                        <Button size="sm" onClick={() => confirmAction(p)} disabled={confirmingKey !== null}>
                          {isConfirming && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {isConfirming ? "Applying…" : "Apply"}
                        </Button>
                      </div>
                    </div>
                  );
                })}

              {corporateActions.pending
                .filter((p) => p.status === "unexplained")
                .map((p, i) => (
                  <p key={`ux-${i}`} className="text-xs text-muted-foreground">
                    ⚠ {p.symbol}: sold {p.observed.sells} vs bought {p.observed.buys} — no clean split/bonus explains it; review manually.
                  </p>
                ))}

              {corporateActions.pending.length > 0 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  You can review, edit, or correct these trades anytime from the dashboard.
                </p>
              )}
            </div>
          )}

        {/* Footer actions */}
        <div className="flex justify-end gap-2">
          {phase === "select" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={startImport} disabled={entries.length === 0}>
                Import {entries.length > 0 ? `${entries.length} file${entries.length !== 1 ? "s" : ""}` : ""}
              </Button>
            </>
          )}
          {busy && (
            <Button size="sm" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Working…
            </Button>
          )}
          {phase === "summary" && (
            <>
              <Button variant="ghost" size="sm" onClick={reset}>
                Import more
              </Button>
              <Button size="sm" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
