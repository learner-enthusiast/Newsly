"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DiscoveryPipelineIndicator } from "@/components/discovery/pipeline-indicator";
import type { DiscoveryRunResponse } from "@/lib/discovery-run-serializer";

const POLL_MS = 4000;

const STATUS_LABEL: Record<DiscoveryRunResponse["status"], string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

const REGION_LABEL: Record<DiscoveryRunResponse["region"], string> = {
  INDIA: "India",
  WORLD: "World",
  BOTH: "India + World",
};

export function DiscoveryRunStatus({ runId }: { runId: string }) {
  const [run, setRun] = useState<DiscoveryRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRun = useCallback(async () => {
    const response = await fetch(`/api/discovery/${runId}`, {
      cache: "no-store",
    });
    if (response.status === 404) {
      setError("Discovery run not found.");
      return null;
    }
    if (!response.ok) {
      setError("Could not load discovery run.");
      return null;
    }
    const payload = (await response.json()) as DiscoveryRunResponse;
    setRun(payload);
    setError(null);
    return payload;
  }, [runId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      await fetchRun();
      if (!cancelled) {
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchRun]);

  useEffect(() => {
    if (!run) {
      return;
    }
    if (run.status === "COMPLETED" || run.status === "FAILED") {
      return;
    }

    const timer = setInterval(() => {
      void fetchRun();
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [run, fetchRun]);

  if (loading && !run) {
    return (
      <p className="text-sm text-muted-foreground">Loading run status…</p>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!run) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">Discovery run</CardTitle>
          <Badge variant={run.status === "FAILED" ? "destructive" : "secondary"}>
            {STATUS_LABEL[run.status]}
          </Badge>
        </div>
        <CardDescription className="font-mono text-xs">{run.id}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Region</dt>
            <dd className="font-medium">{REGION_LABEL[run.region]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Period</dt>
            <dd className="font-medium capitalize">{run.period.toLowerCase()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Date range</dt>
            <dd className="font-medium">
              {run.startDate} → {run.endDate}
            </dd>
          </div>
        </dl>

        {(run.status === "RUNNING" || run.status === "PENDING") && (
          <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            <span className="font-medium text-foreground">Discovery started.</span>{" "}
            Processing in background — this page updates automatically.
          </p>
        )}

        {run.metadata &&
        typeof run.metadata === "object" &&
        !Array.isArray(run.metadata) &&
        "discovery" in (run.metadata as Record<string, unknown>) ? (
          <dl className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Search tasks</dt>
              <dd className="font-medium">
                {String(
                  (run.metadata as { discovery?: { plannedTasks?: number } })
                    .discovery?.plannedTasks ?? "—",
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Raw results</dt>
              <dd className="font-medium">
                {String(
                  (run.metadata as { discovery?: { rawResultsPersisted?: number } })
                    .discovery?.rawResultsPersisted ?? "—",
                )}
              </dd>
            </div>
          </dl>
        ) : null}

        <DiscoveryPipelineIndicator
          status={run.status}
          metadata={run.metadata}
        />
      </CardContent>
    </Card>
  );
}
