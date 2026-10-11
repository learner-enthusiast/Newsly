"use client";

import { EtfSearch } from "@/components/research/EtfSearch";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InstrumentSuggestion } from "@/app/api/instruments/suggest/route";
import { useState } from "react";

export function EtfResearchWorkspace() {
  const [selectedEtf, setSelectedEtf] = useState<InstrumentSuggestion | null>(
    null,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:px-8 md:py-12">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-3xl tracking-tight">ETF research</h1>
          <p className="text-muted-foreground">
            Search and select an ETF. Deeper research tools will be added here
            soon.
          </p>
        </div>

        <EtfSearch
          onSelect={setSelectedEtf}
          onClear={() => setSelectedEtf(null)}
        />

        {selectedEtf ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-base">{selectedEtf.name}</CardTitle>
              <CardDescription>
                {selectedEtf.tradingSymbol} · {selectedEtf.exchange} ·{" "}
                {selectedEtf.segment}
                {selectedEtf.shortName ? ` · ${selectedEtf.shortName}` : ""}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
