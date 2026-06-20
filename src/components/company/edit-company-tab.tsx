"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save } from "lucide-react";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import type { Company } from "@/types/database";

export function EditCompanyTab({ company }: { company: Company }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await updateCompany(company.id, {
        name: fd.get("name") as string,
        symbol: (fd.get("symbol") as string) || null,
        sector: (fd.get("sector") as string) || null,
        market_cap: fd.get("market_cap") ? Number(fd.get("market_cap")) : null,
        current_price: fd.get("current_price") ? Number(fd.get("current_price")) : null,
        buy_price: fd.get("buy_price") ? Number(fd.get("buy_price")) : null,
        star_rating: fd.get("star_rating") ? Number(fd.get("star_rating")) : null,
        strategy: (fd.get("strategy") as "core" | "satellite") || null,
        investment_horizon_years: fd.get("investment_horizon_years")
          ? Number(fd.get("investment_horizon_years"))
          : null,
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-name">Company Name *</Label>
              <Input
                id="edit-name"
                name="name"
                defaultValue={company.name}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-symbol">Symbol</Label>
              <Input
                id="edit-symbol"
                name="symbol"
                defaultValue={company.symbol ?? ""}
                placeholder="NSE:SYMBOL"
              />
            </div>
            <div>
              <Label htmlFor="edit-sector">Sector</Label>
              <Input
                id="edit-sector"
                name="sector"
                defaultValue={company.sector ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="edit-market_cap">Market Cap (Cr)</Label>
              <Input
                id="edit-market_cap"
                name="market_cap"
                type="number"
                step="any"
                defaultValue={company.market_cap ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="edit-current_price">Current Price (₹)</Label>
              <Input
                id="edit-current_price"
                name="current_price"
                type="number"
                step="any"
                defaultValue={company.current_price ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="edit-buy_price">Buy Price (₹)</Label>
              <Input
                id="edit-buy_price"
                name="buy_price"
                type="number"
                step="any"
                defaultValue={company.buy_price ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="edit-star_rating">Star Rating</Label>
              <Select
                name="star_rating"
                defaultValue={company.star_rating ? String(company.star_rating) : ""}
              >
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
              <Label htmlFor="edit-strategy">Strategy</Label>
              <Select
                name="strategy"
                defaultValue={company.strategy ?? ""}
              >
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
              <Label htmlFor="edit-horizon">Horizon (years)</Label>
              <Input
                id="edit-horizon"
                name="investment_horizon_years"
                type="number"
                step="any"
                defaultValue={company.investment_horizon_years ?? ""}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving} size="sm" className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
