import type { ResearchedArticle } from "@/Agents/news/NewsSythesizeragent";
import type { ChatModelResearchSourceRow } from "@/services/chat/researchContextForChatModel";
import type { ChatYoutubeEvidenceRow } from "@/services/chat/chatYoutubeEvidence";
import type { NormalizedSerpHit } from "@/services/chat/normalizeSerpResults";
import { canonicalResearchUrl } from "@/services/chat/normalizeSerpResults";

const RESEARCH_CONTENT_MAX = 12_000;

export function chatResearchRowsToSynthesizerArticles(
  rows: ChatModelResearchSourceRow[],
): ResearchedArticle[] {
  return rows.flatMap((row) => {
    const url = row.url?.trim();
    if (!url) {
      return [];
    }
    const content = row.contentExcerpt?.trim() ?? "";
    return [
      {
        url,
        domain: row.domain,
        title: row.title,
        scrapedContent: content.slice(0, RESEARCH_CONTENT_MAX),
        sourceType: row.sourceType,
        isPrimaryStorySource: true,
      },
    ];
  });
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function mergePreparedResearchArticles(input: {
  existingResearch: ChatModelResearchSourceRow[];
  serpHits: NormalizedSerpHit[];
  youtubeEvidence: ChatYoutubeEvidenceRow[];
}): ResearchedArticle[] {
  const byUrl = new Map<string, ResearchedArticle>();

  for (const row of chatResearchRowsToSynthesizerArticles(input.existingResearch)) {
    const key = canonicalResearchUrl(row.url);
    if (key) {
      byUrl.set(key, row);
    }
  }

  for (const hit of input.serpHits) {
    const key = canonicalResearchUrl(hit.url);
    if (!key || byUrl.has(key)) {
      continue;
    }
    byUrl.set(key, {
      url: hit.url,
      domain: domainFromUrl(hit.url),
      title: hit.title?.trim() || hit.url,
      scrapedContent: (
        hit.snippet?.trim() ||
        hit.title?.trim() ||
        hit.url
      ).slice(0, RESEARCH_CONTENT_MAX),
      sourceType: "web",
      isPrimaryStorySource: true,
    });
  }

  for (const video of input.youtubeEvidence) {
    const key = canonicalResearchUrl(video.url);
    if (!key || byUrl.has(key)) {
      continue;
    }
    byUrl.set(key, {
      url: video.url,
      domain: video.domain,
      title: video.title,
      scrapedContent: video.content.slice(0, RESEARCH_CONTENT_MAX),
      sourceType: video.sourceType,
      isPrimaryStorySource: false,
    });
  }

  return [...byUrl.values()];
}
