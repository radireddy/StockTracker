import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { marginOfSafety, isBuySignal } from "@/lib/utils/calculations";
import type { Company } from "@/types/database";

export function CompanyHeader({ company }: { company: Company }) {
  const mos =
    company.buy_price && company.current_price
      ? marginOfSafety(company.buy_price, company.current_price)
      : null;
  const buy = isBuySignal(company.current_price, company.buy_price);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 pt-6">
        <div>
          <h1 className="text-2xl font-bold">{company.name}</h1>
          {company.symbol && (
            <p className="text-sm text-muted-foreground">{company.symbol}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {company.star_rating && (
            <Badge variant="outline">
              {"★".repeat(company.star_rating)}
            </Badge>
          )}
          {company.strategy && (
            <Badge variant={company.strategy === "core" ? "default" : "secondary"}>
              {company.strategy}
            </Badge>
          )}
          {buy && <Badge className="bg-green-600 text-white">BUY</Badge>}
        </div>
        <div className="ml-auto flex gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Current: </span>
            <span className="font-medium">
              {company.current_price != null ? `₹${company.current_price.toLocaleString("en-IN")}` : "-"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Buy: </span>
            <span className="font-medium">
              {company.buy_price != null ? `₹${company.buy_price.toLocaleString("en-IN")}` : "-"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">MoS: </span>
            <span
              className={`font-medium ${
                mos != null
                  ? mos > 0
                    ? "text-green-600"
                    : "text-red-600"
                  : ""
              }`}
            >
              {mos != null ? `${(mos * 100).toFixed(1)}%` : "-"}
            </span>
          </div>
          {company.market_cap != null && (
            <div>
              <span className="text-muted-foreground">MCap: </span>
              <span className="font-medium">
                ₹{company.market_cap.toLocaleString("en-IN")} Cr
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
