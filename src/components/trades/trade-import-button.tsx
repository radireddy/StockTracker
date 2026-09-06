"use client";

import { useState } from "react";
import { Upload, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getTradeImportHistory,
  deleteTradeImport,
} from "@/app/(authenticated)/actions/tradebook-actions";
import { TradeImportDialog } from "@/components/trades/trade-import-dialog";
import { toastError } from "@/lib/toast-error";
import { toast } from "sonner";

interface ImportRecord {
  id: string;
  created_at: string;
  broker: string;
  imported_count: number;
  skipped_count: number;
  date_from: string | null;
  date_to: string | null;
  status: string;
  // Supabase returns a related row as a single object or null via PostgREST
  accounts: { label: string; broker: string } | { label: string; broker: string }[] | null;
}

export function TradeImportButton() {
  const [importOpen, setImportOpen]   = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory]         = useState<ImportRecord[] | null>(null);

  const openHistory = async () => {
    const h = await getTradeImportHistory();
    setHistory(h as unknown as ImportRecord[]);
    setShowHistory(true);
  };

  const handleDelete = async (id: string) => {
    const result = await deleteTradeImport(id);
    if (!result.ok) { toastError(result); return; }
    setHistory((prev) => prev?.filter((h) => h.id !== id) ?? null);
    toast.success("Import record deleted.");
  };

  return (
    <>
      <TradeImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImportOpen(true)}
        >
          <Upload className="mr-2 h-4 w-4" />
          Import Tradebook
        </Button>
        <Button size="sm" variant="ghost" onClick={openHistory} title="Import history">
          <Clock className="h-4 w-4" />
        </Button>
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowHistory(false)}
          />
          <div className="relative z-10 h-full w-full max-w-md overflow-y-auto border-l bg-background shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b bg-background px-5 py-4">
              <h2 className="text-base font-semibold">Tradebook Import History</h2>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowHistory(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="px-5 py-4">
              {!history || history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No imports yet.</p>
              ) : (
                <ul className="space-y-3">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {Array.isArray(h.accounts)
                            ? (h.accounts[0]?.label ?? h.broker)
                            : (h.accounts?.label ?? h.broker)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {h.imported_count} new · {h.skipped_count} skipped
                          {h.date_from && (
                            <> · {h.date_from} → {h.date_to}</>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(h.created_at).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-muted-foreground"
                        onClick={() => handleDelete(h.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
