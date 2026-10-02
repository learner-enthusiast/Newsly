/**
 * Message chat research pipeline (general / follow-up chat)
 *
 * Event: `chat/message.research.requested`
 *
 * Event data (`messageChatPipelineEventDataSchema`):
 * - `chatSessionId` — session UUID
 * - `chatMessageId` — triggering user message UUID (idempotency key)
 * - `shouldCreateStory` — optional client flag (e.g. “Create a story about…”
 *   from potential story topics). When true, forces story handoff after research.
 *
 * Trigger: `POST /api/chat/[chatSessionId]` → `sendChatMessage` → Inngest send.
 * Not used for the first news-story deep-dive turn (`chat/pipeline.requested` in
 * `newsNewchatPipeline.ts`).
 *
 * Function id: `message-chat-research-pipeline`
 * Idempotency: `event.data.chatMessageId`
 * Timeout: 30 minutes (`timeouts.finish`)
 *
 * Purpose:
 * Answer one user turn in an existing general research chat. Runs guardrails +
 * query enhancement + small determiner; optionally recalls prior session evidence
 * via pgvector (`chat_resource_embeddings`); runs Serp / YouTube / Firecrawl;
 * persists new `ResearchSource` rows (each enqueues background vector indexing).
 * Returns either a ChatModel Markdown reply or hands off to the chat story
 * pipeline when `shouldCreateStory` is set.
 *
 * Side effects (background, non-blocking):
 * - `chat/potential-story-topics.requested` — after a normal assistant reply
 *   only (see step 14). Does not run on guardrail block or story handoff early return.
 * - `chat/story.research.requested` — when creating a user story from chat.
 *
 * ── Idempotent short-circuit ────────────────────────────────────────────────
 *
 * check-existing-assistant-reply
 *   If an agent message already follows this user message, skip the run,
 *   emit completion notification, return existing assistant row.
 *
 * ── Happy path (research + reply) ───────────────────────────────────────────
 *
 * 1. fetch-chat-context + count-research-embeddings (parallel)
 *    Session metadata, user message validation, last ~10 prior turns (excluding
 *    current), chat history slice for ChatModel, `isFirstUserMessage` flag.
 *
 * 2. auto-rename-user-chat (conditional)
 *    First message in a non–news-story session → `runChatSessionTitleAgent` →
 *    patch `ChatSession.title`.
 *
 * 3. run-determiner
 *    `runSmallDeterminerAgent`: guardrails, query enhancer, Serp tool plan,
 *    vector recall query, YouTube / AI-overview flags. Guardrail block returns
 *    `{ blocked: true }` without throwing.
 *
 * 4. save-guardrail-message (guardrail branch only)
 *    Persist refusal agent message; stop (no topic enqueue, no story handoff).
 *
 * 5. resolve-story-intent
 *    `resolveShouldCreateStoryFromEvent(input.shouldCreateStory)`. When true,
 *    `augmentDeterminerForStoryHandoff` widens research for story synthesis.
 *
 * 6. vector-research-branch + serp-research-branch + youtube-research-branch
 *    (parallel) — pgvector similarity on `ResearchSource` ids, Serp execution
 *    via `fetchAndNormalizeChatSerpResearch`, YouTube evidence via
 *    `fetchChatYoutubeEvidence`. Branches no-op when determiner skips them.
 *
 * 7. run-article-synthesizer + preload-session-research-sources (parallel)
 *    Select URLs to scrape; load all session sources for reply context.
 *
 * 8. dedupe-research-candidates
 *    Merge synthesizer picks + determiner `firecrawlUrls`; drop URLs already in
 *    session (canonical URL keys).
 *
 * 9. firecrawl-and-save-research
 *    Firecrawl + `runNewsContentCleanerAgent`; insert `ResearchSource` rows;
 *    save YouTube transcript rows; bounded concurrency on inserts.
 *
 * ── Story handoff branch (`shouldCreateStory === true`) ─────────────────────
 *
 * 10a. create-chat-story-shell — skipped when `storyId` was pre-created on send;
 *      otherwise `createPendingChatNewsStory` (draft row).
 * 10b. trigger-chat-story-pipeline — `step.sendEvent` → `chat/story.research.requested`
 *      with prepared research payload (no guardrails rerun in story worker).
 * 10c. save-story-status-message — short agent status; return (skips ChatModel reply
 *      and potential-story-topics enqueue).
 *
 * ── Normal reply branch ─────────────────────────────────────────────────────
 *
 * 11. generate-assistant-reply — `runChatModelAgent` with Serp hits + research context.
 * 12. save-assistant-message — persist agent Markdown (`role=agent`).
 * 13. create-completion-notification — idempotent `CHAT_RESEARCH_COMPLETED`.
 * 14. enqueue-potential-story-topics — `step.sendEvent` →
 *     `chat/potential-story-topics.requested` with recent messages + current user
 *     turn (`buildRecentMessagesForPotentialStoryTopicAgent`). Awaits event send
 *     only, not the topic agent run.
 *
 * ── Failure path ────────────────────────────────────────────────────────────
 *
 * save-error-message — For retriable errors: agent bubble with failure text if none
 * exists yet. `NonRetriableError` skips this (e.g. missing session/message).
 *
 * onFailure → create-failure-notification — `CHAT_RESEARCH_FAILED` for session owner.
 */

