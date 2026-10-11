"use client";

import { StockResearchRecentSidebar } from "@/components/research/StockResearchRecentSidebar";
import { StockSearch } from "@/components/research/StockSearch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useRecentStockResearches } from "@/hooks/useRecentStockResearches";
import type { InstrumentSuggestion } from "@/app/api/instruments/suggest/route";
import {
  RESEARCH_ASSET_CONFIG,
  type ResearchAssetType,
  type SerializedStockResearch,
} from "@/services/stockResearch/stockResearchTypes";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

const MIN_PROMPT_CHARS = 3;
const MAX_PROMPT_CHARS = 2000;

export function StockResearchWorkspace({
  assetType = "STOCK",
}: {
  assetType?: ResearchAssetType;
}) {
  const asset = RESEARCH_ASSET_CONFIG[assetType];
  const router = useRouter();
  const [selectedStock, setSelectedStock] =
    useState<InstrumentSuggestion | null>(null);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { recentResearches, total, recentLoading } = useRecentStockResearches(
    undefined,
    null,
    assetType,
  );

  const trimmedPrompt = prompt.trim();
  const canSubmit =
    selectedStock !== null &&
    trimmedPrompt.length >= MIN_PROMPT_CHARS &&
    !submitting;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStock || !canSubmit) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/stockResearch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType,
          instrumentKey: selectedStock.instrumentKey,
          prompt: trimmedPrompt,
        }),
      });
      const payload = (await response.json()) as {
        stockResearch?: SerializedStockResearch;
        error?: string;
      };
      if (!response.ok || !payload.stockResearch) {
        throw new Error(payload.error ?? "Failed to start research");
      }
      router.push(`${asset.basePath}/${payload.stockResearch.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start research",
      );
      setSubmitting(false);
    }
  }

  return (
    // Full-height panes, each scrolling on its own on lg+; stacked below lg.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="min-w-0 flex-1 lg:scroll-pane">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:px-8 md:py-12">
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-3xl tracking-tight">
              {asset.title}
            </h1>
            <p className="text-muted-foreground">{asset.description}</p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <StockSearch
              endpoint={asset.suggestPath}
              placeholder={asset.searchPlaceholder}
              onSelect={setSelectedStock}
              onClear={() => setSelectedStock(null)}
            />

            {selectedStock ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-base">
                    {selectedStock.name}
                  </CardTitle>
                  <CardDescription>
                    {selectedStock.tradingSymbol} · {selectedStock.exchange} ·{" "}
                    {selectedStock.instrumentType}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <label
                    htmlFor="stock-research-prompt"
                    className="text-sm font-medium"
                  >
                    What do you want to research?
                  </label>
                  <Textarea
                    id="stock-research-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    maxLength={MAX_PROMPT_CHARS}
                    rows={4}
                    placeholder={asset.promptPlaceholder(selectedStock.name)}
                    disabled={submitting}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Research takes a few minutes. You can leave the page and
                      come back.
                    </p>
                    <Button
                      type="submit"
                      variant="brand-accent"
                      disabled={!canSubmit}
                    >
                      {submitting ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <Sparkles data-icon="inline-start" />
                      )}
                      {submitting ? "Starting…" : "Start research"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </form>
        </div>
      </div>

      <div className="border-t border-border/60 bg-muted/20 px-4 py-6 lg:scroll-pane lg:w-[320px] lg:shrink-0 lg:border-t-0 lg:border-l">
        <StockResearchRecentSidebar
          basePath={asset.basePath}
          recentResearches={recentResearches}
          recentLoading={recentLoading}
          total={total}
        />
      </div>
    </div>
  );
}
