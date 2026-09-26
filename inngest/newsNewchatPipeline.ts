/**
 * News-story chat pipeline (first deep-dive run)
 *
 * Event: chat/pipeline.requested
 * Input: { userId, chatSessionId, userMessageId }
 *
 * Purpose: Handle the first research chat tied to a news story (or legacy start
 * flow): build a long research brief from the story + news sources, run Serp,
 * scrape articles, and produce the initial assistant answer. Does not use
 * pgvector session research on this path; isNewsStory skips query enhancement
 * when the session is a deep dive.
 *
 * Steps:
 * 1. load-chat-session — Verify the session belongs to the user.
 * 2. load-user-message — Load the triggering user message content.
 * 3. build-research-prompt — For news deep dives, expand story + news sources
 *    into a research prompt; otherwise use raw user text.
 * 4. run-determiner — Guardrails and Serp routing (with recent messages when
 *    not a news-story session).
 * 5. save-guardrail-message — Save refusal if guardrails block the prompt.
 * 6. fetch-and-normalize-serp — Execute Serp calls and merge normalized hits.
 * 7. select-articles — Article synthesizer chooses URLs to scrape.
 * 8. scrape-and-persist-sources — Firecrawl + save ResearchSource rows for chat.
 * 9. generate-assistant-reply — Chat model answer with Serp + scraped context.
 * 10. save-assistant-message — Persist the agent Markdown reply.
 * 11. save-error-message — On failure, save an agent error message for the UI.
 */

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
  type SmallDeterminerRunResult,
  type ValidatedSerpToolCall,
} from "@/Agents/chat/smallDeterminerAgent";
import { GuardrailBlockedError } from "@/Agents/chat/guardrails";
import { inngest } from "@/clients/inngestClient";
import {
  createChatMessage,
  listRecentChatMessagesByChatSessionId,
} from "@/repositories/chatMessage";
import { CHAT_PIPELINE_RECENT_MESSAGE_LIMIT } from "@/services/chat/recentChatMessagesForPipeline";
import { getChatSessionByIdForUser } from "@/repositories/chatSession";
import { listNewsSourcesByIdsForStory } from "@/repositories/newsSource";
import { getNewsStoryWithSourcesById } from "@/repositories/newsStory";
import {
  createResearchSource,
  listResearchSourcesByChatSessionId,
} from "@/repositories/researchSource";
import {
  fetchAndNormalizeSerp,
  roleForChatModel,
} from "@/services/chat/chatSerpResearch";
import { scrapeUrlsWithFirecrawl } from "@/services/firecrawl/scrapeUrls";
import type { NormalizedSerpHit } from "@/services/chat/normalizeSerpResults";
import { researchUrlKeysFromSources } from "@/services/chat/dedupeResearchArticles";
import { mergeDirectFirecrawlTargets } from "@/services/chat/directUrlResearch";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import { z } from "zod";

export const CHAT_PIPELINE_EVENT = "chat/pipeline.requested" as const;

export const chatPipelineEventDataSchema = z.object({
  userId: z.string().min(1),
  chatSessionId: z.uuid(),
  userMessageId: z.uuid(),
});

export type ChatPipelineEventData = z.infer<typeof chatPipelineEventDataSchema>;

const PIPELINE_LOG_PREFIX = "[chat-pipeline]";
const RESEARCH_SOURCE_INSERT_CONCURRENCY = 4;

