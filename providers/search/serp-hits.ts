import type { SearchHit } from "@/providers/search-provider";

function parseLooseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function pushHits(
  hits: SearchHit[],
  items: unknown,
  source: string,
  startIndex: number,
) {
  if (!Array.isArray(items)) {
    return startIndex;
  }

  let index = startIndex;
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const url =
      (typeof row.link === "string" && row.link) ||
      (typeof row.url === "string" && row.url) ||
      (typeof row.redirect_link === "string" && row.redirect_link);

    if (!url) {
      continue;
    }

    hits.push({
      url,
      title: typeof row.title === "string" ? row.title : undefined,
      snippet:
        typeof row.snippet === "string"
          ? row.snippet
          : typeof row.summary === "string"
            ? row.summary
            : undefined,
      position: index,
      publishedAt: parseLooseDate(
        row.iso_date ?? row.date ?? row.published_at,
      ),
      raw: { source, ...row },
    });
    index += 1;
  }
  return index;
}

export function serpJsonToSearchHits(json: Record<string, unknown>): SearchHit[] {
  const hits: SearchHit[] = [];
  let index = 0;
  index = pushHits(hits, json.news_results, "news_results", index);
  index = pushHits(hits, json.organic_results, "organic_results", index);
  index = pushHits(hits, json.top_stories, "top_stories", index);
  index = pushHits(hits, json.market_news, "market_news", index);
  pushHits(hits, json.discussion_and_forums, "discussion_and_forums", index);
  return hits;
}
