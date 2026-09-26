"use client";

import { CountryAutocomplete } from "@/components/news/CountryAutocomplete";
import { DEFAULT_STORY_COUNT, MAX_STORY_COUNT } from "@/services/news/newsGenerationRequest";
import {
  formatDisplayDate,
  formatNewsRequestStatusLabel,
  formatNewsScopeLabel,
} from "@/services/news/newsRequestProgress";
import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

const SUGGESTED_CATEGORIES = [
  "Markets",
  "Economy",
  "Policy",
  "Companies",
  "Commodities",
  "Geopolitics",
];

export default function NewsRequestPage() {
  const router = useRouter();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scope, setScope] = useState<"local" | "world" | "both">("local");
  const [location, setLocation] = useState("India");
  const [categoriesText, setCategoriesText] = useState("");
  const [customQuery, setCustomQuery] = useState("");
  const [storyCount, setStoryCount] = useState(DEFAULT_STORY_COUNT);
  const [language, setLanguage] = useState("English");
  const [sourcesText, setSourcesText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentRequests, setRecentRequests] = useState<SerializedNewsRequest[]>(
    [],
  );
  const [recentLoading, setRecentLoading] = useState(true);
  const submitLockRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      try {
        const response = await fetch("/api/news");
        const payload = (await response.json()) as {
          newsRequests?: SerializedNewsRequest[];
          error?: string;
        };
        if (!response.ok) {
          return;
        }
        if (!cancelled) {
          setRecentRequests(payload.newsRequests ?? []);
        }
      } finally {
        if (!cancelled) {
          setRecentLoading(false);
        }
      }
    }
    void loadRecent();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current || loading) {
      return;
    }
    setError(null);
    submitLockRef.current = true;
    setLoading(true);

    try {
      const categories = categoriesText
        .split(/[,;\n]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const sources = sourcesText
        .split(/[,;\n]+/)
        .map((value) => value.trim())
        .filter(Boolean);

      const body: Record<string, unknown> = {
        date,
        scope,
        storyCount,
        language: language.trim() || "English",
        categories,
      };

      if (scope === "local" || scope === "both") {
        body.location = location.trim();
      }
      if (customQuery.trim()) {
        body.customQuery = customQuery.trim();
      }
      if (sources.length > 0) {
        body.sources = sources;
      }

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
      submitLockRef.current = false;
    }
  }

  const needsLocation = scope === "local" || scope === "both";

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-12">
      <div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Home
        </Link>
        <h1 className="font-display mt-2 text-2xl font-semibold">
          News research
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure a daily news run. Results load on the next page.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-lg border p-4"
      >
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
            onChange={(e) =>
              setScope(e.target.value as "local" | "world" | "both")
            }
            className="rounded-md border px-3 py-2"
          >
            <option value="local">Local</option>
            <option value="world">World</option>
            <option value="both">Both (local + world)</option>
          </select>
        </label>

        {needsLocation ? (
          <label className="flex flex-col gap-1 text-sm">
            Location
            <CountryAutocomplete
              required
              value={location}
              onChange={setLocation}
              placeholder="India"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          Topics / categories
          <input
            type="text"
            value={categoriesText}
            onChange={(e) => setCategoriesText(e.target.value)}
            placeholder={SUGGESTED_CATEGORIES.join(", ")}
            className="rounded-md border px-3 py-2"
          />
          <span className="text-xs text-muted-foreground">
            Comma-separated (optional)
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Custom search query
          <input
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="Optional extra keywords"
            className="rounded-md border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Number of stories
          <input
            type="number"
            min={1}
            max={MAX_STORY_COUNT}
            value={storyCount}
            onChange={(e) =>
              setStoryCount(Number.parseInt(e.target.value, 10) || DEFAULT_STORY_COUNT)
            }
            className="rounded-md border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Language
          <input
            type="text"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="English"
            className="rounded-md border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Sources / domains
          <textarea
            value={sourcesText}
            onChange={(e) => setSourcesText(e.target.value)}
            placeholder="reuters.com, bloomberg.com"
            rows={2}
            className="rounded-md border px-3 py-2"
          />
          <span className="text-xs text-muted-foreground">
            Optional preferred domains (comma or newline separated)
          </span>
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Starting…" : "Generate news"}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Recent requests</h2>
        {recentLoading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : recentRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your generated briefings will appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentRequests.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/news/${request.id}`}
                  className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <div className="font-medium">
                    {formatDisplayDate(request.date)}
                    {request.location ? ` · ${request.location}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatNewsScopeLabel(request.scope)}
                    {request.categories.length > 0
                      ? ` · ${request.categories.join(", ")}`
                      : ""}
                    {` · ${request.storyCount} stories · ${formatNewsRequestStatusLabel(request.status)}`}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