function createStepTimer(): () => number {
  const startedAt = Date.now();
  return () => Date.now() - startedAt;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function pipelineLog(
  step: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  console.log(`${PIPELINE_LOG_PREFIX} ${step}: ${message}${suffix}`);
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
      const pipelineStartedAt = Date.now();

      const [session, userMessage] = await Promise.all([
        step.run("load-chat-session", async () => {
          const elapsed = createStepTimer();
          pipelineLog("load-chat-session", "start");
          const row = await getChatSessionByIdForUser(
            input.chatSessionId,
            input.userId,
          );
          if (!row) {
            throw new Error("Chat session not found for user");
          }
          pipelineLog("load-chat-session", "done", { durationMs: elapsed() });
          return toJsonSafeStepOutput(row);
        }),
        step.run("load-user-message", async () => {
          const elapsed = createStepTimer();
          pipelineLog("load-user-message", "start");
          const messages = await listRecentChatMessagesByChatSessionId(
            input.chatSessionId,
            20,
          );
          const message = messages.find(
            (row) => row.id === input.userMessageId,
          );
          if (!message) {
            throw new Error("User message not found on chat session");
          }
          pipelineLog("load-user-message", "done", { durationMs: elapsed() });
          return toJsonSafeStepOutput({
            id: message.id,
            content: message.content,
            role: message.role,
          });
        }),
      ]);

      const researchPrompt = await step.run(
        "build-research-prompt",
        async () => {
          const elapsed = createStepTimer();
          pipelineLog("build-research-prompt", "start", {
            isFromNewsStory: session.isFromNewsStory,
          });

          if (!session.newsStoryId || !session.isFromNewsStory) {
            pipelineLog("build-research-prompt", "done", {
              durationMs: elapsed(),
              promptLength: userMessage.content.trim().length,
            });
            return toJsonSafeStepOutput({
              newsStoryId: null as string | null,
              researchPrompt: userMessage.content.trim(),
            });
          }

          const storyBundle = await getNewsStoryWithSourcesById(
            session.newsStoryId,
          );
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
            researchRequest:
              userMessage.content.trim() || DEFAULT_NEWS_RESEARCH_REQUEST,
            abortSignal: AbortSignal.timeout(180_000),
          });

          pipelineLog("build-research-prompt", "done", {
            durationMs: elapsed(),
            promptLength: result.researchPrompt.length,
          });

          return toJsonSafeStepOutput({
            newsStoryId: result.newsStoryId,
            researchPrompt: result.researchPrompt,
          });
        },
      );

      type DeterminerStepSuccess = {
        blocked: false;
        outcome: SmallDeterminerRunResult;
        chatHistoryForModel: ReturnType<typeof sliceChatHistoryForModel>;
      };

      const determinerResult = await step.run("run-determiner", async () => {
        const elapsed = createStepTimer();
        const historyRows = await listRecentChatMessagesByChatSessionId(
          input.chatSessionId,
          CHAT_PIPELINE_RECENT_MESSAGE_LIMIT + 1,
        );
        const historyWithoutCurrent = historyRows.filter(
          (row) => row.id !== input.userMessageId,
        );
        const recentMessages = historyWithoutCurrent
          .slice(-CHAT_PIPELINE_RECENT_MESSAGE_LIMIT)
          .map((row) => ({
            role: row.role,
            content: row.content,
          }));
        const chatHistoryForModel = sliceChatHistoryForModel(
          historyRows
            .slice(-CHAT_PIPELINE_RECENT_MESSAGE_LIMIT)
            .filter((row) => row.id !== input.userMessageId)
            .map((row) => ({
              role: roleForChatModel(row.role),
              content: row.content,
            })),
        );

        pipelineLog("run-determiner", "start", {
          recentMessageCount: recentMessages.length,
          isFromNewsStory: session.isFromNewsStory,
        });
        try {
          const outcome = await runSmallDeterminerAgent({
            userPrompt: researchPrompt.researchPrompt,
            isNewsStory: session.isFromNewsStory === true,
            recentMessages,
            abortSignal: AbortSignal.timeout(120_000),
          });
          pipelineLog("run-determiner", "done", {
            durationMs: elapsed(),
            useTools: outcome.determiner.useTools,
            callCount:
              outcome.determiner.useTools === "yes"
                ? outcome.determiner.calls.length
                : 0,
            firecrawlUrlCount: outcome.determiner.firecrawlUrls.length,
          });
          return toJsonSafeStepOutput({
            blocked: false as const,
            outcome,
            chatHistoryForModel,
          } satisfies DeterminerStepSuccess);
        } catch (error) {
          if (error instanceof GuardrailBlockedError) {
            pipelineLog("run-determiner", "done", {
              durationMs: elapsed(),
              blocked: true,
            });
            return toJsonSafeStepOutput({
              blocked: true as const,
              reason: error.message,
            });
          }
          throw error;
        }
      });

      if ("blocked" in determinerResult && determinerResult.blocked) {
        const blockedMessage = await step.run(
          "save-guardrail-message",
          async () =>
            createChatMessage({
              chatSessionId: input.chatSessionId,
              role: "agent",
              content:
                "I can't run that research request because it falls outside stock-market and economic research guardrails.",
            }),
        );
        return toJsonSafeStepOutput({ assistantMessageId: blockedMessage.id });
      }

      const determinerStep = determinerResult as DeterminerStepSuccess;
      const determiner = determinerStep.outcome.determiner;
      const chatHistoryForModel = determinerStep.chatHistoryForModel;

      const serpHits = await step.run("fetch-and-normalize-serp", async () => {
        const elapsed = createStepTimer();
        if (determiner.useTools !== "yes" || determiner.calls.length === 0) {
          pipelineLog("fetch-and-normalize-serp", "skipped", {
            durationMs: elapsed(),
            reason: "no serp calls",
          });
          return toJsonSafeStepOutput([] as NormalizedSerpHit[]);
        }

        pipelineLog("fetch-and-normalize-serp", "start", {
          calls: determiner.calls.length,
        });

        const merged = await fetchAndNormalizeSerp(
          determiner.calls as ValidatedSerpToolCall[],
        );
        pipelineLog("fetch-and-normalize-serp", "done", {
          durationMs: elapsed(),
          hitCount: merged.length,
        });
        return toJsonSafeStepOutput(merged);
      });

      const [selectedArticles, preloadedSessionSources] = await Promise.all([
        step.run("select-articles", async () => {
          const elapsed = createStepTimer();
          if (serpHits.length === 0) {
            pipelineLog("select-articles", "skipped", {
              durationMs: elapsed(),
            });
            return toJsonSafeStepOutput([]);
          }
          pipelineLog("select-articles", "start", {
            candidates: serpHits.length,
          });
          const selected = await runArticleSynthesizerAgent({
            userPrompt: researchPrompt.researchPrompt,
            hits: serpHits,
            topPercent: 40,
            maxArticles: 6,
            abortSignal: AbortSignal.timeout(120_000),
          });
          pipelineLog("select-articles", "done", {
            durationMs: elapsed(),
            selected: selected.length,
          });
          return toJsonSafeStepOutput(selected);
        }),
        step.run("preload-existing-research-sources", async () => {
          const elapsed = createStepTimer();
          const sessionSources = await listResearchSourcesByChatSessionId(
            input.chatSessionId,
          );
          pipelineLog("preload-existing-research-sources", "done", {
            durationMs: elapsed(),
            count: sessionSources.length,
            preloadedDuringSynthesizer: true,
          });
          return toJsonSafeStepOutput(sessionSources);
        }),
      ]);

      const scrapedSources = await step.run(
        "scrape-and-persist-sources",
        async () => {
          const elapsed = createStepTimer();
          const freshSessionSources = await listResearchSourcesByChatSessionId(
            input.chatSessionId,
          );
          const existingKeys = researchUrlKeysFromSources(freshSessionSources);
          const toScrape = mergeDirectFirecrawlTargets(
            selectedArticles,
            determiner.firecrawlUrls,
            existingKeys,
          );

          pipelineLog("scrape-and-persist-sources", "start", {
            count: toScrape.length,
            directUrls: determiner.firecrawlUrls.length,
            preloadedCount: preloadedSessionSources.length,
          });

          if (toScrape.length === 0) {
            pipelineLog("scrape-and-persist-sources", "done", {
              durationMs: elapsed(),
              saved: 0,
            });
            return toJsonSafeStepOutput([]);
          }

          const scrapedMarkdown = await scrapeUrlsWithFirecrawl(
            toScrape.map((article) => article.url),
          );

          const rows = await mapWithConcurrency(
            toScrape,
            RESEARCH_SOURCE_INSERT_CONCURRENCY,
            async (article, index) => {
              let content = scrapedMarkdown[index]?.trim() ?? "";

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
            },
          );

          pipelineLog("scrape-and-persist-sources", "done", {
            durationMs: elapsed(),
            saved: rows.length,
          });
          return toJsonSafeStepOutput(rows);
        },
      );

      const assistantMarkdown = await step.run(
        "generate-assistant-reply",
        async () => {
          const elapsed = createStepTimer();
          pipelineLog("generate-assistant-reply", "start");

          const markdown = await runChatModelAgent({
            prompt: userMessage.content,
            serpData: {
              researchPrompt: researchPrompt.researchPrompt,
              normalizedHits: serpHits,
              scrapedResearchSources: scrapedSources,
            },
            chatHistory: chatHistoryForModel,
            abortSignal: AbortSignal.timeout(300_000),
          });

          pipelineLog("generate-assistant-reply", "done", {
            durationMs: elapsed(),
            length: markdown.length,
          });
          return toJsonSafeStepOutput(markdown);
        },
      );

      const assistantMessage = await step.run(
        "save-assistant-message",
        async () => {
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
        },
      );

      pipelineLog("run", "finished", {
        assistantMessageId: assistantMessage.id,
        totalDurationMs: Date.now() - pipelineStartedAt,
      });
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
