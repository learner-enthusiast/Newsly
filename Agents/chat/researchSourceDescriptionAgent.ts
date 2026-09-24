import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

export const researchSourceDescriptionParamsSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  domain: z.string().min(1),
  content: z.string().min(1),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type ResearchSourceDescriptionParams = z.input<
  typeof researchSourceDescriptionParamsSchema
> & {
  abortSignal?: AbortSignal;
};

const modelOutputSchema = z.object({
  description: z.string().min(1).max(12_000),
});

const CONTENT_EXCERPT_CHARS = 12_000;

function resolveResearchSourceDescriptionModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.RESEARCH_SOURCE_DESCRIPTION_MODEL,
  );
}

function buildSystemPrompt(): string {
  return [
    "You summarize scraped research articles for a stock-market research product.",
    "",
    "Write a concise summary description of the article body.",
    "Length: about 10–15 lines of plain text (no Markdown headings or bullet lists unless essential).",
    "Cover: main thesis, key facts, numbers or quotes when present, and relevance to markets or the economy.",
    "Do not invent facts not supported by the provided content.",
    "Do not mention that you are summarizing or reference the prompt.",
    "Output only the description field.",
  ].join("\n");
}

function buildUserPrompt(params: z.output<typeof researchSourceDescriptionParamsSchema>): string {
  const excerpt = params.content.trim().slice(0, CONTENT_EXCERPT_CHARS);
  return [
    `Title: ${params.title.trim()}`,
    `URL: ${params.url.trim()}`,
    `Domain: ${params.domain.trim()}`,
    "",
    "Article content:",
    excerpt,
  ].join("\n");
}

async function runResearchSourceDescriptionCore(
  params: ResearchSourceDescriptionParams,
  generate: typeof aiClient.generate,
): Promise<string> {
  const { abortSignal, ...rawParams } = params;
  const parsed = researchSourceDescriptionParamsSchema.parse(rawParams);
  const model = resolveResearchSourceDescriptionModel(parsed.model);

  const result = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: buildUserPrompt(parsed),
    schemaName: "ResearchSourceDescription",
    schemaDescription:
      "Plain-text summary of a research article, about 10–15 lines.",
    output: modelOutputSchema,
    temperature: 0.2,
    maxOutputTokens: 900,
    abortSignal,
  });

  return result.description.trim();
}

export function createResearchSourceDescriptionAgent(
  options: AIClientOptions = {},
) {
  const client = createAIClient(options);

  return function researchSourceDescriptionAgent(
    params: ResearchSourceDescriptionParams,
  ): Promise<string> {
    return runResearchSourceDescriptionCore(params, client.generate.bind(client));
  };
}

export async function runResearchSourceDescriptionAgent(
  params: ResearchSourceDescriptionParams,
): Promise<string> {
  return runResearchSourceDescriptionCore(params, aiClient.generate.bind(aiClient));
}
