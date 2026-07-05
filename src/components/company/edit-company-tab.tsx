"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResearchFields } from "@/components/company/research-fields";
import { Save } from "lucide-react";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import { roundPrice } from "@/lib/utils/calculations";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import type { Company } from "@/types/database";

export function EditCompanyTab({ company, baseCaseBuyPrice }: { company: Company; baseCaseBuyPrice?: number | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateDashboard();
  // Un-rated companies show as "Not rated" (0 = all stars muted), not a filled
  // default — on the dashboard they land in the 0★ bucket (0% target).
  const [starRating, setStarRating] = useState<number>(company.star_rating ?? 0);
  const [strategy, setStrategy] = useState<string>(company.strategy ?? "");

  const currentPrice = company.indian_stocks?.price ?? null;
  const symbol = company.indian_stocks?.nse_symbol ?? null;
  const sector = company.indian_stocks?.sector ?? null;
  const horizon = company.investment_horizon_years ?? 0;

  const buyPriceHint =
    company.buy_price == null && baseCaseBuyPrice != null
      ? `Defaults to base case ₹${roundPrice(baseCaseBuyPrice).toLocaleString("en-IN")}`
      : currentPrice != null
        ? `Trading at ₹${roundPrice(currentPrice).toLocaleString("en-IN")} now`
        : null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await updateCompany(company.id, {
        buy_price: fd.get("buy_price") ? roundPrice(Number(fd.get("buy_price"))) : null,
        // Keep un-rated companies null so the dashboard groups them under 0★
        // and nudges — never silently persist a rating the user didn't pick.
        star_rating: starRating || null,
        strategy: (strategy as "core" | "satellite") || null,
      });
      invalidate();
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <Card className="shadow-soft overflow-hidden">
        {/* Editor header — grounds the form without repeating the page title */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 bg-muted/30 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Investment Profile</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Your entry target, conviction and strategy.
            </p>
          </div>
          {(symbol || sector) && (
            <div className="text-right">
              {symbol && (
                <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-semibold text-foreground">
                  NSE: {symbol}
                </span>
              )}
              {sector && <p className="mt-1 text-xs text-muted-foreground">{sector}</p>}
            </div>
          )}
        </div>

        <CardContent className="px-5 py-6">
          <ResearchFields
            starRating={starRating}
            onStarRatingChange={setStarRating}
            strategy={strategy}
            onStrategyChange={setStrategy}
            buyPriceDefaultValue={company.buy_price != null ? roundPrice(company.buy_price) : ""}
            buyPricePlaceholder={baseCaseBuyPrice != null ? String(roundPrice(baseCaseBuyPrice)) : "0.00"}
            buyPriceHint={buyPriceHint}
            starRequired
            horizon={{ editable: false, years: horizon }}
          />

          <div className="mt-7 flex items-center gap-3 border-t border-border/60 pt-5">
            <Button type="submit" disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
