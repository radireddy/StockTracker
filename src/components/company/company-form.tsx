"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createCompany } from "@/app/(authenticated)/actions/company-actions";
import { StockSearch } from "@/components/company/stock-search";
import { roundPrice } from "@/lib/utils/calculations";
import type { IndianStock } from "@/types/database";

export function CompanyForm({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [selectedStock, setSelectedStock] = useState<IndianStock | null>(null);

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
    await createCompany(formData);
    setPending(false);
    router.push("/");
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Add New Company</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div>
              <Label>Stock *</Label>
              <StockSearch
                onSelect={setSelectedStock}
                selected={selectedStock}
                onClear={() => setSelectedStock(null)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="buy_price">Buy Price (₹)</Label>
                <Input id="buy_price" name="buy_price" type="number" step="0.01" />
              </div>
              <div>
                <Label htmlFor="star_rating">Star Rating *</Label>
                <Select name="star_rating" defaultValue="2" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s} Star{s > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="strategy">Strategy</Label>
                <Select name="strategy">
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="core">Core</SelectItem>
                    <SelectItem value="satellite">Satellite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="investment_horizon_years">Horizon (years)</Label>
                <Input
                  id="investment_horizon_years"
                  name="investment_horizon_years"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 3"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Sets default estimate years in Financial Model
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !selectedStock}>
              {pending ? "Creating..." : "Create Company"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
