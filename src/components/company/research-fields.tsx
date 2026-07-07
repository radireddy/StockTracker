"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { StarRatingInput } from "@/components/ui/star-rating-input";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Uppercase, tracked micro-label — shared by every research/position field so
 *  the editor reads as a continuation of the header's metric grid. */
export function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}>
      {children}
    </span>
  );
}

/** Numeric input with a ₹ prefix baked in. */
export function MoneyInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        ₹
      </span>
      <Input className={cn("h-10 pl-7 text-base tabular-nums", className)} {...props} />
    </div>
  );
}

type HorizonConfig =
  | { editable: false; years: number } // Details tab: auto-derived, read-only
  | { editable: true }; // Add form: user enters a default

/**
 * The four research parameters — Target Buy Price, Star Rating, Strategy and
 * Horizon — shared by the company Details editor and the Add Company form so
 * both look and behave identically. Star rating and strategy are controlled and
 * mirrored into the enclosing <form> via hidden inputs; buy price submits via
 * its `name`. Horizon is the only field that differs (see `horizon`).
 */
export function ResearchFields({
  starRating,
  onStarRatingChange,
  strategy,
  onStrategyChange,
  buyPriceDefaultValue,
  buyPricePlaceholder = "0.00",
  buyPriceHint,
  onBuyPriceChange,
  starRequired = false,
  horizon,
}: {
  starRating: number;
  onStarRatingChange: (n: number) => void;
  strategy: string;
  onStrategyChange: (s: string) => void;
  buyPriceDefaultValue?: number | string;
  buyPricePlaceholder?: string;
  buyPriceHint?: React.ReactNode;
  onBuyPriceChange?: (val: string) => void;
  starRequired?: boolean;
  horizon: HorizonConfig;
}) {
  return (
    <>
      {/* Star rating + strategy are controlled; mirror them into the form. */}
      <input type="hidden" name="star_rating" value={starRating} />
      <input type="hidden" name="strategy" value={strategy} />
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
        {/* Target buy price */}
        <div className="space-y-2">
          <Label htmlFor="buy_price" className="p-0"><FieldLabel>Target Buy Price</FieldLabel></Label>
          <MoneyInput
            id="buy_price"
            name="buy_price"
            type="number"
            step="0.01"
            inputMode="decimal"
            defaultValue={buyPriceDefaultValue}
            placeholder={buyPricePlaceholder}
            onChange={onBuyPriceChange ? (e) => onBuyPriceChange(e.target.value) : undefined}
          />
          {buyPriceHint && <p className="text-xs text-muted-foreground tabular-nums">{buyPriceHint}</p>}
        </div>

        {/* Conviction — interactive stars */}
        <div className="space-y-2">
          <FieldLabel>Star Rating {starRequired && <span className="text-destructive">*</span>}</FieldLabel>
          <div className="flex h-10 items-center">
            <StarRatingInput value={starRating} onChange={onStarRatingChange} />
          </div>
        </div>

        {/* Strategy — segmented toggle */}
        <div className="space-y-2">
          <FieldLabel>Strategy</FieldLabel>
          <div className="flex h-10 items-center">
            <Segmented
              aria-label="Strategy"
              value={strategy}
              onValueChange={onStrategyChange}
              options={[
                { value: "core", label: "Core" },
                { value: "satellite", label: "Satellite" },
              ]}
            />
          </div>
        </div>

        {/* Horizon — editable in Add, read-only auto in Details */}
        <div className="space-y-2">
          {horizon.editable ? (
            <>
              <Label htmlFor="investment_horizon_years" className="p-0"><FieldLabel>Horizon (years)</FieldLabel></Label>
              <Input
                id="investment_horizon_years"
                name="investment_horizon_years"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 3"
                className="h-10 text-base tabular-nums"
              />
              <p className="text-xs text-muted-foreground">Sets the default estimate years in the Financial Model</p>
            </>
          ) : (
            <>
              <FieldLabel>Horizon</FieldLabel>
              <div className="flex h-10 items-center gap-2">
                <span className="text-base font-semibold tabular-nums text-foreground">
                  {horizon.years} {horizon.years === 1 ? "year" : "years"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Auto
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Derived from Financial Model estimates</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
