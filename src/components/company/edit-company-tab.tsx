"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { ResearchFields } from "@/components/company/research-fields";
import { Target } from "lucide-react";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import { roundPrice } from "@/lib/utils/calculations";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import { useAutoSave } from "@/hooks/use-auto-save";
import type { Company } from "@/types/database";

interface SavePayload {
  buyPrice: string;
  starRating: number;
  strategy: string;
}

export function EditCompanyTab({ company, baseCaseBuyPrice }: { company: Company; baseCaseBuyPrice?: number | null }) {
  const router = useRouter();
  const invalidate = useInvalidateDashboard();

  const [starRating, setStarRating] = useState<number>(company.star_rating ?? 0);
  const [strategy, setStrategy] = useState<string>(company.strategy ?? "");
  const buyPriceRef = useRef<string>(
    company.buy_price != null ? String(roundPrice(company.buy_price)) : ""
  );

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

  const saveFn = useCallback(async (payload: SavePayload) => {
    const result = await updateCompany(company.id, {
      buy_price: payload.buyPrice ? roundPrice(Number(payload.buyPrice)) : null,
      // Keep un-rated companies null so the dashboard groups them under 0★
      // and nudges — never silently persist a rating the user didn't pick.
      star_rating: payload.starRating || null,
      strategy: (payload.strategy as "core" | "satellite") || null,
    });
    invalidate();
    router.refresh();
    return result;
  }, [company.id, invalidate, router]);

  const autoSave = useAutoSave(saveFn, { delay: 800 });
  const immediateAutoSave = useAutoSave(saveFn, { delay: 0 });

  const currentPayload = useCallback(
    (overrides?: Partial<SavePayload>): SavePayload => ({
      buyPrice: buyPriceRef.current,
      starRating,
      strategy,
      ...overrides,
    }),
    [starRating, strategy]
  );

  const handleBuyPriceChange = useCallback((val: string) => {
    buyPriceRef.current = val;
    autoSave.trigger(currentPayload({ buyPrice: val }));
  }, [autoSave, currentPayload]);

  const handleStarRatingChange = useCallback((val: number) => {
    setStarRating(val);
    immediateAutoSave.trigger(currentPayload({ starRating: val }));
  }, [immediateAutoSave, currentPayload]);

  const handleStrategyChange = useCallback((val: string) => {
    setStrategy(val);
    immediateAutoSave.trigger(currentPayload({ strategy: val }));
  }, [immediateAutoSave, currentPayload]);

  return (
    <div className="max-w-2xl">
      <Card className="shadow-soft overflow-hidden">
        {/* Editor header */}
        <div className="flex items-center gap-3 border-b border-border/60 bg-gradient-to-r from-primary/5 to-transparent px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Target className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h2 className="text-base font-semibold text-foreground">Investment Profile</h2>
              {symbol && (
                <span className="whitespace-nowrap rounded-full border border-border dark:border-muted-foreground/20 bg-muted/60 px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
                  NSE: {symbol}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {sector ? `${sector} · ` : ""}Your entry target, conviction and strategy.
            </p>
          </div>
        </div>

        <CardContent className="px-5 py-6">
          <ResearchFields
            starRating={starRating}
            onStarRatingChange={handleStarRatingChange}
            strategy={strategy}
            onStrategyChange={handleStrategyChange}
            buyPriceDefaultValue={company.buy_price != null ? roundPrice(company.buy_price) : ""}
            buyPricePlaceholder={baseCaseBuyPrice != null ? String(roundPrice(baseCaseBuyPrice)) : "0.00"}
            buyPriceHint={buyPriceHint}
            onBuyPriceChange={handleBuyPriceChange}
            starRequired
            horizon={{ editable: false, years: horizon }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
