"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createCompany } from "@/app/(authenticated)/actions/company-actions";
import { addTransaction } from "@/app/(authenticated)/actions/transaction-actions";
import { getDefaultOwnerId } from "@/app/(authenticated)/actions/owner-actions";
import { StockSearch } from "@/components/company/stock-search";
import { roundPrice } from "@/lib/utils/calculations";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import type { IndianStock } from "@/types/database";
import { Building2, TrendingUp, ShoppingCart, Star } from "lucide-react";

export function CompanyForm({
  portfolioId,
  portfolioType = "holdings",
}: {
  portfolioId: string;
  portfolioType?: "holdings" | "watchlist";
}) {
  const isHoldings = portfolioType === "holdings";
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [selectedStock, setSelectedStock] = useState<IndianStock | null>(null);
  const invalidate = useInvalidateDashboard();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStock) return;
    setPending(true);
    const formData = new FormData(e.currentTarget);
    formData.set("portfolio_id", portfolioId);
    formData.set("isin", selectedStock.isin);
    // Round financial values before saving
    const bp = formData.get("buy_price");
    if (bp) formData.set("buy_price", String(roundPrice(Number(bp))));
    const companyId = await createCompany(formData);

    // Optionally create first transaction for holdings
    const txQty = formData.get("tx_quantity");
    const txPrice = formData.get("tx_price");
    const txDate = formData.get("tx_date");
    if (isHoldings && txQty && txPrice && Number(txQty) > 0) {
      const defaultOwnerId = await getDefaultOwnerId();
      await addTransaction(companyId, {
        type: "BUY",
        quantity: Number(txQty),
        price: Number(txPrice),
        date: (txDate as string) || new Date().toISOString().split("T")[0],
        owner_id: defaultOwnerId,
      });
    }

    setPending(false);
    invalidate();
    router.push("/");
  };

  return (
    <div className="max-w-2xl">
      {/* Header with gradient */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/15 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Add New Company</h1>
            <p className="text-sm text-muted-foreground">
              {isHoldings ? "Add to your holdings portfolio" : "Add to your watchlist"}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Stock Search */}
        <Card className="border-primary/10 shadow-sm">
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

        {/* Company Details */}
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Star className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Company Details</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="buy_price" className="text-sm">Buy Price (₹)</Label>
                <Input
                  id="buy_price"
                  name="buy_price"
                  type="number"
                  step="0.01"
                  placeholder="Target buy price"
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="star_rating" className="text-sm">Star Rating *</Label>
                <Select name="star_rating" defaultValue="2" required>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
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
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="core">Core</SelectItem>
                    <SelectItem value="satellite">Satellite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="investment_horizon_years" className="text-sm">Horizon (years)</Label>
                <Input
                  id="investment_horizon_years"
                  name="investment_horizon_years"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 3"
                  className="bg-background"
                />
                <p className="text-xs text-muted-foreground">
                  Sets default estimate years in Financial Model
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* First Transaction (Holdings only) */}
        {isHoldings && (
          <Card className="shadow-sm border-dashed">
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">First Transaction</span>
                <span className="text-xs text-muted-foreground">(optional)</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tx_quantity" className="text-sm">Quantity</Label>
                  <Input
                    id="tx_quantity"
                    name="tx_quantity"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    className="bg-background"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tx_price" className="text-sm">Price (₹)</Label>
                  <Input
                    id="tx_price"
                    name="tx_price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="bg-background"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tx_date" className="text-sm">Date</Label>
                  <Input
                    id="tx_date"
                    name="tx_date"
                    type="date"
                    defaultValue={new Date().toISOString().split("T")[0]}
                    className="bg-background"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            disabled={pending || !selectedStock}
            className="px-6"
          >
            {pending ? "Creating..." : "Create Company"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
