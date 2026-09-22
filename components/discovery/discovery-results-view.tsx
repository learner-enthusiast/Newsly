"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StoryCard } from "@/components/discovery/story-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DiscoveryRunResponse } from "@/lib/discovery-run-serializer";
import type { DiscoveryStorySummary } from "@/services/news/discovery-results.service";

type ResultsPayload = {
  discoveryRun: DiscoveryRunResponse;
  india: DiscoveryStorySummary[];
  world: DiscoveryStorySummary[];
};

const REGION_LABEL: Record<DiscoveryRunResponse["region"], string> = {
  INDIA: "India",
  WORLD: "World",
  BOTH: "India + World",
};

export function DiscoveryResultsView({ discoveryRunId }: { discoveryRunId: string }) {
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch(`/api/discovery/${discoveryRunId}/results`, {
      cache: "no-store",
    });
    if (response.status === 409) {
      const body = (await response.json()) as {
        discoveryRun?: DiscoveryRunResponse;
      };
      setData(
        body.discoveryRun
          ? { discoveryRun: body.discoveryRun, india: [], world: [] }
          : null,
      );
      setError("Pipeline still running. Results appear when status is Completed.");
      return;
    }
    if (!response.ok) {
      setError("Could not load results.");
      return;
    }
    const payload = (await response.json()) as ResultsPayload;
    setData(payload);
    setError(null);
  }, [discoveryRunId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      await load();
      if (!cancelled) {
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!data || data.discoveryRun.status === "COMPLETED") {
      return;
    }
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [data, load]);

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">Loading results…</p>;
  }

  if (error && !data?.discoveryRun) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!data) {
    return null;
  }

  const run = data.discoveryRun;
  const showIndia = run.region === "INDIA" || run.region === "BOTH";
  const showWorld = run.region === "WORLD" || run.region === "BOTH";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button render={<Link href="/dashboard" />} variant="outline" size="sm">
          ← Dashboard
        </Button>
        <Button
          render={<Link href={`/dashboard/runs/${discoveryRunId}`} />}
          variant="ghost"
          size="sm"
        >
          Run status
        </Button>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Discovery Results
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant={run.status === "COMPLETED" ? "secondary" : "outline"}>
            {run.status}
          </Badge>
          <span>{REGION_LABEL[run.region]}</span>
          <span>·</span>
          <span className="capitalize">{run.period.toLowerCase()}</span>
          <span>·</span>
          <span>
            {run.startDate} → {run.endDate}
          </span>
        </div>
        {run.status !== "COMPLETED" ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Processing in background. Top stories will appear when the run is
            Completed.
          </p>
        ) : null}
        {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
      </header>

      {showIndia ? (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">India — Top 5</h2>
          {data.india.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stories yet.</p>
          ) : (
            <div className="grid gap-4">
              {data.india.map((story) => (
                <StoryCard
                  key={story.eventId}
                  discoveryRunId={discoveryRunId}
                  story={story}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showWorld ? (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">World — Top 5</h2>
          {data.world.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stories yet.</p>
          ) : (
            <div className="grid gap-4">
              {data.world.map((story) => (
                <StoryCard
                  key={story.eventId}
                  discoveryRunId={discoveryRunId}
                  story={story}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
