"use client";

import { useState } from "react";
import { StockSearch } from "@/components/research/StockSearch";
import type { InstrumentSuggestion } from "@/app/api/instruments/suggest/route";

export function StockResearchWorkspace() {
  const [selectedStock, setSelectedStock] =
    useState<InstrumentSuggestion | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 md:px-6 md:py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl tracking-tight">Stock research</h1>
        <p className="text-muted-foreground">
          Search for a stock to start researching it.
        </p>
      </div>

      <StockSearch onSelect={setSelectedStock} />

      {selectedStock && (
        <p className="text-sm text-muted-foreground">
          Selected:{" "}
          <span className="font-medium text-foreground">{selectedStock.name}</span>{" "}
          ({selectedStock.tradingSymbol} · {selectedStock.exchange})
        </p>
      )}
    </div>
  );
}
