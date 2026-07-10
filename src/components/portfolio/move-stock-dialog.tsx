"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AccountSelect } from "@/components/account/account-select";
import { getAccounts } from "@/app/(authenticated)/actions/account-actions";
import { requiresAccountForMove } from "@/lib/holdings";
import { moveCompany } from "@/app/(authenticated)/actions/company-actions";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import { toastError } from "@/lib/toast-error";
import type { Account, Portfolio } from "@/types/database";

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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [avgPrice, setAvgPrice] = useState<string>("");
  const invalidate = useInvalidateDashboard();

  const targets = portfolios.filter((p) => p.id !== currentPortfolioId);
  const targetPortfolio = targets.find((p) => p.id === targetId);
  const isTargetHoldings = targetPortfolio?.type === "holdings";
  const currentType = portfolios.find((p) => p.id === currentPortfolioId)?.type ?? "watchlist";
  const needsAccount =
    !!targetPortfolio && requiresAccountForMove(currentType, targetPortfolio.type);

  const loadAccounts = useCallback(function loadAccounts() {
    getAccounts()
      .then(setAccounts)
      .catch((err) =>
        toastError(err, { message: "Couldn't load your accounts.", retry: loadAccounts })
      );
  }, []);

  useEffect(() => {
    if (open && needsAccount && accounts.length === 0) {
      loadAccounts();
    }
  }, [open, needsAccount, accounts.length, loadAccounts]);

  async function handleMove() {
    if (!targetId) return;

    let position:
      | { account_id?: string; quantity?: number; avg_buy_price?: number }
      | undefined;

    if (needsAccount) {
      if (!accountId) {
        setError("Account is required");
        return;
      }
      if (quantity && !(Number(quantity) > 0)) {
        setError("Quantity must be positive");
        return;
      }
      if (avgPrice && Number(avgPrice) < 0) {
        setError("Average price cannot be negative");
        return;
      }
      position = {
        account_id: accountId,
        ...(quantity ? { quantity: Number(quantity) } : {}),
        ...(avgPrice ? { avg_buy_price: Number(avgPrice) } : {}),
      };
    }

    setPending(true);
    setError(null);

    const res = await moveCompany(companyId, targetId, position ? { position } : undefined);
    setPending(false);
    if (!res.ok) {
      // Show the reason inline in the dialog, and append the suggested next step.
      setError(res.hint ? `${res.error} ${res.hint}` : res.error);
      return;
    }
    invalidate();
    onOpenChange(false);
    onMoved?.();
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

          {needsAccount && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="text-sm font-medium">
                Position{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (account required; qty &amp; price can be added later)
                </span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Account <span className="text-destructive">*</span></Label>
                <AccountSelect
                  accounts={accounts}
                  value={accountId}
                  onChange={setAccountId}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Quantity</Label>
                  <Input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    placeholder="e.g. 100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Avg Buy Price (₹)</Label>
                  <Input
                    value={avgPrice}
                    onChange={(e) => setAvgPrice(e.target.value)}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    placeholder="e.g. 245.50"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Research data (financials, valuations, timeline) will be copied.</p>
            {isTargetHoldings ? (
              <p>Existing holdings (across accounts) move with the stock.</p>
            ) : (
              <p>Holdings will be discarded when moving to a watchlist.</p>
            )}
            <p>The stock will be removed from the current portfolio.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={
              pending ||
              !targetId ||
              (needsAccount && !accountId)
            }
          >
            {pending ? "Moving..." : "Move Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
