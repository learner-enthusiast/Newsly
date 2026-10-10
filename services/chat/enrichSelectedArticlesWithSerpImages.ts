import type { SelectedResearchArticle } from "@/Agents/news/ResearchArticleSelectorAgent";
import { canonicalResearchUrlKey } from "@/services/chat/directUrlResearch";
import type { NormalizedSerpHit } from "@/services/chat/normalizeSerpResults";

/** Attach Serp thumbnail URLs to scrape targets (keyed by canonical URL). */
export function enrichSelectedArticlesWithSerpImages(
  articles: SelectedResearchArticle[],
  hits: NormalizedSerpHit[],
): SelectedResearchArticle[] {
  const imageByUrl = new Map<string, string | null>();
  for (const hit of hits) {
    const key = canonicalResearchUrlKey(hit.url);
    if (!key || !hit.imageUrl) {
      continue;
    }
    imageByUrl.set(key, hit.imageUrl);
  }

  return articles.map((article) => {
    const key = canonicalResearchUrlKey(article.url);
    const imageUrl = key ? (imageByUrl.get(key) ?? null) : null;
    if (!imageUrl) {
      return article;
    }
    return { ...article, imageUrl };
  });
}
