"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DiscoveryStoryDetail } from "@/services/news/discovery-results.service";

export function StoryDetailView({
  discoveryRunId,
  eventId,
}: {
  discoveryRunId: string;
  eventId: string;
}) {
  const [story, setStory] = useState<DiscoveryStoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/discovery/${discoveryRunId}/results/${eventId}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      setError("Could not load story.");
      return;
    }
    setStory((await response.json()) as DiscoveryStoryDetail);
    setError(null);
  }, [discoveryRunId, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!story) {
    return <p className="text-sm text-muted-foreground">Loading story…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button
        render={
          <Link href={`/dashboard/discovery/${discoveryRunId}`} />
        }
        variant="outline"
        size="sm"
      >
        ← Back to results
      </Button>

      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">Rank {story.rank}</p>
        <h1 className="text-2xl font-semibold leading-snug">{story.title}</h1>
        <p className="text-sm text-muted-foreground">
          {story.eventDate
            ? new Date(story.eventDate).toLocaleDateString(undefined, {
                dateStyle: "long",
              })
            : "—"}{" "}
          · {story.eventType.replaceAll("_", " ")} · {story.region}
        </p>
      </header>

      {story.description ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {story.description}
          </CardContent>
        </Card>
      ) : null}

      {story.narratives.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Narrative</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="list-disc space-y-1 pl-5">
              {story.narratives.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Confidence:{" "}
            <span className="font-medium">
              {story.evidenceConfidence != null
                ? `${Math.round(story.evidenceConfidence * 100)}%`
                : "—"}
            </span>
          </p>
          <p>
            Independent sources:{" "}
            <span className="font-medium">{story.independentSourceCount}</span>
          </p>
          {story.verificationReasoning ? (
            <p className="text-muted-foreground">{story.verificationReasoning}</p>
          ) : null}
        </CardContent>
      </Card>

      {story.primarySources.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Primary sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {story.primarySources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                className="block text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {source.name} ({source.domain})
              </a>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {story.supportingSources.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supporting sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {story.supportingSources.slice(0, 8).map((source) => (
              <a
                key={source.url}
                href={source.url}
                className="block text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {source.domain} — {source.relationship}
              </a>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {story.contradictoryEvidence.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contradictory evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {story.contradictoryEvidence.map((row, index) => (
              <p key={`${row.severity}-${index}`} className="text-muted-foreground">
                <span className="font-medium text-foreground">{row.severity}:</span>{" "}
                {row.explanation ?? "Unresolved contradiction."}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {story.keyClaims.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Key claims</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {story.keyClaims.map((claim, index) => (
              <p key={index} className="text-muted-foreground">
                <span className="font-medium text-foreground">
                  {claim.relationship}:
                </span>{" "}
                {claim.text}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evaluation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(story.evaluation).map(([key, value]) => (
            <div key={key}>
              <span className="text-muted-foreground">
                {key.replace(/([A-Z])/g, " $1").trim()}:
              </span>{" "}
              <span className="font-medium">
                {value != null ? `${Math.round(value * 100)}%` : "—"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {story.rankingReasoning ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking reasoning</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {story.rankingReasoning}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
