/**
 * Chat story pipeline — complete one chat-origin NewsStory
 *
 * Event: `chat/story.research.requested`
 *
 * Event data (`chatStoryPipelineEventDataSchema` in
 * `services/chat/chatStoryPipelineTypes.ts`):
 * - `storyId`, `chatSessionId`, `userId`, `chatMessageId`
 * - `enhancedPrompt` — query-enhanced research prompt from message chat pipeline
 * - `recentMessages`, `chatHistory` — conversational context (intent only)
 * - `determiner` — snapshot (Serp/vector/YouTube flags, firecrawl URLs, story reason)
 * - `existingResearch` — scraped session sources prepared for ChatModel
 * - `serpHits`, `youtubeEvidence`, optional `selectedArticles`
 *
 * Trigger: `messageChatPipelineFunction` via `step.sendEvent("trigger-chat-story-pipeline")`
 * after `create-chat-story-shell`. Does **not** re-run guardrails or query enhancer.
 *
 * Function id: `chat-story-pipeline`
 * Idempotency: `event.data.storyId`
 * Timeout: 45 minutes
 *
 * Purpose:
 * Finish a **single** user-created story (`NewsStory` already PENDING). Reuses evidence
 * gathered upstream; optionally adds minimal Serp/Firecrawl when
 * `runChatStoryResearchGapAgent` finds gaps. Synthesizes with `runNewsSynthesizerAgent`
 * (`targetStoryCount=1`, `fixedStoryId=storyId`), writes `NewsSource` children, sets
 * the same row to `status=READY` (user may publish later). Chat history is not treated
 * as factual evidence in synthesis.
 *
 * System briefing stories (`news/pipeline.requested`) are a separate pipeline.
 *
 * ── Happy-path steps ────────────────────────────────────────────────────────
 *
 * 1. validate-story
 *    Owner-scoped load via `getChatNewsStoryForPipeline`. No-op success if already
 *    READY / PUBLISHED / ARCHIVED. `NonRetriableError` if missing or invalid state.
 *
 * 2. story-research-gap
 *    `runChatStoryResearchGapAgent` on prepared counts (research rows, Serp hits,
 *    YouTube, selected articles) → optional extra Serp / Firecrawl / YouTube plan.
 *
 * 3. optional-additional-serp
 *    Runs only when gap agent sets `needsAdditionalSerp`; uses chat Serp normalizer
 *    and determiner-compatible tool calls.
 *
 * 4. optional-firecrawl
 *    Scrape gap `firecrawlUrls`; `runNewsContentCleanerAgent`; merge articles by
 *    canonical URL with prepared + Serp-derived material.
 *
 * 5. synthesize-story
 *    `runNewsSynthesizerAgent` with merged article bundle; requires at least one
 *    primary article-backed source (`storyHasPrimaryArticleSource`).
 *
 * 6. persist-story-and-sources
 *    Create `NewsSource` rows; `applyChatStorySynthesis` updates title/summary/
 *    content/image on the existing `NewsStory`; link `chatSessionId` origin.
 *
 * 7. create-completion-notification
 *    Idempotent `CHAT_STORY_COMPLETED` → `/newsStory/[storyId]`.
 *
 * ── Failure path ────────────────────────────────────────────────────────────
 *
 * onFailure:
 * - mark-story-failed — PENDING → failed state with error message on the story row
 * - create-failure-notification — `CHAT_STORY_FAILED` / research failed variant
 *
 * Notification persistence errors are swallowed where wrapped in `tryCreatePipelineNotification`.
 */

