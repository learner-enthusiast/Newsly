"use client";

import { CountryAutocomplete } from "@/components/news/CountryAutocomplete";
import { NewsAdvancedOptionsCollapsible } from "@/components/news/NewsAdvancedOptionsCollapsible";
import { NewsGenerateSidebar } from "@/components/news/NewsGenerateSidebar";
import {
  QUICK_LOCATIONS,
  STORY_COUNT_OPTIONS,
  TOPIC_OPTIONS,
  type NewsPreset,
  type NewsScopeValue,
} from "@/components/news/newsPageConstants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_STORY_COUNT } from "@/services/news/newsGenerationRequest";
import type { SerializedNewsRequest } from "@/services/news/newsRequestTypes";
import {
  ArrowRight,
  Calendar,
  MapPin,
  RefreshCw,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(iso: string): string {
  const parsed = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SCOPE_OPTIONS: Array<{ value: NewsScopeValue; label: string }> = [
  { value: "local", label: "Local" },
  { value: "world", label: "World" },
  { value: "both", label: "Both" },
];

export default function NewsRequestPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayIsoDate);
  const [scope, setScope] = useState<NewsScopeValue>("local");
  const [location, setLocation] = useState("Hyderabad, Telangana, India");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [allTopics, setAllTopics] = useState(true);
  const [customQuery, setCustomQuery] = useState("");
  const [storyCount, setStoryCount] = useState(DEFAULT_STORY_COUNT);
  const [language, setLanguage] = useState("English");
  const [sourcesText, setSourcesText] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(true);
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
        const response = await fetch("/api/news", { cache: "no-store" });
        const payload = (await response.json()) as {
          newsRequests?: SerializedNewsRequest[];
        };
        if (!cancelled && response.ok) {
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

  function applyPreset(preset: NewsPreset) {
    setScope(preset.scope);
    setLocation(preset.location ?? "India");
    setSelectedTopics(preset.categories);
    setAllTopics(preset.categories.length === 0);
    if (preset.storyCount) {
      setStoryCount(preset.storyCount);
    }
    setCustomQuery("");
    setError(null);
  }

  function toggleTopic(topicId: string) {
    setAllTopics(false);
    setSelectedTopics((current) => {
      if (current.includes(topicId)) {
        return current.filter((value) => value !== topicId);
      }
      return [...current, topicId];
    });
  }

  function selectAllTopics() {
    setAllTopics(true);
    setSelectedTopics([]);
  }

  function resetForm() {
    setDate(todayIsoDate());
    setScope("local");
    setLocation("Hyderabad, Telangana, India");
    setSelectedTopics([]);
    setAllTopics(true);
    setCustomQuery("");
    setStoryCount(DEFAULT_STORY_COUNT);
    setLanguage("English");
    setSourcesText("");
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current || loading) {
      return;
    }
    setError(null);
    submitLockRef.current = true;
    setLoading(true);

    try {
      const categories = allTopics ? [] : selectedTopics;
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
    <div className="mx-auto grid w-full min-w-0 max-w-[1600px] grid-cols-1 gap-6 px-4 py-4 md:px-6 md:py-6 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
      <div className="min-w-0 max-w-full">
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>/</span>
            <span>News</span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                Generate News
              </h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Configure a daily news briefing. Pick date, scope, location, and
                topics — then we search, verify sources, and synthesize stories.
              </p>
            </div>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Newsly
            </Badge>
          </div>
        </div>

        <Card className="min-w-0 max-w-full overflow-hidden">
          <form onSubmit={onSubmit} className="min-w-0">
            <CardHeader className="border-b">
              <CardTitle className="text-base">Request settings</CardTitle>
              <CardDescription>
                Required fields are marked with an asterisk. *
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-6 pt-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="news-date">
                  Date <span className="text-destructive">*</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  News published on this calendar day
                </p>
                <div className="flex min-w-0 flex-wrap gap-2 items-center">
                  <div className="relative min-w-0 flex-1 basis-[12rem]">
                    <Calendar className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="news-date"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDate(todayIsoDate())}
                  >
                    Today
                  </Button>
                  <Badge variant="secondary" className="self-center">
                    {formatDateLabel(date)}
                  </Badge>
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">
                      Scope <span className="text-destructive">*</span>
                    </span>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      {SCOPE_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant={
                            scope === option.value
                              ? "sketch-chip-active"
                              : "sketch-chip"
                          }
                          onClick={() => setScope(option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {needsLocation ? (
                <div className="flex flex-row gap-2 items-center">
                  <label
                    className="text-sm font-medium"
                    htmlFor="news-location"
                  >
                    Location <span className="text-destructive">*</span>
                  </label>
                  <div className="relative min-w-0 max-w-full">
                    <MapPin className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-muted-foreground" />
                    <CountryAutocomplete
                      required
                      value={location}
                      onChange={setLocation}
                      placeholder="City, state, country"
                      inputClassName="flex h-10 w-full rounded-md border border-input bg-background py-2 pr-3 pl-10 text-sm"
                    />
                  </div>
                  <div className="flex min-w-0 max-w-full flex-col items-center gap-2">
                    <span className="w-full text-xs text-muted-foreground sm:w-auto">
                      Quick select
                    </span>
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                      {QUICK_LOCATIONS.map((place) => (
                        <Button
                          key={place}
                          type="button"
                          size="xs"
                          variant={location === place ? "secondary" : "outline"}
                          onClick={() => setLocation(place)}
                        >
                          <MapPin data-icon="inline-start" />
                          {place.split(",")[0]}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Topics / categories</span>
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  <Button
                    type="button"
                    variant={allTopics ? "sketch-chip-active" : "sketch-chip"}
                    className="w-full justify-center"
                    onClick={selectAllTopics}
                  >
                    All
                  </Button>
                  {TOPIC_OPTIONS.map((topic) => {
                    const Icon = topic.icon;
                    const active =
                      !allTopics && selectedTopics.includes(topic.id);
                    return (
                      <Button
                        key={topic.id}
                        type="button"
                        variant={active ? "sketch-chip-active" : "sketch-chip"}
                        className="w-full justify-center"
                        onClick={() => toggleTopic(topic.id)}
                      >
                        <Icon data-icon="inline-start" />
                        {topic.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <NewsAdvancedOptionsCollapsible
                open={advancedOpen}
                onOpenChange={setAdvancedOpen}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Number of stories</span>
                    <Select
                      value={String(storyCount)}
                      onValueChange={(value) => {
                        if (value) {
                          setStoryCount(Number.parseInt(value, 10));
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Stories" />
                      </SelectTrigger>
                      <SelectContent>
                        {STORY_COUNT_OPTIONS.map((count) => (
                          <SelectItem key={count} value={String(count)}>
                            {count} stories
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium" htmlFor="language">
                      Language
                    </label>
                    <Input
                      id="language"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="sources">
                    Sources{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional domains)
                    </span>
                  </label>
                  <Textarea
                    id="sources"
                    value={sourcesText}
                    onChange={(e) => setSourcesText(e.target.value)}
                    placeholder="reuters.com, bloomberg.com"
                    rows={2}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="custom-query">
                    Custom search query{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="custom-query"
                      value={customQuery}
                      onChange={(e) => setCustomQuery(e.target.value)}
                      placeholder="e.g. RBI policy, EV subsidies…"
                      className="pl-10"
                    />
                  </div>
                </div>
              </NewsAdvancedOptionsCollapsible>

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-wrap gap-3 border-t">
              <Button type="button" variant="outline" onClick={resetForm}>
                <RefreshCw data-icon="inline-start" />
                Reset
              </Button>
              <Button
                type="submit"
                variant="brand"
                className="min-w-[180px] flex-1 sm:flex-none"
                disabled={loading}
              >
                {loading ? "Starting…" : "Generate News"}
                {!loading ? <ArrowRight data-icon="inline-end" /> : null}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <p className="mt-4 text-xs text-muted-foreground lg:hidden">
          Tip: try a quick preset from the list below on smaller screens.
        </p>
        <div className="mt-4 flex flex-col gap-4 lg:hidden">
          <NewsGenerateSidebar
            recentRequests={recentRequests}
            recentLoading={recentLoading}
            onApplyPreset={applyPreset}
          />
        </div>
      </div>

      <aside className="hidden min-w-0 lg:block">
        <NewsGenerateSidebar
          recentRequests={recentRequests}
          recentLoading={recentLoading}
          onApplyPreset={applyPreset}
        />
      </aside>
    </div>
  );
}
