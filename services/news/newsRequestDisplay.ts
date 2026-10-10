import {
  formatDisplayDate,
  formatNewsScopeLabel,
} from "@/services/news/newsRequestProgress";
import type { SerializedNewsStory } from "@/services/news/newsRequestTypes";

export function formatNewsRequestTitle(request: {
  location: string | null;
  scope: string;
  categories: string[];
  customQuery?: string | null;
}): string {
  const custom = request.customQuery?.trim();
  if (custom) {
    return custom.length > 72 ? `${custom.slice(0, 69)}…` : custom;
  }

  const place =
    request.location?.trim() ||
    (request.scope === "world" ? "World" : formatNewsScopeLabel(request.scope));

  if (request.categories.length === 0) {
    return `${place} News Briefing`;
  }

  const topics = request.categories.slice(0, 4).join(" & ");
  return `${place} ${topics} News`;
}

export function formatRequestTimestamp(iso: string | null | undefined): string | null {
  if (!iso?.trim()) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatStoryPublishedMeta(
  publishedAt: string | null,
  primaryDomain: string | null,
): string | null {
  const relative = formatRelativeTime(publishedAt);
  if (relative && primaryDomain) {
    return `${relative} · ${primaryDomain}`;
  }
  if (relative) {
    return relative;
  }
  if (primaryDomain) {
    return primaryDomain;
  }
  return null;
}

export function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso?.trim()) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) {
    return rtf.format(minutes, "minute");
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) {
    return rtf.format(hours, "hour");
  }
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 14) {
    return rtf.format(days, "day");
  }
  return formatDisplayDate(iso.slice(0, 10));
}

export function countStoriesByCategory(
  stories: Pick<SerializedNewsStory, "category">[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const story of stories) {
    const category = story.category?.trim();
    if (!category) {
      continue;
    }
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return new Map(
    [...counts.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
    ),
  );
}

export function primaryStoryDomain(
  sourceUrls: { domain: string }[] | undefined,
): string | null {
  const domain = sourceUrls?.[0]?.domain?.trim();
  return domain || null;
}

export function displayOrDash(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "—";
  }
  return value.trim();
}

export function formatTopicsLabel(categories: string[]): string {
  if (categories.length === 0) {
    return "All topics";
  }
  return categories.join(", ");
}

export function formatSourcesFilterLabel(sources: string[] | undefined): string {
  if (!sources || sources.length === 0) {
    return "—";
  }
  return sources.join(", ");
}
