"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const SEND_TEST_COOLDOWN_MS = 10_000;

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

async function fetchNewsletters(): Promise<NewsletterRow[]> {
  const response = await fetch("/api/newsletters");
  const payload = (await response.json()) as {
    newsletters?: NewsletterRow[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load newsletters");
  }
  return payload.newsletters ?? [];
}

export default function NewslettersPage() {
  const [rows, setRows] = useState<NewsletterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testSendingId, setTestSendingId] = useState<string | null>(null);
  const [testCooldownUntil, setTestCooldownUntil] = useState<
    Record<string, number>
  >({});
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    void fetchNewsletters()
      .then((newsletters) => {
        if (!cancelled) {
          setRows(newsletters);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const hasActiveCooldown = Object.values(testCooldownUntil).some(
      (until) => until > Date.now(),
    );
    if (!hasActiveCooldown) {
      return;
    }
    const timer = setInterval(() => {
      setCooldownNow(Date.now());
    }, 500);
    return () => clearInterval(timer);
  }, [testCooldownUntil]);

  function testCooldownSeconds(newsletterId: string): number {
    const until = testCooldownUntil[newsletterId] ?? 0;
    return Math.max(0, Math.ceil((until - cooldownNow) / 1000));
  }

  async function reload() {
    try {
      const newsletters = await fetchNewsletters();
      setRows(newsletters);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/newsletters/${id}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    void reload();
  }

  async function sendTest(row: NewsletterRow) {
    const cooldownLeft = testCooldownSeconds(row.id);
    if (cooldownLeft > 0) {
      toast.message("Please wait before sending another test", {
        description: `You can send another test for “${row.name}” in ${cooldownLeft}s.`,
      });
      return;
    }
    if (testSendingId === row.id) {
      return;
    }

    setTestSendingId(row.id);
    try {
      const response = await fetch(`/api/newsletters/${row.id}/test`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not queue test email");
      }

      setTestCooldownUntil((previous) => ({
        ...previous,
        [row.id]: Date.now() + SEND_TEST_COOLDOWN_MS,
      }));

      toast.success("Test digest queued", {
        description: `We’re building “${row.name}” and will email ${row.email} when it’s ready—usually within a few minutes. Check spam if you don’t see it.`,
        duration: 10_000,
      });
    } catch (err) {
      toast.error("Test send failed", {
        description:
          err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setTestSendingId(null);
    }
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
                {(() => {
                  const cooldownLeft = testCooldownSeconds(row.id);
                  const isSending = testSendingId === row.id;
                  const disabled = isSending || cooldownLeft > 0;
                  let label = "Send test";
                  if (isSending) {
                    label = "Queuing…";
                  } else if (cooldownLeft > 0) {
                    label = `Send test (${cooldownLeft}s)`;
                  }
                  return (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => void sendTest(row)}
                    >
                      {isSending ? (
                        <Spinner data-icon="inline-start" />
                      ) : null}
                      {label}
                    </Button>
                  );
                })()}
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
