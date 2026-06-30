"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTransaction } from "@/app/(authenticated)/actions/transaction-actions";
import { getOwners } from "@/app/(authenticated)/actions/owner-actions";
import type { PortfolioOwner } from "@/types/database";

export function AddTransactionDialog({
  open,
  onOpenChange,
  companyId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [owners, setOwners] = useState<PortfolioOwner[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      getOwners().then((data) => {
        setOwners(data);
        if (!ownerId && data.length > 0) {
          const def = data.find((o) => o.is_default);
          setOwnerId(def?.id ?? data[0].id);
        }
      });
    }
  }, [open]);

  async function handleSubmit() {
    if (!quantity || !price || !date || !ownerId) return;
    setPending(true);
    setError(null);

    // Build traded_at: combine date + time (IST), default to midnight if no time
    const timePart = time || "00:00";
    const tradedAt = `${date}T${timePart}:00+05:30`;

    try {
      await addTransaction(companyId, {
        type,
        quantity: Number(quantity),
        price: Number(price),
        fees: fees ? Number(fees) : undefined,
        traded_at: tradedAt,
        notes: notes.trim() || undefined,
        owner_id: ownerId,
      });
      onOpenChange(false);
      setQuantity("");
      setPrice("");
      setFees("");
      setNotes("");
      setTime("");
      setType("BUY");
      onSuccess();
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Failed to add transaction";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            {(["BUY", "SELL"] as const).map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={type === t ? "default" : "outline"}
                onClick={() => setType(t)}
                className={
                  type === t
                    ? t === "BUY"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-red-600 hover:bg-red-700"
                    : ""
                }
              >
                {t}
              </Button>
            ))}
          </div>

          {/* Owner selector */}
          {owners.length > 0 && (
            <div className="space-y-1.5">
              <Label>Owner *</Label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}{o.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx-qty">Quantity *</Label>
              <Input
                id="tx-qty"
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-price">Price *</Label>
              <Input
                id="tx-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-fees">Fees</Label>
              <Input
                id="tx-fees"
                type="number"
                min="0"
                step="0.01"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-date">Date *</Label>
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="tx-time">Time (optional)</Label>
              <Input
                id="tx-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="HH:MM"
              />
              <p className="text-xs text-muted-foreground">
                Helps determine FIFO order for same-day trades
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-notes">Notes</Label>
            <Input
              id="tx-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !quantity || !price || !date || !ownerId}
          >
            {pending ? "Adding..." : "Add Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
