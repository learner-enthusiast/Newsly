import { runArticleSynthesizerAgent } from "@/Agents/chat/ArticleSythesizerAgent";
import {
  runChatModelAgent,
  sliceChatHistoryForModel,
} from "@/Agents/chat/chatModel";
import {
  DEFAULT_NEWS_RESEARCH_REQUEST,
  runNewsNewChatAgent,
} from "@/Agents/chat/newsNewChatAgent";
import {
  runSmallDeterminerAgent,
  sanitizeSerpToolInput,
  type ValidatedSerpToolCall,
} from "@/Agents/chat/smallDeterminerAgent";
import { GuardrailBlockedError } from "@/Agents/chat/guardrails";
import { inngest } from "@/clients/inngestClient";
import { firecrawlClient } from "@/clients/FireCrawlClient";
import { createChatMessage } from "@/repositories/chatMessage";
import { getChatSessionByIdForUser } from "@/repositories/chatSession";
import { listNewsSourcesByIdsForStory } from "@/repositories/newsSource";
import { getNewsStoryWithSourcesById } from "@/repositories/newsStory";
import { createResearchSource } from "@/repositories/researchSource";
import { listRecentChatMessagesByChatSessionId } from "@/repositories/chatMessage";
import { serpEngines } from "@/SERP/index";
import {
  mergeNormalizedSerpHits,
  normalizeSerpEnginePayload,
  type NormalizedSerpHit,
} from "@/services/chat/normalizeSerpResults";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import { z } from "zod";

export const CHAT_PIPELINE_EVENT = "chat/pipeline.requested" as const;

export const chatPipelineEventDataSchema = z.object({
  userId: z.string().min(1),
  chatSessionId: z.uuid(),
  userMessageId: z.uuid(),
});

export type ChatPipelineEventData = z.infer<typeof chatPipelineEventDataSchema>;

const SERP_NUM = 20;
const PIPELINE_LOG_PREFIX = "[chat-pipeline]";

function pipelineLog(
  step: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  console.log(`${PIPELINE_LOG_PREFIX} ${step}: ${message}${suffix}`);
}

function scrapeMarkdown(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.markdown === "string" && record.markdown.trim()) {
    return record.markdown;
  }
  const data = record.data;
  if (data && typeof data === "object") {
    const markdown = (data as Record<string, unknown>).markdown;
    if (typeof markdown === "string" && markdown.trim()) {
      return markdown;
    }
  }
  return null;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function runSerpCall(call: ValidatedSerpToolCall): Promise<unknown> {
  const engine = serpEngines[call.tool];
  const input = sanitizeSerpToolInput(call.tool, {
    ...(call.input as Record<string, unknown>),
    num: SERP_NUM,
  });
  return engine.fn(input);
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((item, chunkIndex) => fn(item, index + chunkIndex)),
    );
    results.push(...chunkResults);
  }
  return results;
}

function roleForChatModel(role: string): string {
  if (role === "agent" || role === "assistant") {
    return "assistant";
  }
  return role;
}

