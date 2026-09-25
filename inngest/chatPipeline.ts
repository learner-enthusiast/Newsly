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
 * 2. fetch-chat-context — Load session, validate user message, last 10 prior turns
 *    for query enhancer / determiner.
 * 3. count-research-embeddings — How many indexed descriptions exist for this chat
 *    (controls whether vector retrieval is allowed).
 * 4. run-determiner — Guardrails, query enhance, decide useExistingResearch,
 *    useTools, and Serp tool calls.
 * 5. save-guardrail-message — If blocked, save a short agent refusal and stop.
 * 6. retrieve-existing-research — Similarity search on session embeddings when
 *    determiner asked for existing research.
 * 7. load-existing-research-sources — Load full ResearchSource rows for matched ids.
 * 8. execute-serp-tools — Run SerpAPI when determiner returned useTools yes.
 * 9. normalize-serp-results — Flatten Serp payloads into normalized hits.
 * 10. run-article-synthesizer — Pick best URLs to scrape from Serp hits.
 * 11. dedupe-research-candidates — Drop URLs already stored on this chat session.
 * 12. firecrawl-and-save-research — Scrape new URLs, save ResearchSource rows
 *     (description/embedding indexed asynchronously elsewhere).
 * 13. generate-assistant-reply — Chat model Markdown using history + research context.
 * 14. save-assistant-message — Persist agent message (idempotent on retry).
 * 15. save-error-message — On failure, save a failure agent message when appropriate.
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
import { loadRecentMessagesForQueryEnhancer } from "@/services/chat/recentChatMessagesForPipeline";
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
      const chatContext = await step.run("fetch-chat-context", async () => {
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

        const recentMessages = await loadRecentMessagesForQueryEnhancer(
          input.chatSessionId,
          message.id,
        );

        pipelineLog("fetch-chat-context", "done", {
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
        });
      });

      const researchInventory = await step.run(
        "count-research-embeddings",
        async () => {
          const researchSourceCount = await countChatDescriptionEmbeddings({
            chatSessionId: input.chatSessionId,
          });
          pipelineLog("count-research-embeddings", "done", {
            researchSourceCount,
          });
          return toJsonSafeStepOutput({ researchSourceCount });
        },
      );

      const determinerResult = await step.run("run-determiner", async () => {
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
            useTools: outcome.determiner.useTools,
            useExistingResearch: outcome.determiner.useExistingResearch,
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

      const vectorResearchIds = await step.run(
        "retrieve-existing-research",
        async () => {
          if (researchInventory.researchSourceCount === 0) {
            pipelineLog("retrieve-existing-research", "skipped", {
              reason: "no indexed research",
            });
            return toJsonSafeStepOutput([] as string[]);
          }

          if (
            !determiner.useExistingResearch ||
            !determiner.existingResearchQuery
          ) {
            pipelineLog("retrieve-existing-research", "skipped");
            return toJsonSafeStepOutput([] as string[]);
          }

          pipelineLog("retrieve-existing-research", "start", {
            query: determiner.existingResearchQuery,
          });

          const matches = await searchSimilarChatDescriptionIds({
            chatSessionId: input.chatSessionId,
            query: determiner.existingResearchQuery,
            limit: VECTOR_RESEARCH_LIMIT,
            minSimilarity: VECTOR_MIN_SIMILARITY,
          });

          pipelineLog("retrieve-existing-research", "done", {
            matchCount: matches.length,
          });
          return toJsonSafeStepOutput(matches.map((row) => row.id));
        },
      );

      const existingResearchRows = await step.run(
        "load-existing-research-sources",
        async () => {
          if (vectorResearchIds.length === 0) {
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
          return toJsonSafeStepOutput(ordered);
        },
      );

      const serpPayloads = await step.run("execute-serp-tools", async () => {
        if (determiner.useTools !== "yes") {
          pipelineLog("execute-serp-tools", "skipped");
          return toJsonSafeStepOutput([] as SerpCallResultStep[]);
        }

        pipelineLog("execute-serp-tools", "start", {
          calls: determiner.calls.length,
        });

        const results = await fetchSerpPayloadsForCalls(
          determiner.calls as ValidatedSerpToolCall[],
        );
        pipelineLog("execute-serp-tools", "done");
        return toJsonSafeStepOutput(
          results.map((row) => ({
            tool: row.tool,
            payload: row.payload,
          })),
        );
      });

      const serpHits = await step.run("normalize-serp-results", async () => {
        if (serpPayloads.length === 0) {
          return toJsonSafeStepOutput([] as NormalizedSerpHit[]);
        }

        pipelineLog("normalize-serp-results", "start");
        const hits = normalizeSerpCallResults(serpPayloads);
        pipelineLog("normalize-serp-results", "done", {
          hitCount: hits.length,
        });
        return toJsonSafeStepOutput(hits);
      });

      const selectedArticles = await step.run(
        "run-article-synthesizer",
        async () => {
          if (serpHits.length === 0) {
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
            selected: selected.length,
          });
          return toJsonSafeStepOutput(selected);
        },
      );

      const articlesToScrape = await step.run(
        "dedupe-research-candidates",
        async () => {
          if (selectedArticles.length === 0) {
            return toJsonSafeStepOutput([]);
          }

          const sessionSources = await listResearchSourcesByChatSessionId(
            input.chatSessionId,
          );
          const existingKeys = researchUrlKeysFromSources(sessionSources);
          const deduped = dedupeSelectedArticlesForSession(
            selectedArticles,
            existingKeys,
          );

          pipelineLog("dedupe-research-candidates", "done", {
            before: selectedArticles.length,
            after: deduped.length,
          });
          return toJsonSafeStepOutput(deduped);
        },
      );

      const newResearchRows = await step.run(
        "firecrawl-and-save-research",
        async () => {
          if (articlesToScrape.length === 0) {
            return toJsonSafeStepOutput([] as ChatModelResearchSourceRow[]);
          }

          pipelineLog("firecrawl-and-save-research", "start", {
            count: articlesToScrape.length,
          });

          const scrapedMarkdown = await scrapeUrlsWithFirecrawl(
            articlesToScrape.map((article) => article.url),
          );
          const saved = [];
          for (let index = 0; index < articlesToScrape.length; index += 1) {
            const article = articlesToScrape[index];
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

            saved.push(mapResearchSourceForChatModel(row));
          }

          pipelineLog("firecrawl-and-save-research", "done", {
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
          pipelineLog("generate-assistant-reply", "start");
          const historyRows = await listRecentChatMessagesByChatSessionId(
            input.chatSessionId,
            10,
          );
          const chatHistory = sliceChatHistoryForModel(
            historyRows
              .filter((row) => row.id !== chatContext.userMessage.id)
              .map((row) => ({
                role: roleForChatModel(row.role),
                content: row.content,
              })),
          );

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
