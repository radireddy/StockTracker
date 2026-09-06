"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { recordMerger } from "@/app/(authenticated)/actions/tradebook-actions";
import { getOpenPositions } from "@/app/(authenticated)/actions/trades-actions";
import { toastError } from "@/lib/toast-error";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}

export function RecordMergerDialog({ open, onClose, onMerged }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [fromStockId, setFromStockId] = useState("");
  const [toStockId, setToStockId] = useState("");
  const [ratio, setRatio] = useState("");
  const [exDate, setExDate] = useState("");
  const [busy, setBusy] = useState(false);

  // Fetch all open positions (no account filter) so the selects are populated
  // with every security the user currently holds. Note: users should record a
  // merger BEFORE applying it so the from-security still shows as an open
  // position with quantity > 0.
  const { data: positions = [] } = useQuery({
    queryKey: ["open-positions-for-merger"],
    queryFn: () => getOpenPositions(),
    enabled: open,
    staleTime: 30_000,
  });

  const securities = positions
    .filter((p) => p.stock_id != null)
    .map((p) => ({ stockId: p.stock_id as string, symbol: p.symbol }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const reset = () => {
    setFromStockId("");
    setToStockId("");
    setRatio("");
    setExDate("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromStockId || !toStockId || !ratio || !exDate) return;
    const ratioNum = Number(ratio);
    if (!(ratioNum > 0)) {
      toastError(new Error("Ratio must be greater than zero."), {
        message: "Invalid ratio",
      });
      return;
    }
    setBusy(true);
    try {
      const result = await recordMerger({
        fromStockId,
        toStockId,
        ratio: ratioNum,
        exDate,
      });
      if (!result.ok) {
        toastError(result);
        return;
      }
      toast.success("Merger recorded and FIFO recomputed.");
      reset();
      onMerged();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Merger</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">From security (absorbed)</label>
            <select
              required
              value={fromStockId}
              onChange={(e) => setFromStockId(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm bg-background"
            >
              <option value="">Select…</option>
              {securities.map((s) => (
                <option key={s.stockId} value={s.stockId}>
                  {s.symbol}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Into security (surviving)</label>
            <select
              required
              value={toStockId}
              onChange={(e) => setToStockId(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm bg-background"
            >
              <option value="">Select…</option>
              {securities.map((s) => (
                <option key={s.stockId} value={s.stockId}>
                  {s.symbol}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-sm font-medium">Swap ratio</label>
              <input
                required
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder="e.g. 2.31"
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm bg-background"
              />
              <p className="text-xs text-muted-foreground">
                Shares received per share held
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-sm font-medium">Effective date</label>
              <input
                required
                type="date"
                max={today}
                value={exDate}
                onChange={(e) => setExDate(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm bg-background"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Recording…" : "Record merger"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
