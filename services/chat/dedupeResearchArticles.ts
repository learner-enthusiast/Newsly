import type { SelectedResearchArticle } from "@/Agents/news/ResearchArticleSelectorAgent";
import { canonicalResearchUrl } from "@/services/chat/normalizeSerpResults";

/**
 * Drop duplicate URLs within synthesizer output and URLs already stored on the session.
 */
export function dedupeSelectedArticlesForSession(
  articles: SelectedResearchArticle[],
  existingSessionUrlKeys: ReadonlySet<string>,
): SelectedResearchArticle[] {
  const seen = new Set<string>();
  const kept: SelectedResearchArticle[] = [];

  for (const article of articles) {
    const key = canonicalResearchUrl(article.url);
    if (!key || seen.has(key) || existingSessionUrlKeys.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(article);
  }

  return kept;
}

export function researchUrlKeysFromSources(
  sources: ReadonlyArray<{ url: string }>,
): Set<string> {
  const keys = new Set<string>();
  for (const source of sources) {
    const key = canonicalResearchUrl(source.url);
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}
