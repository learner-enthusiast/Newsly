import type { ResearchedArticle } from "@/Agents/news/NewsSythesizeragent";
import type { NormalizedArticleLink } from "@/services/news/normalizeArticles";

export type NewsRerunStorySummary = {
  id: string;
  title: string;
  summary: string;
  category: string;
  slug: string;
};

export type NewsRerunEvidenceArticle = {
  resourceId: string;
  url: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  researched?: ResearchedArticle;
  normalized?: NormalizedArticleLink;
};

export type NewsRerunYoutubeEvidence = {
  resourceId: string;
  videoId: string;
  title: string;
  excerpt: string;
};

export type NewsRerunPipelineResult = {
  skipped?: boolean;
  skipReason?: string;
  updatedStories: Array<{ storyId: string; reason: string }>;
  unchangedStories: Array<{ storyId: string; reason: string }>;
  newStories: Array<{ storyId: string }>;
  newSources: number;
  skippedSources: number;
};
