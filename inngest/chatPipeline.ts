/**
 * Message chat research pipeline (normal / follow-up chat)
 *
 * Event: chat/message.research.requested
 * Input: { chatSessionId, chatMessageId } — one user message to answer.
 *
 * Purpose: Process a single user turn in an existing chat session — optionally
 * reuse prior session research (pgvector), optionally run fresh Serp + Firecrawl,
 * then write one assistant reply. Used for general chats and follow-ups after
 * the first message (not the news-story “deep dive” first-run event).
 *
 * Steps:
 * 1. check-existing-assistant-reply — Skip work if this user message already has
 *    an assistant reply (Inngest retry idempotency).
 * 2. fetch-chat-context + count-research-embeddings (parallel) — Session/message
 *    validation, recent turns for determiner + final model, embedding inventory.
 * 3. run-determiner — Guardrails, query enhance, decide useExistingResearch,
 *    useTools, and Serp tool calls.
 * 4. save-guardrail-message — If blocked, save a short agent refusal and stop.
 * 5. vector-research-branch + serp-research-branch (parallel) — Vector retrieval +
 *    load rows; Serp execute + normalize.
 * 6. run-article-synthesizer + preload-session-research-sources (parallel).
 * 7. dedupe-research-candidates — Fresh session URL keys before scrape selection.
 * 8. firecrawl-and-save-research — Batch Firecrawl, concurrent ResearchSource inserts.
 * 9. generate-assistant-reply — Chat model Markdown using history + research context.
 * 10. save-assistant-message — Persist agent message (idempotent on retry).
 * 11. save-error-message — On failure, save a failure agent message when appropriate.
 */

import { runArticleSynthesizerAgent } from "@/Agents/chat/ArticleSythesizerAgent";
import {
  runChatModelAgent,
  sliceChatHistoryForModel,
} from "@/Agents/chat/chatModel";
import { GuardrailBlockedError } from "@/Agents/chat/guardrails";
import {
  runSmallDeterminerAgent,
  type SmallDeterminerRunResult,
  type ValidatedSerpToolCall,
} from "@/Agents/chat/smallDeterminerAgent";
import { inngest } from "@/clients/inngestClient";
import {
  findAssistantReplyAfterUserMessage,
  createChatMessage,
  getUserChatMessageForSession,
  listRecentChatMessagesByChatSessionId,
} from "@/repositories/chatMessage";
import { CHAT_PIPELINE_RECENT_MESSAGE_LIMIT } from "@/services/chat/recentChatMessagesForPipeline";
import { getChatSessionById } from "@/repositories/chatSession";
import {
  countChatDescriptionEmbeddings,
  searchSimilarChatDescriptionIds,
} from "@/repositories/pgVectorFunctions";
import {
  createResearchSource,
  listResearchSourcesByChatSessionId,
  listResearchSourcesByIdsForChatSession,
} from "@/repositories/researchSource";
import {
  dedupeSelectedArticlesForSession,
  researchUrlKeysFromSources,
} from "@/services/chat/dedupeResearchArticles";
import { mergeDirectFirecrawlTargets } from "@/services/chat/directUrlResearch";
import {
  fetchSerpPayloadsForCalls,
  normalizeSerpCallResults,
  roleForChatModel,
} from "@/services/chat/chatSerpResearch";
import { scrapeUrlsWithFirecrawl } from "@/services/firecrawl/scrapeUrls";
import type { NormalizedSerpHit } from "@/services/chat/normalizeSerpResults";
import {
  mapResearchSourceForChatModel,
  mergeResearchSourcesForChatModel,
  type ChatModelResearchSourceRow,
} from "@/services/chat/researchContextForChatModel";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import { NonRetriableError } from "inngest";
import { z } from "zod";

export const MESSAGE_CHAT_PIPELINE_EVENT =
  "chat/message.research.requested" as const;

export const messageChatPipelineEventDataSchema = z.object({
  chatSessionId: z.uuid(),
  chatMessageId: z.uuid(),
});

export type MessageChatPipelineEventData = z.infer<
  typeof messageChatPipelineEventDataSchema
>;

const PIPELINE_LOG_PREFIX = "[message-chat-pipeline]";
const VECTOR_RESEARCH_LIMIT = 8;
const VECTOR_MIN_SIMILARITY = 0.72;
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

type SerpCallResultStep = {
  tool: ValidatedSerpToolCall["tool"];
  payload: unknown;
};

function pipelineLog(
  step: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  console.log(`${PIPELINE_LOG_PREFIX} ${step}: ${message}${suffix}`);
}

