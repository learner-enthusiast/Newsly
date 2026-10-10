/**
 * News new-chat agent (story → research brief)
 *
 * Role:
 * Compose a long, self-contained research prompt when the user opens chat from a published
 * system briefing story (`isFromNewsStory`). Merges story metadata, summary/content excerpts,
 * and linked `NewsSource` scraped text into one determiner-ready brief.
 *
 * Called from:
 * - `inngest/newsNewchatPipeline.ts` — `build-research-prompt` when `newsStoryId` set
 *
 * Model: `NEWS_NEW_CHAT_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini`. Structured output is not
 * used — returns a plain research prompt string assembled with model assistance where needed.
 *
 * Input:
 * - `newsStoryId`, `newsStory` (Prisma-shaped context), `newsSources[]` for that story
 * - `researchRequest` — user intent (default `DEFAULT_NEWS_RESEARCH_REQUEST`)
 * - Optional `model`, `system`, `abortSignal`
 *
 * Output: `{ newsStoryId, researchPrompt }` fed to `runSmallDeterminerAgent` and Serp steps.
 *
 * Does not: search the web, mutate DB rows, or produce the final chat reply (`chatModel`).
 *
 * Entrypoint: `runNewsNewChatAgent` / `createNewsNewChatAgent` for injected clients.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

/** Default user-facing research intent when the client does not override it. */
export const DEFAULT_NEWS_RESEARCH_REQUEST =
  "I am interested in researching this story in depth. Help me understand the full picture, including the key claims, background, causes, context, and evidence.";

/** Fields aligned with `NewsStory` (Prisma) used as model context. */
export const newsStoryContextSchema = z.object({
  id: z.uuid(),
  newsRequestId: z.uuid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  slug: z.string().min(1),
  summary: z.string().min(1),
  content: z.string().min(1),
  category: z.string().min(1),
  location: z.string().nullable().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  importanceScore: z.coerce.number().nullable().optional(),
});

/** Fields aligned with `NewsSource` (Prisma) used as model context. */
export const newsSourceContextSchema = z.object({
  id: z.uuid(),
  newsStoryId: z.uuid(),
  url: z.string().min(1),
  domain: z.string().min(1),
  title: z.string().min(1),
  scrapedContent: z.string().nullable().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  sourceType: z.string().min(1),
});

export const newsNewChatParamsSchema = z
  .object({
    newsStoryId: z.uuid(),
    newsStory: newsStoryContextSchema,
    newsSources: z.array(newsSourceContextSchema).min(1),
    researchRequest: z.string().min(1),
    model: z.string().min(1).optional(),
    system: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.newsStory.id !== data.newsStoryId) {
      ctx.addIssue({
        code: "custom",
        message: "newsStory.id must match newsStoryId",
        path: ["newsStoryId"],
      });
    }
    for (let index = 0; index < data.newsSources.length; index += 1) {
      const source = data.newsSources[index]!;
      if (source.newsStoryId !== data.newsStoryId) {
        ctx.addIssue({
          code: "custom",
          message: "Every newsSource.newsStoryId must match newsStoryId",
          path: ["newsSources", index, "newsStoryId"],
        });
      }
    }
  });

export type NewsNewChatParams = z.input<typeof newsNewChatParamsSchema> & {
  abortSignal?: AbortSignal;
};

export const newsNewChatResultSchema = z.object({
  newsStoryId: z.uuid(),
  researchPrompt: z.string().min(200),
});

export type NewsNewChatResult = z.infer<typeof newsNewChatResultSchema>;

const modelOutputSchema = z.object({
  researchPrompt: z.string().min(200).max(32_000),
});

function resolveNewsNewChatModel(override?: string): string {
  return resolveOpenAiModelId(override, process.env.NEWS_NEW_CHAT_MODEL);
}

function formatPublishedAt(value: Date | null | undefined): string {
  if (!value) {
    return "Unknown";
  }
  return value.toISOString().slice(0, 10);
}

