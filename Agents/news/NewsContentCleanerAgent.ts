/**
 * News content cleaner agent
 *
 * Strips webpage noise from Firecrawl markdown before the News Synthesizer.
 * Does not summarize, rewrite facts, or rank — only extracts the article body.
 *
 * Input: location, date (YYYY-MM-DD), raw scraped content; optional model, system.
 *
 * Output: { cleanedContent, isValidArticle, model }
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const MAX_RAW_CONTENT_CHARS = 80_000;
const MAX_CLEANED_CONTENT_CHARS = 100_000;

export const newsContentCleanerParamsSchema = z.object({
  location: z.string().min(1).nullable().optional(),
  date: isoDateSchema,
  content: z.string().min(1).max(MAX_RAW_CONTENT_CHARS + 500),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type NewsContentCleanerParams = z.input<
  typeof newsContentCleanerParamsSchema
> & {
  abortSignal?: AbortSignal;
};

export const newsContentCleanerOutputSchema = z.object({
  cleanedContent: z.string().max(MAX_CLEANED_CONTENT_CHARS),
  isValidArticle: z.boolean(),
});

export type NewsContentCleanerOutput = z.infer<
  typeof newsContentCleanerOutputSchema
>;

const newsContentCleanerModelOutputSchema = z.object({
  cleanedContent: z.string().max(MAX_CLEANED_CONTENT_CHARS),
  isValidArticle: z.boolean(),
});

function resolveContentCleanerModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.NEWS_CONTENT_CLEANER_MODEL ??
      process.env.RESEARCH_ARTICLE_SELECTOR_MODEL,
  );
}

function trimRawContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_RAW_CONTENT_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_RAW_CONTENT_CHARS)}\n…[truncated]`;
}

function buildSystemPrompt(): string {
  return [
    "You are an Article Content Cleaning Agent in a news-generation pipeline.",
    "Your job is to clean scraped webpage content before it is passed to the final News Synthesizer.",
    "",
    "Primary objective: preserve the actual news article content and remove webpage noise, advertisements, promotional material, and unrelated website content so the next AI model receives clean, focused news content.",
    "",
    "Remove all content that is not part of the actual news article, including:",
    "- advertisements, sponsored content, promotional banners, product promotions, app-download promotions",
    "- newsletter signup, subscribe prompts, follow-us sections, social-media promotion",
    "- WhatsApp/Telegram promotional sections, donation requests, advertise-with-us, write-for-us, guest-posting promotions",
    "- website membership promotions, navigation menus, category lists, site headers and footers",
    "- website-wide links, unrelated sidebar content, most-read, trending, recommended stories, related articles",
    "- previous/next article sections, unrelated embedded articles, comments and comment forms",
    "- cookie/privacy notices, login/signup prompts, repeated website branding",
    "- unrelated images, image metadata, or image URLs, unrelated links, duplicate text, page-wide boilerplate",
    "- SEO keyword lists, unrelated FAQs generated for the website rather than the article",
    "- unrelated widgets, stock website elements, weather widgets, unrelated location lists, unrelated article cards",
    "",
    "Preserve the actual article's headline, subtitle/deck, body, article-specific headings, factual statements, dates, numbers, statistics, names, organizations, locations, quotes, tables, bullet points that belong to the article, article-specific analysis and context, relevant publication/update information, and important source references within the article.",
    "Do not remove legitimate news content merely because it contains promotional-looking words (e.g. a company launching a product reported as news).",
    "",
    "Location and date are context for what the user requested. Do NOT rewrite facts to match them. Do NOT invent missing information. Do NOT change factual meaning.",
    "If the article discusses broader state, national, or international events, preserve that content.",
    "",
    "You are a content cleaner, NOT a news synthesizer. Do NOT summarize, rewrite the story, add facts, fact-check, combine articles, rank, determine importance, generate headlines/summaries/analysis, or invent dates/locations.",
    "",
    "Return JSON only with cleanedContent (readable Markdown article text) and isValidArticle.",
    "If no meaningful article remains after cleaning, set isValidArticle false and cleanedContent to an empty string.",
    "Invalid pages include search/category/tag/author/homepage/topic/listing pages, ad-only pages, link-only pages, or pages with no identifiable article body.",
    "",
    "cleanedContent must: contain only article content; be readable Markdown; preserve original meaning; have no ads, navigation, unrelated articles, promotional footers, boilerplate, raw HTML, or unnecessary URLs.",
  ].join("\n");
}

function buildUserPrompt(params: z.infer<typeof newsContentCleanerParamsSchema>): string {
  const locationLine =
    params.location?.trim() || "Not specified (world or general context)";
  return [
    "Location: " + locationLine,
    "Date: " + params.date,
    "",
    "Raw Content:",
    trimRawContent(params.content),
  ].join("\n");
}

function normalizeCleanerOutput(
  raw: z.infer<typeof newsContentCleanerModelOutputSchema>,
): NewsContentCleanerOutput {
  const cleanedContent = raw.cleanedContent.trim();
  if (!raw.isValidArticle || cleanedContent.length === 0) {
    return newsContentCleanerOutputSchema.parse({
      cleanedContent: "",
      isValidArticle: false,
    });
  }
  return newsContentCleanerOutputSchema.parse({
    cleanedContent,
    isValidArticle: true,
  });
}

function outputTokenBudget(contentLength: number): number {
  return Math.min(16_000, Math.max(2048, Math.ceil(contentLength / 4) + 512));
}

async function runContentCleaner(
  params: NewsContentCleanerParams,
  generate: typeof aiClient.generate,
): Promise<NewsContentCleanerOutput & { model: string }> {
  const { abortSignal, ...rawParams } = params;
  const parsed = newsContentCleanerParamsSchema.parse(rawParams);
  const model = resolveContentCleanerModel(parsed.model);

  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: buildUserPrompt(parsed),
    schemaName: "NewsContentCleanerOutput",
    schemaDescription:
      "Cleaned article Markdown with webpage noise removed; isValidArticle false when no real article body exists.",
    output: newsContentCleanerModelOutputSchema,
    temperature: 0,
    maxOutputTokens: outputTokenBudget(parsed.content.length),
    abortSignal,
  });

  const output = normalizeCleanerOutput(raw);
  return { ...output, model };
}

export function createNewsContentCleanerAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function newsContentCleanerAgent(
    params: NewsContentCleanerParams,
  ): Promise<NewsContentCleanerOutput & { model: string }> {
    return runContentCleaner(params, client.generate.bind(client));
  };
}

/** Clean one scraped article body for the news synthesizer. */
export async function runNewsContentCleanerAgent(
  params: NewsContentCleanerParams,
): Promise<NewsContentCleanerOutput & { model: string }> {
  return runContentCleaner(params, aiClient.generate.bind(aiClient));
}
