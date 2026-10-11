"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useEffect, useState } from "react";

type NewsletterRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  scope: string;
  storyCount: number;
  location: string | null;
  frequency: string;
  sendTimeLocal: string;
  timezone: string;
  nextRunAt: string | null;
  deliveries: Array<{
    id: string;
    status: string;
    scheduledFor: string;
    sentAt: string | null;
    storyCount: number | null;
  }>;
};

export default function NewslettersPage() {
  const [rows, setRows] = useState<NewsletterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/newsletters");
      const payload = (await response.json()) as {
        newsletters?: NewsletterRow[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load newsletters");
      }
      setRows(payload.newsletters ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/newsletters/${id}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    void load();
  }

  async function sendTest(id: string) {
    await fetch(`/api/newsletters/${id}/test`, { method: "POST" });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Newsletters</h1>
          <p className="text-sm text-muted-foreground">
            Scheduled email digests using the same news pipeline as on-demand
            briefings.
          </p>
        </div>
        <Link
          href="/newsletters/new"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm text-primary-foreground"
        >
          Create newsletter
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No newsletters yet.{" "}
            <Link href="/newsletters/new" className="underline">
              Create your first one
            </Link>
            .
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{row.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {row.email} · {row.storyCount} stories · {row.scope}
                  {row.location ? ` · ${row.location}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.frequency} at {row.sendTimeLocal} ({row.timezone})
                  {row.nextRunAt
                    ? ` · Next: ${new Date(row.nextRunAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void toggleActive(row.id, row.isActive)}
                >
                  {row.isActive ? "Pause" : "Resume"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void sendTest(row.id)}
                >
                  Send test
                </Button>
                <Link
                  href={`/newsletters/${row.id}`}
                  className="inline-flex h-8 items-center rounded-md bg-secondary px-3 text-xs"
                >
                  Edit
                </Link>
              </div>
            </CardHeader>
            {row.deliveries.length > 0 ? (
              <CardContent className="border-t pt-4 text-xs text-muted-foreground">
                Recent deliveries:{" "}
                {row.deliveries
                  .slice(0, 5)
                  .map((d) => `${d.status} (${d.storyCount ?? 0})`)
                  .join(" · ")}
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