import { runNewsContentCleanerAgent } from "@/Agents/news/NewsContentCleanerAgent";
import {
  runNewsSynthesizerAgent,
  storyHasPrimaryArticleSource,
} from "@/Agents/news/NewsSythesizeragent";
import { runChatStoryResearchGapAgent } from "@/Agents/chat/chatStoryResearchGapAgent";
import type { ValidatedSerpToolCall } from "@/Agents/chat/smallDeterminerAgent";
import { createPipelineLogger } from "@/clients/pipelineLogger";
import { inngest } from "@/clients/inngestClient";
import {
  appendNewsStoryLoadingLog,
  applyChatStorySynthesis,
  getChatNewsStoryForPipeline,
  markChatNewsStoryFailed,
} from "@/repositories/newsStory";
import {
  isUserStoryGenerationFailed,
  isUserStoryGenerating,
} from "@/services/news/newsStoryAccess";
import { createNewsSource } from "@/repositories/newsSource";
import { fetchAndNormalizeChatSerpResearch } from "@/services/chat/chatSerpWithAiOverview";
import { mergePreparedResearchArticles } from "@/services/chat/chatStoryResearchArticles";
import {
  chatStoryPipelineEventDataSchema,
  type ChatStoryPipelineEventData,
} from "@/services/chat/chatStoryPipelineTypes";
import { scrapeUrlsWithFirecrawl } from "@/services/firecrawl/scrapeUrls";
import {
  chatStoryCompletedNotification,
  chatStoryFailedNotification,
  tryCreatePipelineNotification,
} from "@/services/notifications/pipelineNotifications";
import { resolveNewsStoryImageUrl } from "@/services/news/articleImageUrl";
import { canonicalResearchUrl } from "@/services/chat/normalizeSerpResults";
import { todayIsoDateUtc } from "@/services/chat/researchPrompt";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import { updateChatStoryRequestAssistantMessage } from "@/repositories/chatMessage";
import {
  buildChatStoryRequestFailedMessage,
  buildChatStoryRequestReadyMessage,
} from "@/services/chat/chatStoryRequestMessage";
import { NonRetriableError } from "inngest";

export const CHAT_STORY_PIPELINE_EVENT = "chat/story.research.requested" as const;

export {
  chatStoryPipelineEventDataSchema,
  type ChatStoryPipelineEventData,
} from "@/services/chat/chatStoryPipelineTypes";

const PIPELINE_LOG_PREFIX = "[chat-story-pipeline]";
const pipelineLog = createPipelineLogger(PIPELINE_LOG_PREFIX);

