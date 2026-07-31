"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchStocks } from "@/app/(authenticated)/actions/stock-actions";
import type { IndianStock } from "@/types/database";

interface StockSearchProps {
  onSelect: (stock: IndianStock) => void;
  selected?: IndianStock | null;
  onClear?: () => void;
  disabled?: boolean;
  /** id applied to the search input so an external <label htmlFor> can associate with it. */
  inputId?: string;
}

export function StockSearch({
  onSelect,
  selected = null,
  onClear,
  disabled = false,
  inputId,
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

  // Selected state: pill token
  if (selected) {
    const symbol = selected.nse_symbol ?? selected.bse_code ?? null;

    return (
      <div className="flex h-10 items-center gap-2 rounded-md border border-primary bg-primary/5 px-3">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {selected.name}
        </span>
        {symbol && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-bold bg-primary/10 text-primary">
            {symbol}
          </span>
        )}
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  // Search state: show input with dropdown
  return (
    <div ref={containerRef} className="relative">
      <Input
        id={inputId}
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
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-primary/10 hover:text-primary"
                }`}
              >
                <div className="font-medium">{stock.name}</div>
                {(exchangeInfo || stock.sector) && (
                  <div className={`text-xs ${isActive ? "text-primary/70" : "text-muted-foreground"}`}>
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
