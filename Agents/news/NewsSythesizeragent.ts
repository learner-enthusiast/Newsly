/**
 * News synthesizer agent
 *
 * What it does: Takes many scraped articles from a daily news request, clusters
 * them into distinct market/economy stories, and writes story-level copy (title,
 * slug, summary, description, content, category, scores) with linked source URLs.
 *
 * Input: newsRequestId; articles array (url, title, scraped content, sourceType,
 * etc.); optional location, userPrompt, model, system, abortSignal.
 *
 * Output: Array of SynthesizedNewsStory objects — each story plus its sources
 * shaped for persisting NewsStory and NewsSource rows.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { synthesizedTranscriptFactSchema } from "@/Agents/news/YoutubeTranscriptSyntesizeAgent";
import { isTradingRecommendationArticle } from "@/services/news/normalizeArticles";
import { z } from "zod";

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid"]);
const SCRAPE_EXCERPT_CHARS = 4000;

/** Scraped article. Matches NewsSource fields that exist before a story id is assigned. */
export const researchedArticleSchema = z.object({
  url: z.url(),
  domain: z.string().min(1).optional(),
  title: z.string().min(1),
  scrapedContent: z.string().nullable().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  sourceType: z.string().min(1),
  reason: z.string().min(1).optional(),
  /** Original position in the merged Serp result list (pipeline). */
  index: z.number().int().min(0).optional(),
  transcript: z.string().nullable().optional(),
  selectionWeight: z.number().positive().optional(),
  /** Scraped web/news articles are primary; YouTube inputs are supporting only. */
  isPrimaryStorySource: z.boolean().optional(),
});

export const newsSynthesizerParamsSchema = z.object({
  newsRequestId: z.uuid(),
  articles: z.array(researchedArticleSchema).min(1),
  youtubeTranscriptSynthesis: z
    .object({
      facts: z.array(synthesizedTranscriptFactSchema),
      overview: z.string().min(1),
    })
    .optional(),
  /** Used to rank relevance to location. */
  location: z.string().min(1).nullable().optional(),
  userPrompt: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type NewsSynthesizerParams = z.input<typeof newsSynthesizerParamsSchema> & {
  abortSignal?: AbortSignal;
};

export const synthesizedNewsSourceSchema = z.object({
  id: z.uuid(),
  newsStoryId: z.uuid(),
  url: z.url(),
  domain: z.string().min(1),
  title: z.string().min(1),
  scrapedContent: z.string().nullable(),
  publishedAt: z.date().nullable(),
  sourceType: z.string().min(1),
  transcript: z.string().nullable(),
});

/** Story fields from NewsStory, plus the sources that belong to that event. */
export const synthesizedNewsStorySchema = z.object({
  id: z.uuid(),
  newsRequestId: z.uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  slug: z.string().min(1),
  summary: z.string().min(1),
  content: z.string().min(1),
  category: z.string().min(1),
  location: z.string().nullable(),
  publishedAt: z.date().nullable(),
  importanceScore: z.number().min(0).max(100),
  sources: z.array(synthesizedNewsSourceSchema).min(1),
});

export type ResearchedArticle = z.infer<typeof researchedArticleSchema>;
export type SynthesizedNewsSource = z.infer<typeof synthesizedNewsSourceSchema>;
export type SynthesizedNewsStory = z.infer<typeof synthesizedNewsStorySchema>;

const synthesizerModelOutputSchema = z.object({
  stories: z.array(
    z.object({
      title: z.string().min(1).max(200),
      slug: z.string().min(1).max(120),
      summary: z.string().min(1).max(800),
      description: z.string().min(1).max(4000),
      content: z.string().min(1).max(6000),
      category: z.string().min(1).max(80),
      location: z.string().min(1).max(120).nullable(),
      publishedAt: z.string().nullable(),
      importanceScore: z.number().min(0).max(100),
      sourceUrls: z.array(z.string().min(1)).min(1),
    }),
  ),
});

type ModelStory = z.infer<typeof synthesizerModelOutputSchema>["stories"][number];

type IndexedArticle = ResearchedArticle & {
  key: string;
  domain: string;
};

function isPrimaryStorySource(article: IndexedArticle): boolean {
  return article.isPrimaryStorySource !== false;
}

/** At least one non-YouTube source (article-backed story). */
export function storyHasPrimaryArticleSource(story: {
  sources: Array<{ sourceType: string }>;
}): boolean {
  return story.sources.some((source) => source.sourceType !== "youtube");
}

function resolveSynthesizerModel(override?: string): string {
  return resolveOpenAiModelId(override, process.env.NEWS_SYNTHESIZER_MODEL);
}

function canonicalUrlKey(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    const queryKeys = Array.from(url.searchParams.keys());
    for (const key of queryKeys) {
      const normalized = key.toLowerCase();
      if (normalized.startsWith("utm_") || TRACKING_PARAMS.has(normalized)) {
        url.searchParams.delete(key);
      }
    }

    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 80);

  const trimmed = slug.replace(/^-/, "").replace(/-$/, "");

  return trimmed || "story";
}

function uniqueSlug(base: string, used: Set<string>): string {
  const root = slugify(base);
  if (!used.has(root)) {
    used.add(root);
    return root;
  }

  let suffix = 2;
  while (used.has(`${root}-${suffix}`)) {
    suffix += 1;
  }

  const slug = `${root}-${suffix}`;
  used.add(slug);
  return slug;
}

function roundScore(score: number): number {
  const clamped = Math.min(100, Math.max(0, score));
  return Math.round(clamped * 10000) / 10000;
}

function parseModelDate(value: string | null): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestPublishedAt(articles: IndexedArticle[]): Date | null {
  let latest: Date | null = null;

  for (const article of articles) {
    if (!article.publishedAt) {
      continue;
    }
    if (!latest || article.publishedAt > latest) {
      latest = article.publishedAt;
    }
  }

  return latest;
}

function excerpt(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= SCRAPE_EXCERPT_CHARS) {
    return value;
  }
  return `${value.slice(0, SCRAPE_EXCERPT_CHARS)}\n…[truncated]`;
}