import { runNewsContentCleanerAgent } from "@/Agents/news/NewsContentCleanerAgent";
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
import { createPipelineLogger } from "@/clients/pipelineLogger";
import { inngest } from "@/clients/inngestClient";
import {
  appendChatMessageLoadingLog,
  findAssistantReplyAfterUserMessage,
  createChatMessage,
  getUserChatMessageForSession,
  listRecentChatMessagesByChatSessionId,
  patchChatMessage,
} from "@/repositories/chatMessage";
import { appendNewsStoryLoadingLog } from "@/repositories/newsStory";
import { CHAT_PIPELINE_RECENT_MESSAGE_LIMIT } from "@/services/chat/recentChatMessagesForPipeline";
import { getChatSessionById } from "@/repositories/chatSession";
import { autoRenameUserChatFromFirstMessage } from "@/services/chat/chatSessionCrud";
import { shouldAutoRenameUserChatTitle } from "@/services/chat/chatSessionTitle";
import {
  countChatResourceEmbeddings,
  searchSimilarChatResourceIds,
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
import { roleForChatModel } from "@/services/chat/chatSerpResearch";
import { fetchAndNormalizeChatSerpResearch } from "@/services/chat/chatSerpWithAiOverview";
import {
  fetchChatYoutubeEvidence,
  type ChatYoutubeEvidenceRow,
} from "@/services/chat/chatYoutubeEvidence";
import { buildRecentMessagesForPotentialStoryTopicAgent } from "@/services/chat/potentialStoryTopicsForPipeline";
import {
  augmentDeterminerForStoryHandoff,
  resolveShouldCreateStoryFromEvent,
} from "@/services/chat/messageStoryCreation";
import { todayIsoDateUtc } from "@/services/chat/researchPrompt";
import { enrichSelectedArticlesWithSerpImages } from "@/services/chat/enrichSelectedArticlesWithSerpImages";
import { resolveArticleImageUrl } from "@/services/news/articleImageUrl";
import { scrapeUrlsWithFirecrawlRaw } from "@/services/firecrawl/scrapeUrls";
import {
  canonicalResearchUrl,
  type NormalizedSerpHit,
} from "@/services/chat/normalizeSerpResults";
import {
  mapResearchSourceForChatModel,
  mergeResearchSourcesForChatModel,
  type ChatModelResearchSourceRow,
} from "@/services/chat/researchContextForChatModel";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import { CHAT_POTENTIAL_STORY_TOPICS_EVENT } from "@/inngest/chatPotentialStoryTopicsPipeline";
import { CHAT_STORY_PIPELINE_EVENT } from "@/inngest/chatstoryPipeline";
import { createPendingChatNewsStory } from "@/repositories/newsStory";
import {
  chatResearchCompletedNotification,
  chatResearchFailedNotification,
  tryCreatePipelineNotification,
} from "@/services/notifications/pipelineNotifications";
import {
  CHAT_ASSISTANT_PROGRESS_PLACEHOLDER,
  isChatAssistantProgressPlaceholder,
} from "@/services/chat/chatAssistantProgress";
import { CHAT_STORY_REQUEST_PENDING_CONTENT } from "@/services/chat/chatStoryRequestMessage";
import { NonRetriableError } from "inngest";
import { z } from "zod";

export const MESSAGE_CHAT_PIPELINE_EVENT =
  "chat/message.research.requested" as const;

export const messageChatPipelineEventDataSchema = z.object({
  chatSessionId: z.uuid(),
  chatMessageId: z.uuid(),
  /** Client intent: start chat→story pipeline (e.g. potential story topic click). */
  shouldCreateStory: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === true || value === "true")
    .default(false),
  /** Pre-created draft story from `sendChatMessage` when `shouldCreateStory` is true. */
  storyId: z.uuid().optional(),
});

