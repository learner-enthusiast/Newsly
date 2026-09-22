"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  dateRangeForDiscoveryPeriod,
  formatDateInputValue,
} from "@/domain/news/discovery-period";
import type { DiscoveryPeriodInput, RequestRegionInput } from "@/domain/news/schemas/shared";

type PeriodOption = DiscoveryPeriodInput;
type RegionOption = RequestRegionInput;

const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: "DAY", label: "Day" },
  { value: "WEEK", label: "Week" },
  { value: "MONTH", label: "Month" },
];

const REGION_OPTIONS: { value: RegionOption; label: string }[] = [
  { value: "INDIA", label: "India" },
  { value: "WORLD", label: "World" },
  { value: "BOTH", label: "India + World" },
];

export function DiscoveryForm() {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodOption>("WEEK");
  const [region, setRegion] = useState<RegionOption>("INDIA");
  const [customRange, setCustomRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedRunId, setStartedRunId] = useState<string | null>(null);

  const derivedRange = useMemo(() => {
    const range = dateRangeForDiscoveryPeriod(period);
    return {
      start: formatDateInputValue(range.startDate),
      end: formatDateInputValue(range.endDate),
    };
  }, [period]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStartedRunId(null);

    const body: Record<string, string> = { period, region };
    if (customRange) {
      if (!startDate || !endDate) {
        setError("Choose both start and end dates for a custom range.");
        return;
      }
      if (startDate > endDate) {
        setError("Start date must be on or before end date.");
        return;
      }
      body.startDate = startDate;
      body.endDate = endDate;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as {
        discoveryRunId?: string;
        error?: string;
        details?: unknown;
      };

      if (!response.ok) {
        setError(payload.error ?? "Failed to start discovery.");
        return;
      }

      if (!payload.discoveryRunId) {
        setError("Unexpected response from server.");
        return;
      }

      setStartedRunId(payload.discoveryRunId);
      router.push(`/dashboard/runs/${payload.discoveryRunId}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run Discovery</CardTitle>
        <CardDescription>
          Starts a background job. You do not need to keep this page open.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Period</legend>
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={period === option.value ? "brand" : "outline"}
                  onClick={() => setPeriod(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Region</legend>
            <div className="flex flex-wrap gap-2">
              {REGION_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={region === option.value ? "brand" : "outline"}
                  onClick={() => setRegion(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Date range</p>
                <p className="text-xs text-muted-foreground">
                  {customRange
                    ? "Custom range"
                    : `Derived from period: ${derivedRange.start} → ${derivedRange.end}`}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCustomRange((value) => !value);
                  if (!customRange) {
                    setStartDate(derivedRange.start);
                    setEndDate(derivedRange.end);
                  }
                }}
              >
                {customRange ? "Use derived range" : "Custom dates"}
              </Button>
            </div>
            {customRange ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Start</span>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">End</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </label>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {startedRunId ? (
            <p className="text-sm text-muted-foreground">
              Discovery started — redirecting to run status…
            </p>
          ) : null}

          <Button
            type="submit"
            variant="brand"
            disabled={submitting}
            className={cn(submitting && "opacity-80")}
          >
            {submitting ? "Starting…" : "Run Discovery"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
