import type { SelectedResearchArticle } from "@/Agents/news/ResearchArticleSelectorAgent";
import { z } from "zod";

const urlSchema = z.url();

export const MAX_DETERMINER_FIRECRAWL_URLS = 3;

export function canonicalResearchUrlKey(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

export function validateDeterminerFirecrawlUrls(
  raw: string[] | null | undefined,
): string[] {
  if (!raw?.length) {
    return [];
  }

  const seen = new Set<string>();
  const urls: string[] = [];

  for (const candidate of raw) {
    const parsed = urlSchema.safeParse(candidate.trim());
    if (!parsed.success) {
      continue;
    }
    const key = canonicalResearchUrlKey(parsed.data);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    urls.push(key);
    if (urls.length >= MAX_DETERMINER_FIRECRAWL_URLS) {
      break;
    }
  }

  return urls;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "unknown";
  }
}

function titleFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split("/").filter(Boolean).pop();
    if (segment) {
      return decodeURIComponent(segment).replace(/[-_]+/g, " ").slice(0, 200);
    }
  } catch {
    // fall through
  }
  return domainFromUrl(url);
}

/** Merge Serp-selected articles with user-provided URLs for Firecrawl (session dedupe). */
export function mergeDirectFirecrawlTargets(
  selected: SelectedResearchArticle[],
  directUrls: string[],
  existingSessionUrlKeys: Set<string>,
): SelectedResearchArticle[] {
  const seen = new Set(existingSessionUrlKeys);
  const merged: SelectedResearchArticle[] = [];

  for (const article of selected) {
    const key = canonicalResearchUrlKey(article.url);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({ ...article, url: key });
  }

  for (const url of directUrls) {
    const key = canonicalResearchUrlKey(url);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({
      url: key,
      domain: domainFromUrl(key),
      title: titleFromUrl(key),
      sourceType: "user_provided_url",
    });
  }

  return merged;
}
