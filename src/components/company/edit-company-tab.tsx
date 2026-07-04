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
import { roundPrice } from "@/lib/utils/calculations";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import type { Company } from "@/types/database";

export function EditCompanyTab({ company, baseCaseBuyPrice }: { company: Company; baseCaseBuyPrice?: number | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateDashboard();
  const [starRating, setStarRating] = useState(String(company.star_rating ?? 2));
  const [strategy, setStrategy] = useState(company.strategy ?? "");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await updateCompany(company.id, {
        buy_price: fd.get("buy_price") ? roundPrice(Number(fd.get("buy_price"))) : null,
        star_rating: Number(starRating) || 2,
        strategy: (strategy as "core" | "satellite") || null,
      });
      invalidate();
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div>
        {/* Read-only stock info */}
        <div className="rounded-md border border-input bg-muted/50 px-3 py-2 mb-4">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{company.indian_stocks?.name ?? "Unknown"}</span>
            {company.indian_stocks?.nse_symbol && (
              <span className="text-sm text-muted-foreground">
                (NSE: {company.indian_stocks.nse_symbol})
              </span>
            )}
          </div>
          {company.indian_stocks?.sector && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {company.indian_stocks.sector}
            </p>
          )}
          {company.indian_stocks?.price != null && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Current Price: ₹{roundPrice(company.indian_stocks.price).toLocaleString("en-IN")}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-buy_price">Buy Price (₹)</Label>
              <Input
                id="edit-buy_price"
                name="buy_price"
                type="number"
                step="0.01"
                defaultValue={company.buy_price != null ? roundPrice(company.buy_price) : ""}
                placeholder={baseCaseBuyPrice != null ? `${roundPrice(baseCaseBuyPrice)} (base case)` : undefined}
              />
              {company.buy_price == null && baseCaseBuyPrice != null && (
                <p className="text-xs text-muted-foreground mt-1">
                  Defaults to base case: ₹{roundPrice(baseCaseBuyPrice).toLocaleString("en-IN")}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-star_rating">Star Rating <span className="text-destructive">*</span></Label>
              <Select
                value={starRating}
                onValueChange={(v) => setStarRating(v ?? "2")}
                required
              >
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
              <Label htmlFor="edit-strategy">Strategy</Label>
              <Select
                value={strategy}
                onValueChange={(v) => setStrategy(v ?? "")}
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
                type="number"
                value={company.investment_horizon_years ?? 0}
                readOnly
                disabled
                className="bg-muted cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Auto-calculated from Financial Model estimates
              </p>
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