function isUserRole(role: string): boolean {
  return role.trim().toLowerCase() === "user";
}

function determinerFromStep(
  value: unknown,
): SmallDeterminerRunResult | { blocked: true; reason: string } {
  return value as SmallDeterminerRunResult | { blocked: true; reason: string };
}

export const messageChatPipelineFunction = inngest.createFunction(
  {
    id: "message-chat-research-pipeline",
    name: "Message chat research pipeline",
    triggers: [{ event: MESSAGE_CHAT_PIPELINE_EVENT }],
    idempotency: "event.data.chatMessageId",
    timeouts: { finish: "30m" },
  },
  async ({ event, step }) => {
    const input = messageChatPipelineEventDataSchema.parse(event.data);

    pipelineLog("run", "started", {
      chatSessionId: input.chatSessionId,
      chatMessageId: input.chatMessageId,
    });

    const existingAssistant = await step.run(
      "check-existing-assistant-reply",
      async () => {
        const reply = await findAssistantReplyAfterUserMessage(
          input.chatSessionId,
          input.chatMessageId,
        );
        return reply
          ? toJsonSafeStepOutput({
              id: reply.id,
              role: reply.role,
              content: reply.content,
              createdAt: reply.createdAt.toISOString(),
            })
          : null;
      },
    );

    if (existingAssistant) {
      pipelineLog("run", "skipped", { reason: "assistant already exists" });
      return existingAssistant;
    }

    try {
      const pipelineStartedAt = Date.now();

      const [chatContext, researchInventory] = await Promise.all([
        step.run("fetch-chat-context", async () => {
          const elapsed = createStepTimer();
          pipelineLog("fetch-chat-context", "start");
          const session = await getChatSessionById(input.chatSessionId);
          if (!session) {
            throw new NonRetriableError("Chat session not found");
          }

          const message = await getUserChatMessageForSession(
            input.chatSessionId,
            input.chatMessageId,
          );
          if (!message) {
            throw new NonRetriableError(
              "Chat message not found for the supplied session",
            );
          }
          if (!isUserRole(message.role)) {
            throw new NonRetriableError("Chat message is not a user message");
          }

          const historyRows = await listRecentChatMessagesByChatSessionId(
            input.chatSessionId,
            CHAT_PIPELINE_RECENT_MESSAGE_LIMIT + 1,
          );
          const historyWithoutCurrent = historyRows.filter(
            (row) => row.id !== message.id,
          );
          const recentMessages = historyWithoutCurrent
            .slice(-CHAT_PIPELINE_RECENT_MESSAGE_LIMIT)
            .map((row) => ({
              role: row.role,
              content: row.content,
            }));
          const chatHistoryForModel = sliceChatHistoryForModel(
            historyWithoutCurrent.map((row) => ({
              role: roleForChatModel(row.role),
              content: row.content,
            })),
          );

          pipelineLog("fetch-chat-context", "done", {
            durationMs: elapsed(),
            recentMessageCount: recentMessages.length,
          });
          return toJsonSafeStepOutput({
            session: {
              id: session.id,
              isFromNewsStory: session.isFromNewsStory,
            },
            userMessage: {
              id: message.id,
              content: message.content,
              role: message.role,
            },
            recentMessages,
            chatHistoryForModel,
          });
        }),
        step.run("count-research-embeddings", async () => {
          const elapsed = createStepTimer();
          const researchSourceCount = await countChatDescriptionEmbeddings({
            chatSessionId: input.chatSessionId,
          });
          pipelineLog("count-research-embeddings", "done", {
            durationMs: elapsed(),
            researchSourceCount,
          });
          return toJsonSafeStepOutput({ researchSourceCount });
        }),
      ]);

      const determinerResult = await step.run("run-determiner", async () => {
        const elapsed = createStepTimer();
        pipelineLog("run-determiner", "start", {
          researchSourceCount: researchInventory.researchSourceCount,
        });
        try {
          const outcome = await runSmallDeterminerAgent({
            userPrompt: chatContext.userMessage.content,
            isNewsStory: chatContext.session.isFromNewsStory === true,
            researchSourceCount: researchInventory.researchSourceCount,
            recentMessages: chatContext.recentMessages,
            abortSignal: AbortSignal.timeout(120_000),
          });
          pipelineLog("run-determiner", "done", {
            durationMs: elapsed(),
            useTools: outcome.determiner.useTools,
            useExistingResearch: outcome.determiner.useExistingResearch,
            firecrawlUrlCount: outcome.determiner.firecrawlUrls.length,
          });
          return toJsonSafeStepOutput(outcome);
        } catch (error) {
          if (error instanceof GuardrailBlockedError) {
            pipelineLog("run-determiner", "blocked", {
              durationMs: elapsed(),
            });
            return toJsonSafeStepOutput({
              blocked: true as const,
              reason: error.message,
            });
          }
          throw error;
        }
      });

      const determinerParsed = determinerFromStep(determinerResult);
      if ("blocked" in determinerParsed && determinerParsed.blocked) {
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

      const determiner = (determinerParsed as SmallDeterminerRunResult)
        .determiner;

      const [vectorResearchBranch, serpResearchBranch] = await Promise.all([
        step.run("vector-research-branch", async () => {
          const elapsed = createStepTimer();
          pipelineLog("vector-research-branch", "start");

          if (researchInventory.researchSourceCount === 0) {
            pipelineLog("vector-research-branch", "skipped", {
              durationMs: elapsed(),
              reason: "no indexed research",
            });
            return toJsonSafeStepOutput([] as ChatModelResearchSourceRow[]);
          }

          if (
            !determiner.useExistingResearch ||
            !determiner.existingResearchQuery
          ) {
            pipelineLog("vector-research-branch", "skipped", {
              durationMs: elapsed(),
            });
            return toJsonSafeStepOutput([] as ChatModelResearchSourceRow[]);
          }

          const matches = await searchSimilarChatDescriptionIds({
            chatSessionId: input.chatSessionId,
            query: determiner.existingResearchQuery,
            limit: VECTOR_RESEARCH_LIMIT,
            minSimilarity: VECTOR_MIN_SIMILARITY,
          });

          const vectorResearchIds = matches.map((row) => row.id);
          if (vectorResearchIds.length === 0) {
            pipelineLog("vector-research-branch", "done", {
              durationMs: elapsed(),
              matchCount: 0,
            });
            return toJsonSafeStepOutput([] as ChatModelResearchSourceRow[]);
          }

          const rows = await listResearchSourcesByIdsForChatSession(
            input.chatSessionId,
            vectorResearchIds,
          );
          const byId = new Map(rows.map((row) => [row.id, row]));
          const ordered = vectorResearchIds
            .map((id) => byId.get(id))
            .filter((row): row is NonNullable<typeof row> => row != null)
            .map(mapResearchSourceForChatModel);

          pipelineLog("vector-research-branch", "done", {
            durationMs: elapsed(),
            matchCount: ordered.length,
          });
          return toJsonSafeStepOutput(ordered);
        }),
        step.run("serp-research-branch", async () => {
          const elapsed = createStepTimer();
          pipelineLog("serp-research-branch", "start");

          if (determiner.useTools !== "yes" || determiner.calls.length === 0) {
            pipelineLog("serp-research-branch", "skipped", {
              durationMs: elapsed(),
            });
            return toJsonSafeStepOutput([] as NormalizedSerpHit[]);
          }

          const results = await fetchSerpPayloadsForCalls(
            determiner.calls as ValidatedSerpToolCall[],
          );
          const serpPayloads: SerpCallResultStep[] = results.map((row) => ({
            tool: row.tool,
            payload: row.payload,
          }));
          const hits =
            serpPayloads.length === 0
              ? []
              : normalizeSerpCallResults(serpPayloads);

          pipelineLog("serp-research-branch", "done", {
            durationMs: elapsed(),
            hitCount: hits.length,
          });
          return toJsonSafeStepOutput(hits);
        }),
      ]);

      const existingResearchRows = vectorResearchBranch;
      const serpHits = serpResearchBranch;

      const [selectedArticles, preloadedSessionSources] = await Promise.all([
        step.run("run-article-synthesizer", async () => {
          const elapsed = createStepTimer();
          if (serpHits.length === 0) {
            pipelineLog("run-article-synthesizer", "skipped", {
              durationMs: elapsed(),
            });
            return toJsonSafeStepOutput([]);
          }
          pipelineLog("run-article-synthesizer", "start", {
            candidates: serpHits.length,
          });
          const selected = await runArticleSynthesizerAgent({
            userPrompt: chatContext.userMessage.content,
            hits: serpHits,
            topPercent: 40,
            maxArticles: 6,
            abortSignal: AbortSignal.timeout(120_000),
          });
          pipelineLog("run-article-synthesizer", "done", {
            durationMs: elapsed(),
            selected: selected.length,
          });
          return toJsonSafeStepOutput(selected);
        }),
        step.run("preload-session-research-sources", async () => {
          const elapsed = createStepTimer();
          const sessionSources = await listResearchSourcesByChatSessionId(
            input.chatSessionId,
          );
          pipelineLog("preload-session-research-sources", "done", {
            durationMs: elapsed(),
            count: sessionSources.length,
          });
          return toJsonSafeStepOutput(sessionSources);
        }),
      ]);

      const articlesToScrape = await step.run(
        "dedupe-research-candidates",
        async () => {
          const elapsed = createStepTimer();
          const sessionSources = await listResearchSourcesByChatSessionId(
            input.chatSessionId,
          );
          const existingKeys = researchUrlKeysFromSources(sessionSources);

          const deduped =
            selectedArticles.length === 0
              ? []
              : dedupeSelectedArticlesForSession(
                  selectedArticles,
                  existingKeys,
                );

          const merged = mergeDirectFirecrawlTargets(
            deduped,
            determiner.firecrawlUrls,
            existingKeys,
          );

          pipelineLog("dedupe-research-candidates", "done", {
            durationMs: elapsed(),
            serpSelected: selectedArticles.length,
            directUrls: determiner.firecrawlUrls.length,
            preloadedCount: preloadedSessionSources.length,
            after: merged.length,
          });
          return toJsonSafeStepOutput(merged);
        },
      );

      const newResearchRows = await step.run(
        "firecrawl-and-save-research",
        async () => {
          const elapsed = createStepTimer();
          if (articlesToScrape.length === 0) {
            return toJsonSafeStepOutput([] as ChatModelResearchSourceRow[]);
          }

          const freshSessionSources = await listResearchSourcesByChatSessionId(
            input.chatSessionId,
          );
          const freshKeys = researchUrlKeysFromSources(freshSessionSources);
          const scrapeTargets = dedupeSelectedArticlesForSession(
            articlesToScrape,
            freshKeys,
          );

          if (scrapeTargets.length === 0) {
            pipelineLog("firecrawl-and-save-research", "skipped", {
              durationMs: elapsed(),
              reason: "all candidates already saved",
            });
            return toJsonSafeStepOutput([] as ChatModelResearchSourceRow[]);
          }

          pipelineLog("firecrawl-and-save-research", "start", {
            count: scrapeTargets.length,
          });

          const scrapedMarkdown = await scrapeUrlsWithFirecrawl(
            scrapeTargets.map((article) => article.url),
          );

          const saved = await mapWithConcurrency(
            scrapeTargets,
            RESEARCH_SOURCE_INSERT_CONCURRENCY,
            async (article, index) => {
              let content = scrapedMarkdown[index]?.trim() ?? "";
              if (!content) {
                content = article.title;
              }

              const row = await createResearchSource({
                chatSessionId: input.chatSessionId,
                url: article.url,
                domain: article.domain,
                title: article.title,
                content: content.slice(0, 50_000),
                sourceType: article.sourceType,
              });

              return mapResearchSourceForChatModel(row);
            },
          );

          pipelineLog("firecrawl-and-save-research", "done", {
            durationMs: elapsed(),
            saved: saved.length,
          });
          return toJsonSafeStepOutput(saved);
        },
      );

      const researchContext = mergeResearchSourcesForChatModel(
        existingResearchRows,
        newResearchRows,
      );

      const assistantMarkdown = await step.run(
        "generate-assistant-reply",
        async () => {
          const elapsed = createStepTimer();
          pipelineLog("generate-assistant-reply", "start");
          const chatHistory = chatContext.chatHistoryForModel;

          const markdown = await runChatModelAgent({
            prompt: chatContext.userMessage.content,
            serpData: {
              researchPrompt: chatContext.userMessage.content,
              normalizedHits: serpHits,
              scrapedResearchSources: researchContext,
            },
            chatHistory,
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
          const again = await findAssistantReplyAfterUserMessage(
            input.chatSessionId,
            input.chatMessageId,
          );
          if (again) {
            pipelineLog("save-assistant-message", "skipped", { id: again.id });
            return toJsonSafeStepOutput({
              id: again.id,
              role: again.role,
              content: again.content,
              createdAt: again.createdAt.toISOString(),
            });
          }

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

      if (!(error instanceof NonRetriableError)) {
        await step.run("save-error-message", async () => {
          const again = await findAssistantReplyAfterUserMessage(
            input.chatSessionId,
            input.chatMessageId,
          );
          if (again) {
            return toJsonSafeStepOutput({ id: again.id });
          }
          const saved = await createChatMessage({
            chatSessionId: input.chatSessionId,
            role: "agent",
            content: `Research pipeline failed: ${message}`,
          });
          return toJsonSafeStepOutput({ id: saved.id });
        });
      }

      throw error;
    }
  },
);
