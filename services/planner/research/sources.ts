import { z } from "zod";
import {
  createSource,
  findByRunIdAndContentHash,
  findByRunIdAndUrl,
  updateSource,
  type ResearchSourceCreateInput,
} from "@/repositories/researchSource";
import { contentHash } from "@/services/planner/normalize/contentHash";
import { compactOrganicResults } from "@/services/planner/research/serp";

export const researchSourceTypeSchema = z.enum([
  "google_search",
  "google_maps",
  "official",
  "news",
  "website",
  "blog",
  "other",
]);

export type ResearchSourceType = z.output<typeof researchSourceTypeSchema>;

export type CompactOrganicHit = {
  title: string | null;
  snippet: string | null;
  link: string | null;
};

const NEWS_HOSTS =
  /timesofindia|ndtv|indianexpress|hindustantimes|thehindu|news18|zeenews|anandabazar|telegraphindia|bbc\.|reuters|cnn/;
const BLOG_HOSTS = /medium\.com|blogspot|wordpress|substack/;
const SKIP_HOSTS =
  /facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|pinterest\.com/;

export function classifySourceType(url: string): ResearchSourceType {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (SKIP_HOSTS.test(host)) {
      return "other";
    }

    if (
      host.includes("google.") &&
      (host.includes("maps") || parsed.pathname.includes("/maps"))
    ) {
      return "google_maps";
    }

    if (host === "google.com" || host.endsWith(".google.com")) {
      return "google_search";
    }

    if (
      host.endsWith(".gov") ||
      host.endsWith(".gov.in") ||
      host.endsWith(".nic.in") ||
      host.includes(".nic.in")
    ) {
      return "official";
    }

    if (NEWS_HOSTS.test(host)) {
      return "news";
    }

    if (BLOG_HOSTS.test(host)) {
      return "blog";
    }

    return "website";
  } catch {
    return "other";
  }
}

export function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sourceScore(url: string) {
  const type = classifySourceType(url);
  if (type === "official") {
    return 4;
  }
  if (type === "news") {
    return 3;
  }
  if (type === "website" || type === "blog") {
    return 2;
  }
  if (type === "google_maps") {
    return 0;
  }
  return 1;
}

export function organicHitsFromSearch(searchResult: unknown): CompactOrganicHit[] {
  return compactOrganicResults(searchResult).organicResults;
}

export function selectScrapeUrls(
  hits: CompactOrganicHit[],
  limit = 6,
): Array<{ url: string; title: string | null; snippet: string | null }> {
  const unique = new Map<
    string,
    { url: string; title: string | null; snippet: string | null; score: number }
  >();

  for (const hit of hits) {
    if (!hit.link || !isHttpUrl(hit.link)) {
      continue;
    }

    const type = classifySourceType(hit.link);
    if (type === "other" && SKIP_HOSTS.test(hit.link)) {
      continue;
    }

    const url = hit.link;
    const score = sourceScore(url);
    const existing = unique.get(url);
    if (!existing || score > existing.score) {
      unique.set(url, {
        url,
        title: hit.title,
        snippet: hit.snippet,
        score,
      });
    }
  }

  return [...unique.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ url, title, snippet }) => ({ url, title, snippet }));
}

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function persistResearchSource(input: ResearchSourceCreateInput) {
  const normalized: ResearchSourceCreateInput = {
    ...input,
    title: emptyToNull(input.title),
    searchQuery: emptyToNull(input.searchQuery),
    snippet: emptyToNull(input.snippet),
    content: emptyToNull(input.content),
    contentHash: emptyToNull(input.contentHash) ?? hashContent(input.content),
  };

  const existingUrl = await findByRunIdAndUrl(
    normalized.researchRunId,
    normalized.url,
  );
  if (existingUrl) {
    if (normalized.content && !existingUrl.content) {
      return updateSource(existingUrl.id, {
        title: normalized.title ?? existingUrl.title,
        snippet: normalized.snippet ?? existingUrl.snippet,
        content: normalized.content,
        contentHash: normalized.contentHash,
        retrievedAt: normalized.retrievedAt,
        sourceType: normalized.sourceType,
        metadata: normalized.metadata,
      });
    }

    return existingUrl;
  }

  if (normalized.contentHash) {
    const existingHash = await findByRunIdAndContentHash(
      normalized.researchRunId,
      normalized.contentHash,
    );
    if (existingHash) {
      return existingHash;
    }
  }

  return createSource(normalized);
}

export function hashContent(content: string | null | undefined) {
  if (!content?.trim()) {
    return null;
  }

  return contentHash(content);
}
