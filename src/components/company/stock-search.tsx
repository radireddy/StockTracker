"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchStocks } from "@/app/(authenticated)/actions/stock-actions";
import type { IndianStock } from "@/types/database";

interface StockSearchProps {
  onSelect: (stock: IndianStock) => void;
  selected?: IndianStock | null;
  onClear?: () => void;
  disabled?: boolean;
}

export function StockSearch({
  onSelect,
  selected = null,
  onClear,
  disabled = false,
}: StockSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IndianStock[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const stocks = await searchStocks(q);
      setResults(stocks);
      setIsOpen(stocks.length > 0);
    } catch {
      setResults([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      doSearch(value);
    }, 300);
  };

  const handleSelect = (stock: IndianStock) => {
    onSelect(stock);
    setQuery("");
    setResults([]);
    setIsOpen(false);
  };

  const handleClear = () => {
    onClear?.();
    setQuery("");
    setResults([]);
    setIsOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function formatExchangeInfo(stock: IndianStock): string {
    const parts: string[] = [];
    if (stock.nse_symbol) parts.push(`NSE: ${stock.nse_symbol}`);
    if (stock.bse_code) parts.push(`BSE: ${stock.bse_code}`);
    return parts.join(" / ");
  }

  // Selected state: show read-only display
  if (selected) {
    const exchangeInfo = formatExchangeInfo(selected);

    return (
      <div className="rounded-md border border-input bg-muted/50 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{selected.name}</span>
              {exchangeInfo && (
                <span className="text-sm text-muted-foreground">
                  ({exchangeInfo})
                </span>
              )}
            </div>
            {selected.sector && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {selected.sector}
              </p>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="mt-0.5 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Search state: show input with dropdown
  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder="Type company name or symbol..."
        disabled={disabled}
        autoComplete="off"
      />

      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      )}

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-input bg-popover shadow-md">
          {results.map((stock) => {
            const exchangeInfo = formatExchangeInfo(stock);
            const sectorPart = stock.sector ? ` \u00b7 ${stock.sector}` : "";

            return (
              <button
                key={stock.isin}
                type="button"
                onClick={() => handleSelect(stock)}
                className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
              >
                <div className="font-medium">{stock.name}</div>
                {(exchangeInfo || stock.sector) && (
                  <div className="text-xs text-muted-foreground">
                    {exchangeInfo}
                    {sectorPart}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