function indexArticles(articles: ResearchedArticle[]): IndexedArticle[] {
  const byKey = new Map<string, IndexedArticle>();

  for (const article of articles) {
    const key = canonicalUrlKey(article.url);
    if (!key) {
      continue;
    }

    const domain = article.domain?.trim() || new URL(key).hostname;
    const next: IndexedArticle = { ...article, key, url: key, domain };
    const existing = byKey.get(key);
    const nextLength = next.scrapedContent?.length ?? 0;
    const existingLength = existing?.scrapedContent?.length ?? 0;
    if (!existing || nextLength > existingLength) {
      byKey.set(key, next);
    }
  }

  return [...byKey.values()];
}

function toSource(article: IndexedArticle, newsStoryId: string): SynthesizedNewsSource {
  return {
    id: crypto.randomUUID(),
    newsStoryId,
    url: article.url,
    domain: article.domain,
    title: article.title,
    scrapedContent: article.scrapedContent ?? null,
    publishedAt: article.publishedAt ?? null,
    sourceType: article.sourceType,
    transcript: article.transcript ?? null,
  };
}

function fallbackStoryMarkdownContent(article: IndexedArticle): string {
  const body = article.scrapedContent?.trim() || article.title;
  return `## What happened\n\n${body}`;
}

function fallbackStory(
  article: IndexedArticle,
  newsRequestId: string,
  location: string | null,
  usedSlugs: Set<string>,
): SynthesizedNewsStory {
  const id = crypto.randomUUID();
  const body = article.scrapedContent?.trim() || article.title;
  const markdownContent = fallbackStoryMarkdownContent(article);

  return {
    id,
    newsRequestId,
    title: article.title,
    slug: uniqueSlug(article.title, usedSlugs),
    summary: article.reason?.trim() || body.slice(0, 400),
    description: body.slice(0, 4000),
    content: markdownContent,
    category: "general",
    location,
    publishedAt: article.publishedAt ?? null,
    importanceScore: 0,
    sources: [toSource(article, id)],
  };
}

