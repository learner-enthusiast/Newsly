"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewsRequestPage() {
  const router = useRouter();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scope, setScope] = useState<"local" | "world">("local");
  const [location, setLocation] = useState("India");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body =
        scope === "local"
          ? { date, scope, location: location.trim() }
          : { date, scope };

      const response = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as {
        error?: string;
        newsRequest?: { id: string };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to start news request");
      }

      if (!payload.newsRequest?.id) {
        throw new Error("Missing news request id");
      }

      router.push(`/news/${payload.newsRequest.id}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Request failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-12">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="font-display mt-2 text-2xl font-semibold">News research</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request market news for a date and region. Results load on the next page.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border p-4">
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Scope
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "local" | "world")}
            className="rounded-md border px-3 py-2"
          >
            <option value="local">Local</option>
            <option value="world">World</option>
          </select>
        </label>

        {scope === "local" ? (
          <label className="flex flex-col gap-1 text-sm">
            Location
            <input
              type="text"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded-md border px-3 py-2"
              placeholder="India"
            />
          </label>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Starting…" : "Run news pipeline"}
        </button>
      </form>
    </main>
  );
}