function excerptScrape(content: string | null | undefined, maxChars = 1200): string {
  if (!content?.trim()) {
    return "(No scraped body available — use URL and title only.)";
  }
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars)}\n…[truncated]`;
}

function buildSystemPrompt(): string {
  return [
    "You are the NewsNewChat research-prompt generator for a stock-market and economic news product.",
    "You do NOT search the web, call SerpAPI, scrape URLs, or answer the user directly.",
    "You produce one detailed research prompt string for a downstream Determiner agent that will choose Serp tools and run searches.",
    "",
    "Ground every statement in the supplied NewsStory and NewsSource records only.",
    "Do not invent facts, figures, quotes, or events that are not supported by that context.",
    "Treat the story and its sources as starting context — not verified truth.",
    "",
    "The research prompt you write must be a single cohesive document (plain text) that includes clearly labeled sections such as:",
    "- NEWS STORY (title, category, location, published date)",
    "- STORY SUMMARY and STORY CONTENT (from supplied fields; note description if present)",
    "- EXISTING SOURCES (numbered list with publisher/domain, title, URL; note scraped excerpts when provided)",
    "- USER'S RESEARCH REQUEST (quote the user's request)",
    "- RESEARCH OBJECTIVE (one concise paragraph)",
    "- INVESTIGATE (bullet list of concrete research tasks and questions)",
    "- CLAIMS TO VERIFY (bullets drawn from the story — only claims present in context)",
    "- ENTITIES AND SIGNALS (organizations, people, metrics, tickers, dates, events mentioned in context)",
    "- CONTEXT AND COMPARISONS (historical or peer comparisons worth exploring, when suggested by context)",
    "- SOURCE GUIDANCE (prioritize primary/authoritative data; seek supporting and contradictory evidence)",
    "",
    "Expand the user's research request into specific questions where helpful.",
    "Do not output JSON, tool names, or SerpAPI call plans.",
    "Do not include markdown code fences.",
  ].join("\n");
}

function buildUserPrompt(researchRequest: string): string {
  return [
    "Using the NewsStory and NewsSources in the additional context, write the full research prompt for the downstream Determiner agent.",
    "",
    "The Determiner will receive your output as its user prompt and decide whether to call Serp tools.",
    "",
    `User research request to honor:\n${researchRequest.trim()}`,
  ].join("\n");
}

function buildExtraContext(params: z.output<typeof newsNewChatParamsSchema>) {
  const { newsStory, newsSources } = params;

  return {
    newsStoryId: params.newsStoryId,
    newsStory: {
      id: newsStory.id,
      newsRequestId: newsStory.newsRequestId,
      title: newsStory.title,
      description: newsStory.description ?? null,
      slug: newsStory.slug,
      summary: newsStory.summary,
      content: newsStory.content,
      category: newsStory.category,
      location: newsStory.location ?? null,
      publishedAt: newsStory.publishedAt?.toISOString() ?? null,
      importanceScore: newsStory.importanceScore ?? null,
    },
    newsSources: newsSources.map((source, index) => ({
      index: index + 1,
      id: source.id,
      url: source.url,
      domain: source.domain,
      title: source.title,
      sourceType: source.sourceType,
      publishedAt: source.publishedAt?.toISOString() ?? null,
      scrapedExcerpt: excerptScrape(source.scrapedContent),
    })),
    publishedAtDisplay: formatPublishedAt(newsStory.publishedAt ?? null),
  };
}

async function runNewsNewChatCore(
  params: NewsNewChatParams,
  generate: typeof aiClient.generate,
): Promise<NewsNewChatResult> {
  const { abortSignal, ...rawParams } = params;
  const parsed = newsNewChatParamsSchema.parse({
    ...rawParams,
    researchRequest:
      rawParams.researchRequest?.trim() || DEFAULT_NEWS_RESEARCH_REQUEST,
  });

  const model = resolveNewsNewChatModel(parsed.model);
  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: buildUserPrompt(parsed.researchRequest),
    extraContext: buildExtraContext(parsed),
    schemaName: "NewsNewChatOutput",
    schemaDescription:
      "A single detailed research prompt for the downstream Determiner agent.",
    output: modelOutputSchema,
    temperature: 0.2,
    maxOutputTokens: 8192,
    abortSignal,
  });

  return newsNewChatResultSchema.parse({
    newsStoryId: parsed.newsStoryId,
    researchPrompt: raw.researchPrompt.trim(),
  });
}

export function createNewsNewChatAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function newsNewChatAgent(
    params: NewsNewChatParams,
  ): Promise<NewsNewChatResult> {
    return runNewsNewChatCore(params, client.generate.bind(client));
  };
}

/** Build a Determiner-ready research prompt from a NewsStory and its sources. */
export async function runNewsNewChatAgent(
  params: NewsNewChatParams,
): Promise<NewsNewChatResult> {
  return runNewsNewChatCore(params, aiClient.generate.bind(aiClient));
}
