"use client";

import { StockResearchRecentSidebar } from "@/components/research/StockResearchRecentSidebar";
import { StockSearch } from "@/components/research/StockSearch";
import {
  RESEARCH_LANDING_CONTENT,
  RESEARCH_PIPELINE_STEPS,
} from "@/components/research/researchLandingContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useRecentStockResearches } from "@/hooks/useRecentStockResearches";
import type { InstrumentSuggestion } from "@/app/api/instruments/suggest/route";
import {
  RESEARCH_ASSET_CONFIG,
  type ResearchAssetType,
  type SerializedStockResearch,
} from "@/services/stockResearch/stockResearchTypes";
import { cn } from "@/lib/utils";
import {
  Check,
  CircleCheck,
  Clock,
  FileText,
  Globe,
  Info,
  LineChart,
  Link2,
  MapPin,
  MessageSquareText,
  Search,
  Sparkles,
  X,
} from "lucide-react";
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
  const content = RESEARCH_LANDING_CONTENT[assetType];
  const router = useRouter();
  const [selectedStock, setSelectedStock] =
    useState<InstrumentSuggestion | null>(null);
  const [prompt, setPrompt] = useState("");
  // Bumping `key` remounts the search box with a new starting query.
  const [searchSeed, setSearchSeed] = useState({ query: "", key: 0 });
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


  function seedSearch(query: string) {
    setSearchSeed((seed) => ({ query, key: seed.key + 1 }));
    setSelectedStock(null);
  }

  const step2Disabled = selectedStock === null || submitting;

  return (
    // Full-height panes, each scrolling on its own on lg+; stacked below lg.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="min-w-0 flex-1 lg:scroll-pane">
        <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-8 md:px-8 md:py-12">
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent">
                <Sparkles data-icon="inline-start" />
                AI research · Pro
              </Badge>
              <Badge variant="outline">
                <MapPin data-icon="inline-start" />
                India only
              </Badge>
              <Badge variant="outline">{content.marketLabel}</Badge>
            </div>
            <h1 className="font-display text-3xl tracking-tight md:text-4xl">
              {asset.title}
            </h1>
            <p className="max-w-2xl text-muted-foreground">
              {asset.description}
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <Clock className="size-4" />
                Ready in a few minutes
              </li>
              <li className="flex items-center gap-1.5">
                <LineChart className="size-4" />
                Live market data
              </li>
              <li className="flex items-center gap-1.5">
                <Link2 className="size-4" />
                Every claim cited
              </li>
            </ul>
          </header>

          <form onSubmit={onSubmit}>
            <Card>
              <CardContent className="flex flex-col gap-6">
                <section className="flex flex-col gap-3">
                  <StepHeading
                    step={1}
                    done={selectedStock !== null}
                    title={`Pick a ${asset.label}`}
                    hint={`Search ${content.marketLabel.toLowerCase()} by name or symbol.`}
                  />
                  <StockSearch
                    key={searchSeed.key}
                    defaultQuery={searchSeed.query}
                    autoFocus={searchSeed.key > 0}
                    endpoint={asset.suggestPath}
                    placeholder={asset.searchPlaceholder}
                    onSelect={setSelectedStock}
                    onClear={() => setSelectedStock(null)}
                  />
                  {selectedStock ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md bg-accent/15 px-3 py-2 text-sm ring-1 ring-accent/40">
                      <CircleCheck className="size-4 shrink-0 text-emerald-600" />
                      <span className="font-medium">{selectedStock.name}</span>
                      <span className="text-muted-foreground">
                        {selectedStock.tradingSymbol} · {selectedStock.exchange}{" "}
                        · {selectedStock.instrumentType}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Try:
                      </span>
                      {content.popularSearches.map((query) => (
                        <Button
                          key={query}
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => seedSearch(query)}
                        >
                          <Search data-icon="inline-start" />
                          {query}
                        </Button>
                      ))}
                    </div>
                  )}
                </section>

                <Separator />

                <section
                  className={cn(
                    "flex flex-col gap-3 transition-opacity",
                    selectedStock === null && "opacity-60",
                  )}
                >
                  <StepHeading
                    step={2}
                    done={trimmedPrompt.length >= MIN_PROMPT_CHARS}
                    title="Ask your question"
                    hint={
                      selectedStock
                        ? "Be specific — horizon, goal or what worries you."
                        : `Pick a ${asset.label} first.`
                    }
                    htmlFor="stock-research-prompt"
                  />
                  {selectedStock ? (
                    <div className="flex flex-wrap gap-2">
                      {content.sampleQuestions(selectedStock.name).map((q) => (
                        <button
                          key={q}
                          type="button"
                          disabled={submitting}
                          onClick={() => setPrompt(q)}
                          className={cn(
                            "rounded-full border border-border bg-background px-3 py-1 text-left text-xs transition-colors hover:border-foreground/40 hover:bg-muted/50 disabled:opacity-50",
                            prompt === q && "border-accent bg-accent/20",
                          )}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <Textarea
                    id="stock-research-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    maxLength={MAX_PROMPT_CHARS}
                    rows={4}
                    placeholder={
                      selectedStock
                        ? asset.promptPlaceholder(selectedStock.name)
                        : "Your question goes here once you've picked one above."
                    }
                    disabled={step2Disabled}
                  />
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      {prompt.length}/{MAX_PROMPT_CHARS} · You can leave the
                      page; the report keeps building.
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
                </section>
              </CardContent>
            </Card>
          </form>

          <section className="flex flex-col gap-4">
            <h2 className="font-display text-xl tracking-tight">
              How it works
            </h2>
            <ol className="grid gap-3 sm:grid-cols-2">
              {RESEARCH_PIPELINE_STEPS.map((step, index) => {
                const Icon = PIPELINE_ICONS[index];
                return (
                  <li
                    key={step.title}
                    className="flex gap-3 rounded-lg border border-border/60 bg-card p-4"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/30">
                      <Icon className="size-4" />
                    </span>
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium">
                        {index + 1}. {step.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {step.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4" />
                  What&apos;s in your report
                </CardTitle>
                <CardDescription>
                  Sections adapt to your question; sources are listed at the
                  end.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2.5">
                  {content.reportSections.map((section) => (
                    <li key={section.title} className="flex gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <span>
                        <span className="font-medium">{section.title}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          — {section.detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="size-4" />
                  Market coverage
                </CardTitle>
                <CardDescription>
                  We currently support{" "}
                  <span className="font-medium text-foreground">
                    India only
                  </span>{" "}
                  (NSE &amp; BSE). Prices are in INR.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="flex flex-col gap-2.5">
                  {content.covered.map((item) => (
                    <li key={item} className="flex gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Not supported yet
                  </p>
                  <ul className="flex flex-col gap-2.5">
                    {content.notCovered.map((item) => (
                      <li
                        key={item}
                        className="flex gap-2 text-sm text-muted-foreground"
                      >
                        <X className="mt-0.5 size-4 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="flex gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Reports are AI-generated for research and education. They are not
            investment advice — verify key figures and consult a SEBI-registered
            adviser before investing.
          </p>
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

const PIPELINE_ICONS = [MessageSquareText, LineChart, Search, FileText];

function StepHeading({
  step,
  done,
  title,
  hint,
  htmlFor,
}: {
  step: number;
  done: boolean;
  title: string;
  hint: string;
  htmlFor?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          done
            ? "bg-emerald-600 text-white"
            : "bg-foreground text-background",
        )}
      >
        {done ? <Check className="size-4" /> : step}
      </span>
      <div className="flex flex-col">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {title}
        </label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