export const chatStoryPipelineFunction = inngest.createFunction(
  {
    id: "chat-story-pipeline",
    name: "Chat story pipeline",
    triggers: [{ event: CHAT_STORY_PIPELINE_EVENT }],
    idempotency: "event.data.storyId",
    timeouts: { finish: "45m" },
    onFailure: async ({ event, error, step }) => {
      const parsed = chatStoryPipelineEventDataSchema.safeParse(event.data);
      if (!parsed.success) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      pipelineLog("onFailure", message, { storyId: parsed.data.storyId });
      await step.run("mark-story-failed", async () => {
        await markChatNewsStoryFailed(parsed.data.storyId, message);
      });
      await step.run("create-failure-notification", async () => {
        await tryCreatePipelineNotification(
          chatStoryFailedNotification({
            userId: parsed.data.userId,
            storyId: parsed.data.storyId,
          }),
          { storyId: parsed.data.storyId },
        );
      });
      await step.run("update-story-request-message-failed", async () => {
        await updateChatStoryRequestAssistantMessage({
          chatSessionId: parsed.data.chatSessionId,
          userMessageId: parsed.data.chatMessageId,
          newsStoryId: parsed.data.storyId,
          content: buildChatStoryRequestFailedMessage(parsed.data.storyId),
          loadingLog: "Story generation failed.",
        });
      });
    },
  },
  async ({ event, step }) => {
    const input = chatStoryPipelineEventDataSchema.parse(event.data);
    pipelineLog("run", "started", { storyId: input.storyId });

    const story = await step.run("validate-story", async () => {
      const row = await getChatNewsStoryForPipeline({
        storyId: input.storyId,
        userId: input.userId,
        chatSessionId: input.chatSessionId,
      });
      if (!row) {
        throw new NonRetriableError("Chat story not found for pipeline");
      }
      if (isUserStoryGenerationFailed(row)) {
        throw new NonRetriableError("Story generation failed; retry not configured");
      }
      if (!isUserStoryGenerating(row)) {
        pipelineLog("validate-story", "already complete", {
          publishStatus: row.publishStatus,
        });
        return toJsonSafeStepOutput({
          skip: true as const,
          publishStatus: row.publishStatus,
        });
      }
      await appendNewsStoryLoadingLog(input.storyId, "Story pipeline started.");
      return toJsonSafeStepOutput({ skip: false as const, publishStatus: row.publishStatus });
    });

    if (story.skip) {
      await step.run("update-story-request-message-already-ready", async () => {
        const row = await getChatNewsStoryForPipeline({
          storyId: input.storyId,
          userId: input.userId,
          chatSessionId: input.chatSessionId,
        });
        if (!row || isUserStoryGenerationFailed(row)) {
          return;
        }
        await updateChatStoryRequestAssistantMessage({
          chatSessionId: input.chatSessionId,
          userMessageId: input.chatMessageId,
          newsStoryId: input.storyId,
          content: buildChatStoryRequestReadyMessage({
            storyId: input.storyId,
            title: row.title,
          }),
          loadingLog: "Story ready for review.",
        });
      });
      return toJsonSafeStepOutput({
        storyId: input.storyId,
        publishStatus: story.publishStatus,
      });
    }

    const gap = await step.run("story-research-gap", async () => {
      const result = await runChatStoryResearchGapAgent({
        enhancedPrompt: input.enhancedPrompt,
        existingResearchCount: input.existingResearch.length,
        serpHitCount: input.serpHits.length,
        youtubeEvidenceCount: input.youtubeEvidence.length,
        selectedArticleCount: input.selectedArticles?.length ?? 0,
        abortSignal: AbortSignal.timeout(120_000),
      });
      return toJsonSafeStepOutput(result);
    });

    await step.run("append-story-log-gap", async () => {
      await appendNewsStoryLoadingLog(
        input.storyId,
        "Research gap analysis complete.",
      );
    });

    const extraSerpHits = await step.run("optional-additional-serp", async () => {
      if (!gap.needsAdditionalSerp || gap.serpCalls.length === 0) {
        return toJsonSafeStepOutput([]);
      }
      const hits = await fetchAndNormalizeChatSerpResearch({
        calls: gap.serpCalls as ValidatedSerpToolCall[],
        researchPrompt: input.enhancedPrompt,
        useAiOverviewFollowUp: gap.useAiOverviewFollowUp,
        abortSignal: AbortSignal.timeout(120_000),
      });
      return toJsonSafeStepOutput(hits);
    });

    const scrapedArticles = await step.run("optional-firecrawl", async () => {
      const urls = [...new Set(gap.firecrawlUrls)].filter(Boolean);
      if (urls.length === 0) {
        return toJsonSafeStepOutput([]);
      }
      const markdown = await scrapeUrlsWithFirecrawl(urls);
      const cleanerDate = todayIsoDateUtc();
      const rows = await Promise.all(
        urls.map(async (url, index) => {
          const raw = markdown[index]?.trim() ?? "";
          if (!raw) {
            return null;
          }
          const cleaned = await runNewsContentCleanerAgent({
            location: null,
            date: cleanerDate,
            content: raw,
            abortSignal: AbortSignal.timeout(180_000),
          });
          if (!cleaned.isValidArticle || !cleaned.cleanedContent.trim()) {
            return null;
          }
          let domain = url;
          try {
            domain = new URL(url).hostname;
          } catch {
            /* keep url */
          }
          return {
            url,
            domain,
            title: url,
            scrapedContent: cleaned.cleanedContent.trim(),
            sourceType: "web",
            isPrimaryStorySource: true,
          };
        }),
      );
      return toJsonSafeStepOutput(rows.filter((row) => row != null));
    });

    const synthesized = await step.run("synthesize-story", async () => {
      const articles = mergePreparedResearchArticles({
        existingResearch: input.existingResearch,
        serpHits: [...input.serpHits, ...extraSerpHits],
        youtubeEvidence: input.youtubeEvidence,
      });

      for (const scraped of scrapedArticles) {
        const key = canonicalResearchUrl(scraped.url);
        if (!key) {
          continue;
        }
        const existing = articles.find(
          (row) => canonicalResearchUrl(row.url) === key,
        );
        if (existing) {
          existing.scrapedContent = scraped.scrapedContent;
          existing.isPrimaryStorySource = true;
        } else {
          articles.push(scraped);
        }
      }

      if (articles.length === 0) {
        throw new Error("No research articles available for story synthesis");
      }

      const stories = await runNewsSynthesizerAgent({
        newsRequestId: input.storyId,
        fixedStoryId: input.storyId,
        articles,
        userPrompt: `${input.enhancedPrompt}\n\nProduce exactly one evidence-backed news story from the prepared research. Use conversation context only for intent, not as factual evidence.`,
        targetStoryCount: 1,
        abortSignal: AbortSignal.timeout(300_000),
      });

      const story = stories.find((row) => row.id === input.storyId) ?? stories[0];
      if (!story || !storyHasPrimaryArticleSource(story)) {
        throw new Error("Synthesizer did not produce a valid primary-source story");
      }
      return toJsonSafeStepOutput(story);
    });

    await step.run("append-story-log-synthesized", async () => {
      await appendNewsStoryLoadingLog(input.storyId, "Story draft synthesized.");
    });

    await step.run("persist-story-and-sources", async () => {
      const imageByUrl = new Map<string, string | null>();
      for (const source of synthesized.sources) {
        const key = canonicalResearchUrl(source.url);
        if (key) {
          imageByUrl.set(key, null);
        }
      }

      const newsSourceIds: string[] = [];
      for (const source of synthesized.sources) {
        const saved = await createNewsSource({
          newsStoryId: input.storyId,
          url: source.url,
          domain: source.domain,
          title: source.title,
          scrapedContent: source.scrapedContent,
          publishedAt: source.publishedAt,
          sourceType: source.sourceType,
          transcript: source.transcript,
        });
        newsSourceIds.push(saved.id);
      }

      const imageUrl = resolveNewsStoryImageUrl({
        sources: synthesized.sources,
        imageByUrl,
      });

      await applyChatStorySynthesis({
        storyId: input.storyId,
        title: synthesized.title,
        description: synthesized.description,
        slug: synthesized.slug,
        summary: synthesized.summary,
        content: synthesized.content,
        category: synthesized.category,
        location: synthesized.location,
        imageUrl,
        importanceScore: synthesized.importanceScore,
        newsSourceIds,
        publishedAt: synthesized.publishedAt
          ? new Date(synthesized.publishedAt)
          : null,
      });
      await appendNewsStoryLoadingLog(
        input.storyId,
        "Story saved — ready for review.",
      );
    });

    await step.run("create-completion-notification", async () => {
      await tryCreatePipelineNotification(
        chatStoryCompletedNotification({
          userId: input.userId,
          storyId: input.storyId,
        }),
        { storyId: input.storyId },
      );
    });

    await step.run("update-story-request-message-ready", async () => {
      await updateChatStoryRequestAssistantMessage({
        chatSessionId: input.chatSessionId,
        userMessageId: input.chatMessageId,
        newsStoryId: input.storyId,
        content: buildChatStoryRequestReadyMessage({
          storyId: input.storyId,
          title: synthesized.title,
        }),
        loadingLog: "Story ready for review.",
      });
    });

    pipelineLog("run", "finished", { storyId: input.storyId });
    return toJsonSafeStepOutput({ storyId: input.storyId, publishStatus: "draft" });
  },
);