export type MessageChatPipelineEventData = z.infer<
  typeof messageChatPipelineEventDataSchema
>;

const PIPELINE_LOG_PREFIX = "[message-chat-pipeline]";
const pipelineLog = createPipelineLogger(PIPELINE_LOG_PREFIX);
const VECTOR_RESEARCH_LIMIT = 8;
const VECTOR_MIN_SIMILARITY = 0.72;
const RESEARCH_SOURCE_INSERT_CONCURRENCY = 4;
const ASSISTANT_PROGRESS_PLACEHOLDER = CHAT_ASSISTANT_PROGRESS_PLACEHOLDER;

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
    onFailure: async ({ event, error, step }) => {
      const input = messageChatPipelineEventDataSchema.safeParse(event.data);
      if (!input.success) {
        pipelineLog(
          "create-failure-notification",
          "skipped invalid event data",
        );
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      pipelineLog("create-failure-notification", "start", { error: message });
      await step.run("create-failure-notification", async () => {
        const session = await getChatSessionById(input.data.chatSessionId);
        if (!session) {
          pipelineLog("create-failure-notification", "skipped missing session");
          return;
        }
        await tryCreatePipelineNotification(
          chatResearchFailedNotification({
            userId: session.userId,
            chatSessionId: input.data.chatSessionId,
            chatMessageId: input.data.chatMessageId,
          }),
          { chatMessageId: input.data.chatMessageId },
        );
      });
    },
  },
  async ({ event, step }) => {
    const input = messageChatPipelineEventDataSchema.parse(event.data);

    pipelineLog("run", "started", {
      chatSessionId: input.chatSessionId,
      chatMessageId: input.chatMessageId,
      shouldCreateStory: input.shouldCreateStory === true,
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

    if (
      existingAssistant &&
      !isChatAssistantProgressPlaceholder(existingAssistant.content)
    ) {
      pipelineLog("run", "skipped", { reason: "assistant already exists" });
      await step.run("create-completion-notification", async () => {
        const session = await getChatSessionById(input.chatSessionId);
        if (!session) {
          return;
        }
        await tryCreatePipelineNotification(
          chatResearchCompletedNotification({
            userId: session.userId,
            chatSessionId: input.chatSessionId,
            chatMessageId: input.chatMessageId,
          }),
          { chatMessageId: input.chatMessageId },
        );
      });
      return existingAssistant;
    }

    try {
      const pipelineStartedAt = Date.now();

      const assistantProgress = await step.run(
        "ensure-assistant-progress-message",
        async () => {
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
            content: ASSISTANT_PROGRESS_PLACEHOLDER,
            loadingLogs: ["Pipeline started."],
          });
          return toJsonSafeStepOutput({ id: saved.id });
        },
      );

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
          const isFirstUserMessage = !historyWithoutCurrent.some((row) =>
            isUserRole(row.role),
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
              userId: session.userId,
              isFromNewsStory: session.isFromNewsStory,
              title: session.title,
            },
            isFirstUserMessage,
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
          const researchSourceCount = await countChatResourceEmbeddings({
            chatSessionId: input.chatSessionId,
          });
          pipelineLog("count-research-embeddings", "done", {
            durationMs: elapsed(),
            researchSourceCount,
          });
          return toJsonSafeStepOutput({ researchSourceCount });
        }),
      ]);

      if (
        !chatContext.session.isFromNewsStory &&
        chatContext.isFirstUserMessage &&
        shouldAutoRenameUserChatTitle(chatContext.session.title)
      ) {
        await step.run("auto-rename-user-chat", async () => {
          const elapsed = createStepTimer();
          pipelineLog("auto-rename-user-chat", "start");
          const title = await autoRenameUserChatFromFirstMessage({
            chatSessionId: chatContext.session.id,
            messageContent: chatContext.userMessage.content,
            abortSignal: AbortSignal.timeout(30_000),
          });
          pipelineLog("auto-rename-user-chat", "done", {
            durationMs: elapsed(),
            title,
          });
          return toJsonSafeStepOutput({ title });
        });
      }

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
            useYoutube: outcome.determiner.evidence.useYoutube,
            useAiOverviewFollowUp:
              outcome.determiner.evidence.useAiOverviewFollowUp,
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
          async () => {
            await appendChatMessageLoadingLog(
              assistantProgress.id,
              "Request blocked by guardrails.",
            );
            return patchChatMessage(assistantProgress.id, {
              content:
                "I can't run that research request because it falls outside stock-market and economic research guardrails.",
            });
          },
        );
        return toJsonSafeStepOutput({ assistantMessageId: blockedMessage.id });
      }

      await step.run("append-assistant-log-determiner", async () => {
        await appendChatMessageLoadingLog(
          assistantProgress.id,
          "Research plan ready.",
        );
      });

      const determinerOutcome = determinerParsed as SmallDeterminerRunResult;
      let determiner = determinerOutcome.determiner;
      const researchPrompt = determinerOutcome.researchPrompt;

      const storyIntent = await step.run("resolve-story-intent", async () => {
        const shouldCreateStory = resolveShouldCreateStoryFromEvent(
          input.shouldCreateStory,
        );
        pipelineLog("resolve-story-intent", "done", {
          shouldCreateStory,
          isFromNewsStory: chatContext.session.isFromNewsStory === true,
        });
        return toJsonSafeStepOutput({ shouldCreateStory });
      });

      const shouldCreateStory = storyIntent.shouldCreateStory === true;
      if (shouldCreateStory) {
        determiner = augmentDeterminerForStoryHandoff(
          determiner,
          researchInventory.researchSourceCount,
          chatContext.userMessage.content,
        );
      }

      const [vectorResearchBranch, serpResearchBranch, youtubeResearchBranch] =
        await Promise.all([
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

            const matches = await searchSimilarChatResourceIds({
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

            if (
              determiner.useTools !== "yes" ||
              determiner.calls.length === 0
            ) {
              pipelineLog("serp-research-branch", "skipped", {
                durationMs: elapsed(),
              });
              return toJsonSafeStepOutput([] as NormalizedSerpHit[]);
            }

            const hits = await fetchAndNormalizeChatSerpResearch({
              calls: determiner.calls as ValidatedSerpToolCall[],
              researchPrompt,
              useAiOverviewFollowUp: determiner.evidence.useAiOverviewFollowUp,
              abortSignal: AbortSignal.timeout(120_000),
            });

            pipelineLog("serp-research-branch", "done", {
              durationMs: elapsed(),
              hitCount: hits.length,
            });
            return toJsonSafeStepOutput(hits);
          }),
          step.run("youtube-research-branch", async () => {
            const elapsed = createStepTimer();
            if (!determiner.evidence.useYoutube) {
              pipelineLog("youtube-research-branch", "skipped", {
                durationMs: elapsed(),
              });
              return toJsonSafeStepOutput([] as ChatYoutubeEvidenceRow[]);
            }

            pipelineLog("youtube-research-branch", "start");
            const rows = await fetchChatYoutubeEvidence({
              researchPrompt,
              abortSignal: AbortSignal.timeout(120_000),
            });
            pipelineLog("youtube-research-branch", "done", {
              durationMs: elapsed(),
              videoCount: rows.length,
            });
            return toJsonSafeStepOutput(rows);
          }),
        ]);

      const existingResearchRows = vectorResearchBranch;
      const serpHits = serpResearchBranch;
      const youtubeEvidence = youtubeResearchBranch;

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
            userPrompt: researchPrompt,
            hits: serpHits,
            recentMessages: chatContext.recentMessages,
            topPercent: 40,
            maxArticles: 6,
            abortSignal: AbortSignal.timeout(120_000),
          });
          const withImages = enrichSelectedArticlesWithSerpImages(
            selected,
            serpHits,
          );
          pipelineLog("run-article-synthesizer", "done", {
            durationMs: elapsed(),
            selected: withImages.length,
          });
          return toJsonSafeStepOutput(withImages);
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
          const freshSessionSources = await listResearchSourcesByChatSessionId(
            input.chatSessionId,
          );
          const freshKeys = researchUrlKeysFromSources(freshSessionSources);

          async function saveYoutubeRows(): Promise<
            ChatModelResearchSourceRow[]
          > {
            const pending = youtubeEvidence.filter((video) => {
              const key = canonicalResearchUrl(video.url);
              return key ? !freshKeys.has(key) : true;
            });
            if (pending.length === 0) {
              return [];
            }
            return mapWithConcurrency(
              pending,
              RESEARCH_SOURCE_INSERT_CONCURRENCY,
              async (video) => {
                const row = await createResearchSource({
                  chatSessionId: input.chatSessionId,
                  url: video.url,
                  domain: video.domain,
                  title: video.title,
                  content: video.content.slice(0, 50_000),
                  sourceType: video.sourceType,
                  imageUrl: video.imageUrl,
                });
                return mapResearchSourceForChatModel(row);
              },
            );
          }

          if (articlesToScrape.length === 0) {
            const savedYoutube = await saveYoutubeRows();
            pipelineLog("firecrawl-and-save-research", "done", {
              durationMs: elapsed(),
              savedArticles: 0,
              savedYoutube: savedYoutube.length,
              reason: "no article scrape targets",
            });
            return toJsonSafeStepOutput(savedYoutube);
          }

          const scrapeTargets = dedupeSelectedArticlesForSession(
            articlesToScrape,
            freshKeys,
          );

          let savedArticles: ChatModelResearchSourceRow[] = [];

          if (scrapeTargets.length === 0) {
            pipelineLog("firecrawl-and-save-research", "skip firecrawl", {
              reason: "all candidates already saved",
            });
          } else {
            pipelineLog("firecrawl-and-save-research", "start", {
              count: scrapeTargets.length,
            });

            const scrapedBundles = await scrapeUrlsWithFirecrawlRaw(
              scrapeTargets.map((article) => article.url),
            );

            const cleanerDate = todayIsoDateUtc();

            const cleanedRows = await Promise.all(
              scrapeTargets.map(async (article, index) => {
                const rawScrape = scrapedBundles[index]?.markdown?.trim() ?? "";
                if (!rawScrape) {
                  pipelineLog(
                    "firecrawl-and-save-research",
                    "skip empty scrape",
                    { url: article.url },
                  );
                  return null;
                }

                try {
                  const cleaned = await runNewsContentCleanerAgent({
                    location: null,
                    date: cleanerDate,
                    content: rawScrape,
                    abortSignal: AbortSignal.timeout(180_000),
                  });
                  if (
                    !cleaned.isValidArticle ||
                    !cleaned.cleanedContent.trim()
                  ) {
                    pipelineLog(
                      "firecrawl-and-save-research",
                      "skip invalid after clean",
                      { url: article.url },
                    );
                    return null;
                  }
                  const imageUrl = resolveArticleImageUrl({
                    firecrawlPayload: scrapedBundles[index]?.raw,
                    serpImageUrl: article.imageUrl ?? null,
                  });
                  return {
                    article,
                    content: cleaned.cleanedContent.trim(),
                    imageUrl,
                  };
                } catch {
                  pipelineLog(
                    "firecrawl-and-save-research",
                    "skip clean failure",
                    { url: article.url },
                  );
                  return null;
                }
              }),
            );

            const validArticles = cleanedRows.filter(
              (row): row is NonNullable<(typeof cleanedRows)[number]> =>
                row != null,
            );

            savedArticles = await mapWithConcurrency(
              validArticles,
              RESEARCH_SOURCE_INSERT_CONCURRENCY,
              async ({ article, content, imageUrl }) => {
                const row = await createResearchSource({
                  chatSessionId: input.chatSessionId,
                  url: article.url,
                  domain: article.domain,
                  title: article.title,
                  content: content.slice(0, 50_000),
                  sourceType: article.sourceType,
                  imageUrl,
                });

                return mapResearchSourceForChatModel(row);
              },
            );
          }

          const savedYoutube = await saveYoutubeRows();
          const saved = [...savedArticles, ...savedYoutube];

          pipelineLog("firecrawl-and-save-research", "done", {
            durationMs: elapsed(),
            savedArticles: savedArticles.length,
            savedYoutube: savedYoutube.length,
          });
          return toJsonSafeStepOutput(saved);
        },
      );

      await step.run("append-assistant-log-sources", async () => {
        await appendChatMessageLoadingLog(
          assistantProgress.id,
          "Sources collected.",
        );
      });

      const researchContext = mergeResearchSourcesForChatModel(
        existingResearchRows,
        newResearchRows,
      );

      if (shouldCreateStory) {
        const storyShell = input.storyId
          ? { storyId: input.storyId }
          : await step.run("create-chat-story-shell", async () => {
              pipelineLog("create-chat-story-shell", "start");
              const story = await createPendingChatNewsStory({
                chatSessionId: input.chatSessionId,
                ownerId: chatContext.session.userId,
              });
              pipelineLog("create-chat-story-shell", "done", {
                storyId: story.id,
              });
              return toJsonSafeStepOutput({ storyId: story.id });
            });

        await step.sendEvent("trigger-chat-story-pipeline", {
          name: CHAT_STORY_PIPELINE_EVENT,
          data: {
            storyId: storyShell.storyId,
            chatSessionId: input.chatSessionId,
            userId: chatContext.session.userId,
            chatMessageId: input.chatMessageId,
            enhancedPrompt: researchPrompt,
            recentMessages: chatContext.recentMessages,
            chatHistory: chatContext.chatHistoryForModel,
            determiner: {
              useTools: determiner.useTools,
              useExistingResearch: determiner.useExistingResearch,
              existingResearchQuery: determiner.existingResearchQuery,
              firecrawlUrls: determiner.firecrawlUrls,
              evidence: determiner.evidence,
              shouldCreateStory: true,
              storyCreationReason:
                "User selected a potential story topic in chat.",
            },
            existingResearch: researchContext,
            serpHits,
            youtubeEvidence,
            selectedArticles,
          },
        });

        await step.run("append-story-log-queued", async () => {
          await appendNewsStoryLoadingLog(
            storyShell.storyId,
            "Evidence gathered; story pipeline queued.",
          );
        });

        const storyHandoff = await step.run(
          "save-story-status-message",
          async () => {
            const again = await findAssistantReplyAfterUserMessage(
              input.chatSessionId,
              input.chatMessageId,
            );
            if (again) {
              await appendChatMessageLoadingLog(
                again.id,
                "Story research queued.",
              );
              const updated = await patchChatMessage(again.id, {
                content: CHAT_STORY_REQUEST_PENDING_CONTENT,
                isAStoryRequest: true,
                newsStoryId: storyShell.storyId,
              });
              return toJsonSafeStepOutput({
                storyId: storyShell.storyId,
                status: "PENDING" as const,
                assistantMessageId: updated.id,
              });
            }

            const message = await createChatMessage({
              chatSessionId: input.chatSessionId,
              role: "agent",
              content: CHAT_STORY_REQUEST_PENDING_CONTENT,
              loadingLogs: ["Story research queued."],
              isAStoryRequest: true,
              newsStoryId: storyShell.storyId,
            });

            return toJsonSafeStepOutput({
              storyId: storyShell.storyId,
              status: "PENDING" as const,
              assistantMessageId: message.id,
            });
          },
        );
        return storyHandoff;
      }

      const assistantMarkdown = await step.run(
        "generate-assistant-reply",
        async () => {
          const elapsed = createStepTimer();
          pipelineLog("generate-assistant-reply", "start");
          const chatHistory = chatContext.chatHistoryForModel;

          const markdown = await runChatModelAgent({
            prompt: chatContext.userMessage.content,
            serpData: {
              researchPrompt,
              normalizedHits: serpHits,
              scrapedResearchSources: researchContext,
              youtubeTranscriptEvidence: youtubeEvidence,
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
            pipelineLog("save-assistant-message", "update existing", {
              id: again.id,
            });
            await appendChatMessageLoadingLog(again.id, "Reply generated.");
            const saved = await patchChatMessage(again.id, {
              content: assistantMarkdown,
            });
            return toJsonSafeStepOutput({
              id: saved.id,
              role: saved.role,
              content: saved.content,
              createdAt: saved.createdAt.toISOString(),
            });
          }

          pipelineLog("save-assistant-message", "start");
          const saved = await createChatMessage({
            chatSessionId: input.chatSessionId,
            role: "agent",
            content: assistantMarkdown,
            loadingLogs: ["Reply generated."],
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

      await step.run("create-completion-notification", async () => {
        await tryCreatePipelineNotification(
          chatResearchCompletedNotification({
            userId: chatContext.session.userId,
            chatSessionId: input.chatSessionId,
            chatMessageId: input.chatMessageId,
          }),
          { chatMessageId: input.chatMessageId },
        );
      });

      pipelineLog("run", "finished", {
        assistantMessageId: assistantMessage.id,
        totalDurationMs: Date.now() - pipelineStartedAt,
      });

      pipelineLog("enqueue-potential-story-topics", "sent", {
        chatSessionId: input.chatSessionId,
        chatMessageId: input.chatMessageId,
      });
      await step.sendEvent("enqueue-potential-story-topics", {
        name: CHAT_POTENTIAL_STORY_TOPICS_EVENT,
        data: {
          chatSessionId: input.chatSessionId,
          chatMessageId: input.chatMessageId,
          messages: buildRecentMessagesForPotentialStoryTopicAgent({
            recentMessages: chatContext.recentMessages,
            userMessage: chatContext.userMessage,
          }),
        },
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
            await appendChatMessageLoadingLog(again.id, "Pipeline failed.");
            const saved = await patchChatMessage(again.id, {
              content: `Research pipeline failed: ${message}`,
            });
            return toJsonSafeStepOutput({ id: saved.id });
          }
          const saved = await createChatMessage({
            chatSessionId: input.chatSessionId,
            role: "agent",
            content: `Research pipeline failed: ${message}`,
            loadingLogs: ["Pipeline failed."],
          });
          return toJsonSafeStepOutput({ id: saved.id });
        });
      }

      throw error;
    }
  },
);
