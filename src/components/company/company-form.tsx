"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ResearchFields, FieldLabel, MoneyInput } from "@/components/company/research-fields";
import { AccountSelect } from "@/components/account/account-select";
import { StockSearch } from "@/components/company/stock-search";
import { createCompany } from "@/app/(authenticated)/actions/company-actions";
import { createCompanyWithHolding } from "@/app/(authenticated)/actions/holdings-actions";
import { getAccounts } from "@/app/(authenticated)/actions/account-actions";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";
import { roundPrice } from "@/lib/utils/calculations";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";
import type { IndianStock, Account } from "@/types/database";
import {
  Building2,
  Check,
  ChevronDown,
  Search,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";

/** Section header: tinted icon badge + title + optional hint. One definition,
 *  reused for every card so the flow reads as consistent steps. */
function SectionHeader({
  icon: Icon,
  title,
  hint,
  required,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">
          {title}
          {required && <span className="ml-1 text-destructive">*</span>}
        </h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

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
  const [quantity, setQuantity] = useState("");
  const [avgPrice, setAvgPrice] = useState("");

  // Research (shared with the Details editor's controls)
  const [starRating, setStarRating] = useState(2);
  const [strategy, setStrategy] = useState("core");

  const loadAccounts = useCallback(function loadAccounts() {
    getAccounts()
      .then(setAccounts)
      .catch((err) => {
        setAccounts([]);
        toastError(err, { message: "Couldn't load your accounts.", retry: loadAccounts });
      });
  }, []);

  useEffect(() => {
    if (isHoldings) {
      loadAccounts();
    } else {
      Promise.resolve().then(() => {
        setAccountId("");
        setQuantity("");
        setAvgPrice("");
      });
    }
  }, [isHoldings, loadAccounts]);

  const done = () => {
    invalidate();
    toast.success("Company added");
    router.push("/dashboard");
  };
  const fail = (result: unknown) => {
    toastError(result);
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
      const res = await createCompany(fd);
      if (!res.ok) return fail(res);
      done();
      return;
    }

    // Holdings: account is mandatory; quantity & avg price can be added later.
    if (!accountId) {
      toast.error("Account is required.", { description: "Select an account, or add one in Settings." });
      return;
    }
    if (quantity && !(Number(quantity) > 0)) {
      toast.error("Quantity must be positive.", { description: "Enter a quantity greater than zero." });
      return;
    }
    if (avgPrice && Number(avgPrice) < 0) {
      toast.error("Average price cannot be negative.", { description: "Enter a price of zero or more." });
      return;
    }
    fd.set("account_id", accountId);
    if (quantity) fd.set("quantity", quantity);
    if (avgPrice) fd.set("avg_buy_price", avgPrice);

    setPending(true);
    const res = await createCompanyWithHolding(fd);
    if (!res.ok) return fail(res);
    done();
  };

  const researchFields = (
    <ResearchFields
      starRating={starRating}
      onStarRatingChange={setStarRating}
      strategy={strategy}
      onStrategyChange={setStrategy}
      horizon={{ editable: true }}
    />
  );

  const portfolioColor = selectedPortfolio?.color ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Hero — destination + inline switcher */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/12 via-primary/5 to-transparent p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-soft">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Add a Company</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Adding to</span>
              <div className="relative inline-flex items-center">
                {portfolioColor && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: portfolioColor }}
                  />
                )}
                <select
                  value={selectedId}
                  onChange={(e) => select(e.target.value)}
                  className={cn(
                    "h-8 appearance-none rounded-lg border border-input bg-card pr-7 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    portfolioColor ? "pl-6" : "pl-2.5"
                  )}
                >
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <Badge variant={isHoldings ? "default" : "secondary"} className="capitalize">
                {isHoldings ? "Holdings" : "Watchlist"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Step 1 — Stock */}
        <Card className="shadow-soft overflow-visible">
          <CardContent className="space-y-4 px-5 py-5">
            <SectionHeader icon={Search} title="Select stock" hint="Search the NSE by name or symbol" required />
            <StockSearch
              inputId="stock-search"
              onSelect={setSelectedStock}
              selected={selectedStock}
              onClear={() => setSelectedStock(null)}
            />
            {selectedStock && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-sm">
                <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
                <span className="font-medium">{selectedStock.name}</span>
                {selectedStock.nse_symbol && (
                  <span className="text-muted-foreground">({selectedStock.nse_symbol})</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2 — Position (holdings only) */}
        {isHoldings && (
          <Card className="shadow-soft">
            <CardContent className="space-y-4 px-5 py-5">
              <SectionHeader
                icon={Wallet}
                title="Position"
                hint="Account is required; quantity & price can be added later"
                required
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="position-account" className="p-0"><FieldLabel>Account</FieldLabel></Label>
                  <AccountSelect id="position-account" accounts={accounts} value={accountId} onChange={setAccountId} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position-quantity" className="p-0"><FieldLabel>Quantity</FieldLabel></Label>
                  <Input id="position-quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="e.g. 100" className="h-10 text-base tabular-nums" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position-avg-price" className="p-0"><FieldLabel>Avg Buy Price</FieldLabel></Label>
                  <MoneyInput id="position-avg-price" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} inputMode="decimal" placeholder="245.50" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 — Research (collapsible for holdings, always shown for watchlist) */}
        <Card className="shadow-soft">
          <CardContent className="px-5 py-5">
            {isHoldings ? (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <SectionHeader icon={Sparkles} title="Research details" hint="Optional — your thesis and conviction" />
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-5 border-t border-border/60 pt-5">{researchFields}</div>
              </details>
            ) : (
              <div className="space-y-5">
                <SectionHeader icon={Sparkles} title="Research details" hint="Your thesis and conviction" />
                {researchFields}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" size="lg" disabled={pending || !selectedStock} className="gap-1.5 px-6">
            <Check className="h-4 w-4" />
            {pending ? "Creating…" : isHoldings ? "Add to Holdings" : "Add to Watchlist"}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