function claimStories(
  modelStories: ModelStory[],
  articles: IndexedArticle[],
  newsRequestId: string,
  location: string | null,
): SynthesizedNewsStory[] {
  const byKey = new Map(articles.map((article) => [article.key, article]));
  const claimed = new Set<string>();
  const usedSlugs = new Set<string>();
  const stories: SynthesizedNewsStory[] = [];

  const ranked = [...modelStories].sort(
    (left, right) => right.importanceScore - left.importanceScore,
  );

  for (const modelStory of ranked) {
    const id = crypto.randomUUID();
    const matchedArticles: IndexedArticle[] = [];
    const matchedKeys: string[] = [];

    for (const sourceUrl of modelStory.sourceUrls) {
      const key = canonicalUrlKey(sourceUrl);
      const article = key ? byKey.get(key) : undefined;
      if (!key || !article || claimed.has(key)) {
        continue;
      }

      matchedArticles.push(article);
      matchedKeys.push(key);
    }

    if (matchedArticles.length === 0) {
      continue;
    }

    if (!matchedArticles.some(isPrimaryStorySource)) {
      continue;
    }

    if (
      !matchedArticles.some(
        (article) =>
          isPrimaryStorySource(article) &&
          !isTradingRecommendationArticle({
            title: article.title,
            scrapedContent: article.scrapedContent,
          }),
      )
    ) {
      continue;
    }

    for (const key of matchedKeys) {
      claimed.add(key);
    }

    const sources = matchedArticles.map((article) => toSource(article, id));

    const grouped = matchedArticles;

    stories.push({
      id,
      newsRequestId,
      title: modelStory.title.trim(),
      slug: uniqueSlug(modelStory.slug || modelStory.title, usedSlugs),
      summary: modelStory.summary.trim(),
      description: modelStory.description.trim(),
      content: modelStory.content.trim(),
      category: modelStory.category.trim(),
      location: modelStory.location?.trim() || location,
      publishedAt: parseModelDate(modelStory.publishedAt) ?? latestPublishedAt(grouped),
      importanceScore: roundScore(modelStory.importanceScore),
      sources,
    });
  }

  for (const article of articles) {
    if (claimed.has(article.key) || !isPrimaryStorySource(article)) {
      continue;
    }
    if (
      isTradingRecommendationArticle({
        title: article.title,
        scrapedContent: article.scrapedContent,
      })
    ) {
      continue;
    }
    claimed.add(article.key);
    stories.push(fallbackStory(article, newsRequestId, location, usedSlugs));
  }

  return stories.sort((left, right) => right.importanceScore - left.importanceScore);
}

function buildSystemPrompt(hasYoutubeFacts: boolean): string {
  const youtubeSection = hasYoutubeFacts
    ? [
        "Primary vs supporting sources:",
        "- Inputs with isPrimaryStorySource true are scraped news/web articles. Stories are created only from these primary sources.",
        "- Inputs with isPrimaryStorySource false are YouTube watch URLs (transcript-derived). They are supporting evidence only.",
        "- YouTube transcript facts in extraContext.youtubeTranscriptSynthesis can corroborate or add context to an article-backed story (~30% weight boost when relevant). They must not override stronger article evidence.",
        "- Attach a YouTube watch URL to sourceUrls only when it supports an existing article-backed story.",
        "- Never create a story whose sourceUrls contain only YouTube URLs.",
        "- Never use a YouTube video ID, default YouTube title, or channel name as a story title.",
        "- Unused YouTube sources do not need to appear in any story.",
        "Coverage rules:",
        "- Every synthesized story must be backed by at least one primary scraped news/web source in sourceUrls.",
        "- Supporting YouTube sources may be attached to an article-backed story when relevant.",
        "- Do not force every input URL into a story.",
      ]
    : [
        "Scraped news/web articles (isPrimaryStorySource true) are the only sources from which stories are created.",
        "Every synthesized story must include at least one primary source URL in sourceUrls.",
      ];

  return [
    "You are the news synthesizer. Cluster scraped news/web articles into distinct market and economic events.",
    "Aim for at least four distinct stories when the source material supports that many separate developments.",
    "Do not invent extra stories; fewer than four is acceptable when sources only support fewer events.",
    ...youtubeSection,
    "Articles about the same event become one story. Do not merge different events. Do not split one event across stories.",
    "Copy source URLs exactly in sourceUrls. Do not invent URLs. sourceUrls is the canonical machine-readable source list.",
    "Write each story only from its assigned sources. If sources disagree, say so. Do not add facts from outside the supplied research.",
    "Do not build stories from stock recommendations, buy/sell calls, target/stop-loss trading guides, or similar tip content.",
    "Rank every story with importanceScore from 0 to 100 (100 is the most important). Use all of these criteria:",
    "- importance: how much the event matters to markets, policy, or the public",
    "- recency: newer reporting ranks higher",
    "- impact: breadth of economic or civic effect",
    "- relevance to location: prefer the requested location when one is provided",
    "- source quality: official announcements, primary reporting, and several independent sources beat thin rewrites",
    "- uniqueness: a distinct event should not be buried inside a larger story",
    "summary: plain-text teaser (2–3 sentences) for list views.",
    "description: plain-text detailed account (what happened, actors, numbers, dates, impact). Several paragraphs; factual and source-bound.",
    "content: the full story as valid, readable Markdown (not plain text). Structure naturally when the evidence supports it, for example:",
    "## What happened",
    "(Clear explanation of the event.)",
    "## Key details",
    "- **Label:** fact from sources",
    "## Why it matters",
    "(Significance and implications supported by sources.)",
    "## What to watch",
    "- development to monitor",
    "## Sources",
    "- [Publisher or article title](https://article-url)",
    "- [Watch the video](https://www.youtube.com/watch?v=...)",
    "Markdown rules for content:",
    "- Use headings, lists, and **bold** for key figures or entities where useful.",
    "- Use Markdown links with the actual supplied URLs when naming sources inside content; do not replace sourceUrls.",
    "- Do not repeat the story title as the first heading.",
    "- Do not use HTML or tables unless a table materially helps.",
    "- Skip sections that the sources cannot support; avoid rigid filler.",
    "category is a short label such as markets, economy, policy, companies, commodities, or geopolitics.",
    "publishedAt is the event time in ISO-8601, or null when the sources do not give one.",
    "location is the place the event concerns, or null.",
  ].join("\n");
}

