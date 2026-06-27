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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { moveCompany } from "@/app/(authenticated)/actions/company-actions";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import type { Portfolio } from "@/types/database";

type PortfolioWithCount = Portfolio & { company_count: number };

export function MoveStockDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  currentPortfolioId,
  portfolios,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  currentPortfolioId: string;
  portfolios: PortfolioWithCount[];
  onMoved?: () => void;
}) {
  const [targetId, setTargetId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [avgBuyPrice, setAvgBuyPrice] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateDashboard();

  const targets = portfolios.filter((p) => p.id !== currentPortfolioId);
  const targetPortfolio = targets.find((p) => p.id === targetId);
  const isTargetHoldings = targetPortfolio?.type === "holdings";

  async function handleMove() {
    if (!targetId) return;
    setPending(true);
    setError(null);

    try {
      await moveCompany(companyId, targetId, {
        quantity: quantity ? Number(quantity) : undefined,
        avg_buy_price: avgBuyPrice ? Number(avgBuyPrice) : undefined,
      });
      invalidate();
      onOpenChange(false);
      onMoved?.();
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Failed to move company";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Move &ldquo;{companyName}&rdquo;</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Target Portfolio</Label>
            <div className="space-y-1.5">
              {targets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTargetId(p.id)}
                  className={`w-full flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors ${
                    targetId === p.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  {p.color && (
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                  )}
                  <span className="flex-1 text-left font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">({p.type})</span>
                  {targetId === p.id && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {isTargetHoldings && (
            <>
              <div className="space-y-2">
                <Label htmlFor="move-qty">Quantity (optional)</Label>
                <Input
                  id="move-qty"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Number of shares"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="move-avg">Avg Buy Price (optional)</Label>
                <Input
                  id="move-avg"
                  type="number"
                  value={avgBuyPrice}
                  onChange={(e) => setAvgBuyPrice(e.target.value)}
                  placeholder="Average purchase price"
                />
              </div>
            </>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Research data (financials, valuations, timeline) will be copied.</p>
            <p>The stock will be removed from the current portfolio.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={pending || !targetId}>
            {pending ? "Moving..." : "Move Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
