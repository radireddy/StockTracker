"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AccountSelect, NEW_ACCOUNT } from "@/components/account/account-select";
import { StockSearch } from "@/components/company/stock-search";
import { createCompany } from "@/app/(authenticated)/actions/company-actions";
import { createCompanyWithHolding } from "@/app/(authenticated)/actions/holdings-actions";
import { getAccounts } from "@/app/(authenticated)/actions/account-actions";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { roundPrice } from "@/lib/utils/calculations";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import type { IndianStock, Account } from "@/types/database";
import { Building2, TrendingUp, Star, Wallet } from "lucide-react";

export function CompanyForm() {
  const router = useRouter();
  const { selectedId, selectedPortfolio, portfolios, select } = usePortfolioContext();
  const invalidate = useInvalidateDashboard();

  const isHoldings = (selectedPortfolio?.type ?? "holdings") === "holdings";

  const [pending, setPending] = useState(false);
  const [selectedStock, setSelectedStock] = useState<IndianStock | null>(null);

  // Position (holdings only)
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgPrice, setAvgPrice] = useState("");

  useEffect(() => {
    if (isHoldings) getAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, [isHoldings]);

  const hasAnyPosition = Boolean(accountId || quantity || avgPrice);

  const done = () => {
    invalidate();
    toast.success("Company added");
    router.push("/");
  };
  const fail = (err: unknown) => {
    toast.error((err as Error).message);
    setPending(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStock) return;

    // Research fields come from the form's native/base-ui inputs (name attrs).
    const fd = new FormData(e.currentTarget);
    fd.set("portfolio_id", selectedId);
    fd.set("isin", selectedStock.isin);
    const bp = fd.get("buy_price");
    if (bp) fd.set("buy_price", String(roundPrice(Number(bp))));

    if (!isHoldings) {
      setPending(true);
      try {
        await createCompany(fd);
        done();
      } catch (err) {
        fail(err);
      }
      return;
    }

    // Holdings: enforce all-or-nothing position.
    if (hasAnyPosition) {
      const accountOk =
        (accountId && accountId !== NEW_ACCOUNT) ||
        (accountId === NEW_ACCOUNT && newAccountLabel.trim());
      if (!accountOk || !quantity || !avgPrice) {
        toast.error("Enter account, quantity and avg price together");
        return;
      }
      if (accountId === NEW_ACCOUNT) fd.set("new_account_label", newAccountLabel.trim());
      else fd.set("account_id", accountId);
      fd.set("quantity", quantity);
      fd.set("avg_buy_price", avgPrice);
    }

    setPending(true);
    try {
      await createCompanyWithHolding(fd);
      done();
    } catch (err) {
      fail(err);
    }
  };

  const researchFields = (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="buy_price" className="text-sm">Target Buy Price (₹)</Label>
        <Input id="buy_price" name="buy_price" type="number" step="0.01" placeholder="Target buy price" className="bg-background" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="star_rating" className="text-sm">Star Rating</Label>
        <Select name="star_rating" defaultValue="2">
          <SelectTrigger className="bg-background"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4].map((s) => (
              <SelectItem key={s} value={String(s)}>
                {"★".repeat(s)}{"☆".repeat(4 - s)} ({s})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="strategy" className="text-sm">Strategy</Label>
        <Select name="strategy" defaultValue="core">
          <SelectTrigger className="bg-background"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="core">Core</SelectItem>
            <SelectItem value="satellite">Satellite</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="investment_horizon_years" className="text-sm">Horizon (years)</Label>
        <Input id="investment_horizon_years" name="investment_horizon_years" type="number" min="0" step="1" placeholder="e.g. 3" className="bg-background" />
        <p className="text-xs text-muted-foreground">Sets default estimate years in Financial Model</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl">
      {/* Header with destination + inline switcher */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/15 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground">Add New Company</h1>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Adding to</span>
              <select
                value={selectedId}
                onChange={(e) => select(e.target.value)}
                className="h-7 rounded-md border border-input bg-background px-2 text-sm font-medium"
              >
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Badge variant={isHoldings ? "default" : "secondary"} className="capitalize">
                {isHoldings ? "Holdings" : "Watchlist"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Stock Search */}
        <Card className="border-primary/10 shadow-sm overflow-visible">
          <CardContent className="pt-5 pb-5">
            <Label className="text-sm font-medium mb-2 block">Stock *</Label>
            <StockSearch
              onSelect={setSelectedStock}
              selected={selectedStock}
              onClear={() => setSelectedStock(null)}
            />
            {selectedStock && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 text-sm">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="font-medium">{selectedStock.name}</span>
                {selectedStock.nse_symbol && (
                  <span className="text-muted-foreground">({selectedStock.nse_symbol})</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Holdings: Position card (optional, all-or-nothing) */}
        {isHoldings && (
          <Card className="shadow-sm">
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Position</span>
                <span className="text-xs text-muted-foreground">(optional — fill account, qty & price together)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Account</Label>
                  <AccountSelect
                    accounts={accounts}
                    value={accountId}
                    onChange={setAccountId}
                    newLabel={newAccountLabel}
                    onNewLabelChange={setNewAccountLabel}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Quantity</Label>
                  <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="e.g. 100" className="bg-background" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Avg Buy Price (₹)</Label>
                  <Input value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} inputMode="decimal" placeholder="e.g. 245.50" className="bg-background" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Research fields: always shown for watchlist; collapsed for holdings */}
        {isHoldings ? (
          <Card className="shadow-sm">
            <CardContent className="pt-4 pb-4">
              <details>
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Star className="h-4 w-4 text-primary" />
                  Add research details (optional)
                </summary>
                <div className="pt-4">{researchFields}</div>
              </details>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm">
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Star className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Company Details</span>
              </div>
              {researchFields}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={pending || !selectedStock} className="px-6">
            {pending ? "Creating..." : isHoldings ? "Add to Holdings" : "Add to Watchlist"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