function outputTokenBudget(articleCount: number): number {
  return Math.min(16000, Math.max(4096, articleCount * 800));
}

async function runSynthesizer(
  params: NewsSynthesizerParams,
  generate: typeof aiClient.generate,
): Promise<SynthesizedNewsStory[]> {
  const { abortSignal, ...rawParams } = params;
  const parsed = newsSynthesizerParamsSchema.parse(rawParams);
  const articles = indexArticles(parsed.articles);

  if (articles.length === 0) {
    throw new Error("No valid http(s) articles to synthesize");
  }

  const location = parsed.location ?? null;
  const model = resolveSynthesizerModel(parsed.model);
  const youtubeFacts = parsed.youtubeTranscriptSynthesis?.facts ?? [];
  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(youtubeFacts.length > 0),
    prompt:
      parsed.userPrompt ??
      "Cluster these researched articles into events and rank the stories.",
    extraContext: {
      newsRequestId: parsed.newsRequestId,
      location,
      youtubeTranscriptSynthesis: parsed.youtubeTranscriptSynthesis ?? null,
      articles: articles.map((article) => ({
        index: article.index ?? null,
        url: article.url,
        domain: article.domain,
        title: article.title,
        sourceType: article.sourceType,
        isPrimaryStorySource: isPrimaryStorySource(article),
        publishedAt: article.publishedAt?.toISOString() ?? null,
        reason: article.reason ?? null,
        selectionWeight: article.selectionWeight ?? null,
        hasTranscript: Boolean(article.transcript?.trim()),
        scrapedContent: excerpt(article.scrapedContent),
      })),
    },
    schemaName: "NewsSynthesizerOutput",
    schemaDescription:
      "Article-backed stories (each with at least one primary scraped source in sourceUrls), optional supporting YouTube URLs, ranked by importance; content is Markdown.",
    output: synthesizerModelOutputSchema,
    temperature: 0,
    maxOutputTokens: outputTokenBudget(articles.length),
    abortSignal,
  });

  const stories = claimStories(raw.stories, articles, parsed.newsRequestId, location);
  return synthesizedNewsStorySchema.array().parse(stories);
}

export function createNewsSynthesizerAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function newsSynthesizerAgent(
    params: NewsSynthesizerParams,
  ): Promise<SynthesizedNewsStory[]> {
    return runSynthesizer(params, client.generate.bind(client));
  };
}

/** Cluster researched articles into ranked NewsStory results for one news request. */
export async function runNewsSynthesizerAgent(
  params: NewsSynthesizerParams,
): Promise<SynthesizedNewsStory[]> {
  return runSynthesizer(params, aiClient.generate.bind(aiClient));
}
