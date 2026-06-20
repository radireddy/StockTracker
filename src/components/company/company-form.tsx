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

export function CompanyForm({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    const formData = new FormData(e.currentTarget);
    formData.set("portfolio_id", portfolioId);
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Company Name *</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="symbol">Symbol</Label>
              <Input id="symbol" name="symbol" placeholder="NSE:SYMBOL" />
            </div>
            <div>
              <Label htmlFor="sector">Sector</Label>
              <Input id="sector" name="sector" />
            </div>
            <div>
              <Label htmlFor="market_cap">Market Cap (Cr)</Label>
              <Input id="market_cap" name="market_cap" type="number" step="any" />
            </div>
            <div>
              <Label htmlFor="current_price">Current Price (₹)</Label>
              <Input id="current_price" name="current_price" type="number" step="any" />
            </div>
            <div>
              <Label htmlFor="buy_price">Buy Price (₹)</Label>
              <Input id="buy_price" name="buy_price" type="number" step="any" />
            </div>
            <div>
              <Label htmlFor="star_rating">Star Rating</Label>
              <Select name="star_rating">
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((s) => (
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
                step="any"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
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
