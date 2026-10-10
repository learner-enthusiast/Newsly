"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { InstrumentSuggestion } from "@/app/api/instruments/suggest/route";

const DEBOUNCE_MS = 250;

type StockSearchProps = {
  onSelect?: (instrument: InstrumentSuggestion) => void;
  /** Called when the user edits the text after picking a stock. */
  onClear?: () => void;
};

export function StockSearch({ onSelect, onClear }: StockSearchProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<InstrumentSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selected, setSelected] = useState<InstrumentSuggestion | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q || q === selected?.name) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ q, segment: "NSE_EQ" });
        const res = await fetch(`/api/instruments/suggest?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data: { suggestions: InstrumentSuggestion[] } = await res.json();
        setSuggestions(data.suggestions);
        setActiveIndex(-1);
        setIsOpen(true);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error);
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  function handleSelect(instrument: InstrumentSuggestion) {
    setSelected(instrument);
    setQuery(instrument.name);
    setSuggestions([]);
    setIsOpen(false);
    onSelect?.(instrument);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  const showList = isOpen && query.trim().length > 0;

  return (
    <div className="relative w-full">
      <Input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Search a stock by name or symbol…"
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (selected) {
            setSelected(null);
            onClear?.();
          }
          if (!value.trim()) {
            setSuggestions([]);
            setIsLoading(false);
          }
        }}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={handleKeyDown}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {isLoading && suggestions.length === 0 ? (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">Searching…</li>
          ) : suggestions.length === 0 ? (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">No matches</li>
          ) : (
            suggestions.map((instrument, index) => (
              <li
                key={instrument.instrumentKey}
                role="option"
                aria-selected={index === activeIndex}
                // Prevent input blur before the click registers.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(instrument)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-sm",
                  index === activeIndex && "bg-accent text-accent-foreground",
                )}
              >
                <span className="truncate">{instrument.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {instrument.tradingSymbol} · {instrument.exchange}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