export const chatPipelineFunction = inngest.createFunction(
  {
    id: "chat-pipeline",
    name: "Chat research pipeline",
    triggers: [{ event: CHAT_PIPELINE_EVENT }],
    timeouts: { finish: "30m" },
  },
  async ({ event, step }) => {
    const input = chatPipelineEventDataSchema.parse(event.data);

    pipelineLog("run", "started", {
      chatSessionId: input.chatSessionId,
      userMessageId: input.userMessageId,
    });

    try {
      const session = await step.run("load-chat-session", async () => {
        pipelineLog("load-chat-session", "start");
        const row = await getChatSessionByIdForUser(
          input.chatSessionId,
          input.userId,
        );
        if (!row) {
          throw new Error("Chat session not found for user");
        }
        return toJsonSafeStepOutput(row);
      });

      const userMessage = await step.run("load-user-message", async () => {
        const messages = await listRecentChatMessagesByChatSessionId(
          input.chatSessionId,
          20,
        );
        const message = messages.find((row) => row.id === input.userMessageId);
        if (!message) {
          throw new Error("User message not found on chat session");
        }
        return toJsonSafeStepOutput({
          id: message.id,
          content: message.content,
          role: message.role,
        });
      });

      const researchPrompt = await step.run("build-research-prompt", async () => {
        pipelineLog("build-research-prompt", "start", {
          isFromNewsStory: session.isFromNewsStory,
        });

        if (!session.newsStoryId || !session.isFromNewsStory) {
          return toJsonSafeStepOutput({
            newsStoryId: null as string | null,
            researchPrompt: userMessage.content.trim(),
          });
        }

        const storyBundle = await getNewsStoryWithSourcesById(session.newsStoryId);
        if (!storyBundle) {
          throw new Error("Linked news story not found");
        }

        const selectedIds =
          session.newsSourceId.length > 0
            ? session.newsSourceId
            : storyBundle.newsSourceIds;

        const newsSources = await listNewsSourcesByIdsForStory(
          session.newsStoryId,
          selectedIds,
        );

        if (newsSources.length === 0) {
          throw new Error("No news sources found for chat session");
        }

        const { sources: _all, ...newsStory } = storyBundle;
        const result = await runNewsNewChatAgent({
          newsStoryId: session.newsStoryId,
          newsStory: {
            ...newsStory,
            importanceScore:
              newsStory.importanceScore != null
                ? Number(newsStory.importanceScore)
                : null,
          },
          newsSources,
          researchRequest: userMessage.content.trim() || DEFAULT_NEWS_RESEARCH_REQUEST,
          abortSignal: AbortSignal.timeout(180_000),
        });

        pipelineLog("build-research-prompt", "done", {
          promptLength: result.researchPrompt.length,
        });

        return toJsonSafeStepOutput({
          newsStoryId: result.newsStoryId,
          researchPrompt: result.researchPrompt,
        });
      });

      const determinerResult = await step.run("run-determiner", async () => {
        pipelineLog("run-determiner", "start");
        try {
          const outcome = await runSmallDeterminerAgent({
            userPrompt: researchPrompt.researchPrompt,
            isNewsStory: true,
            abortSignal: AbortSignal.timeout(120_000),
          });
          pipelineLog("run-determiner", "done", {
            useTools: outcome.determiner.useTools,
            callCount:
              outcome.determiner.useTools === "yes"
                ? outcome.determiner.calls.length
                : 0,
          });
          return toJsonSafeStepOutput(outcome);
        } catch (error) {
          if (error instanceof GuardrailBlockedError) {
            return toJsonSafeStepOutput({
              blocked: true as const,
              reason: error.message,
            });
          }
          throw error;
        }
      });

      if ("blocked" in determinerResult && determinerResult.blocked) {
        const blockedMessage = await step.run("save-guardrail-message", async () =>
          createChatMessage({
            chatSessionId: input.chatSessionId,
            role: "agent",
            content:
              "I can't run that research request because it falls outside stock-market and economic research guardrails.",
          }),
        );
        return toJsonSafeStepOutput({ assistantMessageId: blockedMessage.id });
      }

      const serpHits = await step.run("fetch-and-normalize-serp", async () => {
        const determiner = determinerResult as {
          determiner: {
            useTools: "yes" | "no";
            calls?: ValidatedSerpToolCall[];
          };
        };

        if (determiner.determiner.useTools !== "yes") {
          pipelineLog("fetch-and-normalize-serp", "skipped", { reason: "no tools" });
          return toJsonSafeStepOutput([] as NormalizedSerpHit[]);
        }

        pipelineLog("fetch-and-normalize-serp", "start", {
          calls: determiner.determiner.calls?.length ?? 0,
        });

        const payloads = await Promise.all(
          (determiner.determiner.calls ?? []).map((call) => runSerpCall(call)),
        );

        const batches: NormalizedSerpHit[] = [];
        (determiner.determiner.calls ?? []).forEach((call, index) => {
          batches.push(
            ...normalizeSerpEnginePayload(payloads[index], call.tool, SERP_NUM),
          );
        });

        const merged = mergeNormalizedSerpHits(batches, 40);
        pipelineLog("fetch-and-normalize-serp", "done", { hitCount: merged.length });
        return toJsonSafeStepOutput(merged);
      });

      const selectedArticles = await step.run("select-articles", async () => {
        if (serpHits.length === 0) {
          return toJsonSafeStepOutput([]);
        }
        pipelineLog("select-articles", "start", { candidates: serpHits.length });
        const selected = await runArticleSynthesizerAgent({
          userPrompt: researchPrompt.researchPrompt,
          hits: serpHits,
          topPercent: 40,
          maxArticles: 6,
          abortSignal: AbortSignal.timeout(120_000),
        });
        pipelineLog("select-articles", "done", { selected: selected.length });
        return toJsonSafeStepOutput(selected);
      });

      const scrapedSources = await step.run("scrape-and-persist-sources", async () => {
        if (selectedArticles.length === 0) {
          return toJsonSafeStepOutput([]);
        }

        pipelineLog("scrape-and-persist-sources", "start", {
          count: selectedArticles.length,
        });

        const rows = await mapConcurrent(selectedArticles, 3, async (article) => {
          let content = "";
          try {
            const scraped = await firecrawlClient.scrape({ url: article.url });
            content = scrapeMarkdown(scraped)?.trim() ?? "";
          } catch {
            content = "";
          }

          if (!content) {
            content = article.title;
          }

          const saved = await createResearchSource({
            chatSessionId: input.chatSessionId,
            url: article.url,
            domain: article.domain,
            title: article.title,
            content: content.slice(0, 50_000),
            sourceType: article.sourceType,
          });

          return {
            id: saved.id,
            url: saved.url,
            domain: saved.domain,
            title: saved.title,
            sourceType: saved.sourceType,
            contentExcerpt: saved.content.slice(0, 4000),
          };
        });

        pipelineLog("scrape-and-persist-sources", "done", { saved: rows.length });
        return toJsonSafeStepOutput(rows);
      });

      const assistantMarkdown = await step.run("generate-assistant-reply", async () => {
        pipelineLog("generate-assistant-reply", "start");
        const historyRows = await listRecentChatMessagesByChatSessionId(
          input.chatSessionId,
          10,
        );
        const chatHistory = sliceChatHistoryForModel(
          historyRows
            .filter((row) => row.id !== input.userMessageId)
            .map((row) => ({
              role: roleForChatModel(row.role),
              content: row.content,
            })),
        );

        const markdown = await runChatModelAgent({
          prompt: userMessage.content,
          serpData: {
            researchPrompt: researchPrompt.researchPrompt,
            normalizedHits: serpHits,
            scrapedResearchSources: scrapedSources,
          },
          chatHistory,
          abortSignal: AbortSignal.timeout(300_000),
        });

        pipelineLog("generate-assistant-reply", "done", {
          length: markdown.length,
        });
        return toJsonSafeStepOutput(markdown);
      });

      const assistantMessage = await step.run("save-assistant-message", async () => {
        pipelineLog("save-assistant-message", "start");
        const saved = await createChatMessage({
          chatSessionId: input.chatSessionId,
          role: "agent",
          content: assistantMarkdown,
        });
        pipelineLog("save-assistant-message", "done", { id: saved.id });
        return toJsonSafeStepOutput({
          id: saved.id,
          role: saved.role,
          content: saved.content,
          createdAt: saved.createdAt.toISOString(),
        });
      });

      pipelineLog("run", "finished", { assistantMessageId: assistantMessage.id });
      return assistantMessage;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pipelineLog("run", "failed", { error: message });

      await step.run("save-error-message", async () =>
        createChatMessage({
          chatSessionId: input.chatSessionId,
          role: "agent",
          content: `Research pipeline failed: ${message}`,
        }),
      );
      throw error;
    }
  },
);
