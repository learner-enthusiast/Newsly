/**
 * News-story chat pipeline (first deep-dive run)
 *
 * Event: `chat/pipeline.requested`
 * Input: `{ userId, chatSessionId, userMessageId }`
 *
 * Trigger: `POST /api/newsStoryChat` (deep dive) or `startNewChat` with
 * `newsStoryId` → first user message on a story-anchored session.
 * Timeout: 30 minutes.
 *
 * Purpose:
 * Handle the first research turn for a chat session tied to a published
 * `NewsStory` (`isFromNewsStory=true`). Builds a long research brief from the
 * story fields + linked `NewsSource` scraped text via `runNewsNewChatAgent`,
 * then Serp, article selection, Firecrawl, and ChatModel reply. Does not use
 * pgvector session research on this path. Query enhancement is skipped when
 * `isNewsStory` is true on the determiner.
 *
 * General chats use `chat/message.research.requested` (chatPipeline.ts) instead.
 *
 * ── Happy-path steps ────────────────────────────────────────────────────────
 *
 * 1. load-chat-session — Verify session belongs to `userId`.
 * 2. load-user-message — Load triggering user message content.
 * 3. build-research-prompt — Story deep dive: expand story + sources; else raw text.
 * 4. run-determiner — Guardrails + Serp routing (`recentMessages` when not news story).
 * 5. save-guardrail-message — Persist refusal if guardrails block.
 * 6. fetch-and-normalize-serp — Execute determiner Serp calls; merge normalized hits.
 * 7. select-articles — Article synthesizer chooses URLs to scrape.
 * 8. preload-existing-research-sources — Session sources for reply context (parallel).
 * 9. scrape-and-persist-sources — Firecrawl + `ResearchSource` rows + cleaning.
 * 10. generate-assistant-reply — ChatModel with Serp + scraped context.
 * 11. save-assistant-message — Persist agent Markdown.
 * 12. create-completion-notification — Deep-dive or chat completion notification.
 *
 * ── Failure path ────────────────────────────────────────────────────────────
 *
 * save-error-message — Agent error message for the UI when appropriate.
 * onFailure → create-failure-notification (deep dive vs general chat variant by
 * `session.isFromNewsStory`; dedupe by `userMessageId`).
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
import {
  chatResearchFailedNotification,
  deepDiveCompletedNotification,
  deepDiveFailedNotification,
  tryCreatePipelineNotification,
} from "@/services/notifications/pipelineNotifications";
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
    onFailure: async ({ event, error, step }) => {
      const input = chatPipelineEventDataSchema.safeParse(event.data);
      if (!input.success) {
        pipelineLog("create-failure-notification", "skipped invalid event data");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      pipelineLog("create-failure-notification", "start", { error: message });
      await step.run("create-failure-notification", async () => {
        const session = await getChatSessionByIdForUser(
          input.data.chatSessionId,
          input.data.userId,
        );
        const payload =
          session?.isFromNewsStory === true
            ? deepDiveFailedNotification({
                userId: input.data.userId,
                chatSessionId: input.data.chatSessionId,
                userMessageId: input.data.userMessageId,
              })
            : chatResearchFailedNotification({
                userId: input.data.userId,
                chatSessionId: input.data.chatSessionId,
                chatMessageId: input.data.userMessageId,
              });
        await tryCreatePipelineNotification(payload, {
          userMessageId: input.data.userMessageId,
        });
      });
    },
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

      if (session.isFromNewsStory === true) {
        await step.run("create-completion-notification", async () => {
          await tryCreatePipelineNotification(
            deepDiveCompletedNotification({
              userId: input.userId,
              chatSessionId: input.chatSessionId,
              userMessageId: input.userMessageId,
            }),
            { userMessageId: input.userMessageId },
          );
        });
      }

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
