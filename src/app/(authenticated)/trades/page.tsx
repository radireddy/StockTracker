"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TradesPnlBar } from "@/components/trades/trades-pnl-bar";
import { TradesTable } from "@/components/trades/trades-table";
import { TradeImportButton } from "@/components/trades/trade-import-button";
import { AccountFilter } from "@/components/account/account-filter";
import { useTradesData } from "@/hooks/use-trades-data";
import { getAccounts } from "@/app/(authenticated)/actions/account-actions";
import type { DashboardAccount } from "@/hooks/use-dashboard-data";

function useTradeAccounts() {
  return useQuery<DashboardAccount[]>({
    queryKey: ["trade-accounts"],
    queryFn: () => getAccounts(),
    staleTime: 60_000,
  });
}

export default function TradesDashboardPage() {
  const [accountFilter, setAccountFilter] = useState("all");
  const { data: positions = [], isLoading } = useTradesData(accountFilter);
  const { data: accounts = [] } = useTradeAccounts();

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Trades Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Open positions derived from imported tradebooks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AccountFilter
            accounts={accounts}
            value={accountFilter}
            onChange={setAccountFilter}
          />
          <TradeImportButton />
        </div>
      </div>

      {/* Summary bar */}
      {positions.length > 0 && <TradesPnlBar positions={positions} />}

      {/* Positions table */}
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Loading positions…
        </div>
      ) : (
        <TradesTable positions={positions} accountFilter={accountFilter} />
      )}
    </div>
  );
}
