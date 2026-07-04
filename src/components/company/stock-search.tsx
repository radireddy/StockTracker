"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const doSearch = useCallback(async (q: string) => {
    setActiveIndex(-1);
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const stocks = await searchStocks(q);
      setResults(stocks);
      setActiveIndex(-1);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % results.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(results.length - 1);
        break;
      case "Enter":
        if (activeIndex >= 0 && activeIndex < results.length) {
          e.preventDefault();
          handleSelect(results[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  // Keep the active option scrolled into view during keyboard navigation
  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView({ block: "nearest" });
    // optionId is derived from a stable useId, so it is intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

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
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
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
        <div
          id={listboxId}
          role="listbox"
          aria-label="Stock search results"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-input bg-popover shadow-md"
        >
          {results.map((stock, index) => {
            const exchangeInfo = formatExchangeInfo(stock);
            const sectorPart = stock.sector ? ` \u00b7 ${stock.sector}` : "";
            const isActive = index === activeIndex;

            return (
              <div
                key={stock.isin}
                id={optionId(index)}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(stock)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`w-full cursor-pointer px-3 py-2 text-left ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <div className="font-medium">{stock.name}</div>
                {(exchangeInfo || stock.sector) && (
                  <div className="text-xs text-muted-foreground">
                    {exchangeInfo}
                    {sectorPart}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
