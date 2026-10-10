"use client";

import { ResearchMarkdown } from "@/components/research/ResearchMarkdown";
import {
  formatStockResearchDateTime,
  StockResearchRecentSidebar,
} from "@/components/research/StockResearchRecentSidebar";
import { LoadingLogLines } from "@/components/shared/LoadingLogLines";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { ShimmerLoadingStatus } from "@/components/ui/shimmer-loading-status";
import { Spinner } from "@/components/ui/spinner";
import { useRecentStockResearches } from "@/hooks/useRecentStockResearches";
import { cn } from "@/lib/utils";
import {
  formatStockResearchStatusLabel,
  formatStockResearchTitle,
  isStockResearchInProgress,
  type SerializedStockResearch,
  type StockResearchDetailPayload,
} from "@/services/stockResearch/stockResearchTypes";
import { ExternalLink, RotateCcw } from "lucide-react";
import Link from "next/link";

/** Loading-log lines the pipeline appends on a full successful run. */
const EXPECTED_PIPELINE_LOG_LINES = 10;

const STOCK_RESEARCH_WAIT_MESSAGES = [
  "Pulling live market data…",
  "Reading recent results coverage…",
  "Checking fundamentals and ratios…",
  "Cross-checking news sources…",
  "Drafting your research report…",
] as const;

function progressPercent(research: SerializedStockResearch): number {
  if (research.status === "COMPLETED") {
    return 100;
  }
  const done = research.loadingLogs.length;
  return Math.min(95, Math.max(5, (done / EXPECTED_PIPELINE_LOG_LINES) * 100));
}

function statusBadgeVariant(
  status: SerializedStockResearch["status"],
): "secondary" | "destructive" | "outline" {
  if (status === "COMPLETED") {
    return "secondary";
  }
  if (status === "FAILED") {
    return "destructive";
  }
  return "outline";
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ResearchProgressCard({
  research,
  busy,
}: {
  research: SerializedStockResearch;
  busy: boolean;
}) {
  const rounded = Math.round(progressPercent(research));
  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          Progress
          {busy ? <Spinner className="text-primary" /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        {busy ? (
          <Progress value={rounded} className="w-full">
            <div className="flex w-full items-center gap-2">
              <ProgressLabel>Researching</ProgressLabel>
              <ProgressValue />
            </div>
          </Progress>
        ) : null}
        {research.loadingLogs.length > 0 ? (
          <LoadingLogLines loadingLogs={research.loadingLogs} busy={busy} />
        ) : (
          <p className="text-sm text-muted-foreground">Waiting to start…</p>
        )}
      </CardContent>
    </Card>
  );
}

function ResearchBriefCard({
  research,
}: {
  research: SerializedStockResearch;
}) {
  const enhanced =
    research.query && research.query !== research.userPrompt
      ? research.query
      : null;
  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-sm">Research brief</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase">
            You asked
          </p>
          <p className="mt-1">{research.userPrompt ?? research.query}</p>
        </div>
        {enhanced ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase">
              Refined brief
            </p>
            <p className="mt-1 text-muted-foreground">{enhanced}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WaitPanel({ research }: { research: SerializedStockResearch }) {
  const rounded = Math.round(progressPercent(research));
  return (
    <Card className="shadow-editorial">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-xl">
          {research.status === "PENDING"
            ? "Starting your research"
            : "Researching your stock"}
          <Spinner className="text-primary" />
        </CardTitle>
        <CardDescription>
          Stock research usually takes a few minutes. You can stay here or come
          back later — this page updates on its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Progress value={rounded} className="w-full">
          <div className="flex w-full items-center gap-2">
            <ProgressLabel>Research progress</ProgressLabel>
            <Spinner className="text-accent" />
            <ProgressValue />
          </div>
        </Progress>
        <ShimmerLoadingStatus
          layout="inline"
          messages={STOCK_RESEARCH_WAIT_MESSAGES}
          statusLabel="Research in progress"
        />
      </CardContent>
    </Card>
  );
}

type StockResearchResultViewProps = {
  researchId: string;
  data: StockResearchDetailPayload;
};

export function StockResearchResultView({
  researchId,
  data,
}: StockResearchResultViewProps) {
  const research = data.stockResearch;
  const busy = isStockResearchInProgress(research.status);
  // Refetch the sidebar when this research changes status.
  const { recentResearches, total, recentLoading } = useRecentStockResearches(
    undefined,
    research.status,
  );

  const webSources = data.resources.filter(
    (row) => row.provider === "FIRECRAWL" && row.url,
  );
  const dataTools = data.resources
    .filter((row) => row.provider === "UPSTOX" && row.tool)
    .map((row) => row.tool!);

  const rightSidebar = (
    <div className="flex flex-col gap-4">
      <ResearchProgressCard research={research} busy={busy} />
      <ResearchBriefCard research={research} />
    </div>
  );

  return (
    // Full-height panes, each scrolling on its own on lg+ (sidebars hidden below
    // their breakpoints, where the stacked content scrolls as one).
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="scroll-pane hidden w-[280px] shrink-0 border-r border-border/60 bg-muted/20 px-4 py-6 lg:block">
        <StockResearchRecentSidebar
          recentResearches={recentResearches}
          recentLoading={recentLoading}
          total={total}
          activeResearchId={researchId}
          showNewButton
        />
      </div>

      <div className="min-w-0 flex-1 lg:scroll-pane">
        <header className="sticky top-0 z-10 border-b border-border/60 bg-background/90 px-4 py-4 backdrop-blur md:px-8">
          <div className="mx-auto flex max-w-4xl flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl tracking-tight md:text-2xl">
                {formatStockResearchTitle(research)}
              </h1>
              <Badge variant={statusBadgeVariant(research.status)}>
                {formatStockResearchStatusLabel(research.status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {[
                research.exchange,
                formatStockResearchDateTime(research.createdAt),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-4xl space-y-6 px-4 pt-6 pb-16 md:px-8">
          {/* Below xl the side panel joins the main flow: above while running, after the report once done. */}
          {busy ? <div className="xl:hidden">{rightSidebar}</div> : null}

          {busy ? <WaitPanel research={research} /> : null}

          {research.status === "FAILED" ? (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-destructive">
                  Research failed
                </CardTitle>
                <CardDescription>
                  {research.error ??
                    "Something went wrong while researching this stock."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/stockResearch"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                  )}
                >
                  <RotateCcw data-icon="inline-start" />
                  Start a new research
                </Link>
              </CardContent>
            </Card>
          ) : null}

          {research.status === "COMPLETED" && research.reportMarkdown ? (
            <Card className="shadow-editorial">
              <CardHeader className="border-b pb-3">
                <CardTitle className="font-display text-lg">
                  Research report
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ResearchMarkdown content={research.reportMarkdown} />
              </CardContent>
            </Card>
          ) : null}

          {research.status === "COMPLETED" &&
          (webSources.length > 0 || dataTools.length > 0) ? (
            <Card size="sm">
              <CardHeader className="border-b pb-3">
                <CardTitle className="text-sm">Sources used</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-4">
                {webSources.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {webSources.map((source) => (
                      <li key={source.id}>
                        <a
                          href={source.url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-2 text-sm hover:underline"
                        >
                          <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="line-clamp-1 font-medium">
                              {source.title ?? source.url}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {source.source ?? hostLabel(source.url!)}
                            </span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {dataTools.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {dataTools.map((tool) => (
                      <Badge key={tool} variant="outline">
                        Upstox · {tool}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {!busy ? <div className="xl:hidden">{rightSidebar}</div> : null}
        </div>
      </div>

      <aside className="scroll-pane hidden w-[340px] shrink-0 border-l border-border/60 bg-muted/20 px-4 py-6 xl:block">
        {rightSidebar}
      </aside>
    </div>
  );
}
