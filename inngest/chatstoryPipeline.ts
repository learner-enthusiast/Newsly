/**
 * Chat story pipeline — complete one chat-origin NewsStory
 *
 * Event: `chat/story.research.requested`
 * Input: `ChatStoryPipelineEventData` (see `services/chat/chatStoryPipelineTypes.ts`)
 *   - `storyId`, `chatSessionId`, `userId`, `chatMessageId`
 *   - `enhancedPrompt`, `recentMessages`, `chatHistory`
 *   - `determiner` snapshot from message chat pipeline
 *   - `existingResearch`, `serpHits`, `youtubeEvidence`, optional `selectedArticles`
 *
 * Trigger: `messageChatPipelineFunction` after `createPendingChatNewsStory` +
 * prepared research payload (does not re-run guardrails or query enhancer).
 *
 * Idempotency: `event.data.storyId`
 * Timeout: 45 minutes.
 *
 * Purpose:
 * Targeted single-story worker. Reuses evidence gathered by the message chat
 * pipeline; runs a story research gap agent to decide optional extra Serp /
 * Firecrawl / AI Overview work only when needed. Synthesizes exactly one story
 * (`runNewsSynthesizerAgent`, `targetStoryCount=1`, `fixedStoryId=storyId`),
 * persists `NewsSource` rows, updates the same `NewsStory` to `status=READY`
 * (not PUBLISHED). Chat history informs intent only — not cited as evidence.
 *
 * ── Steps ───────────────────────────────────────────────────────────────────
 *
 * 1. validate-story
 *    Load owner-scoped row; skip safely if already READY/PUBLISHED/ARCHIVED;
 *    non-retriable if missing or FAILED without retry policy.
 *
 * 2. story-research-gap
 *    `runChatStoryResearchGapAgent` — additional Serp / YouTube / Firecrawl needs.
 *
 * 3. optional-additional-serp
 *    Extra Serp only when gap agent requests it (`fetchAndNormalizeChatSerpResearch`).
 *
 * 4. optional-firecrawl
 *    Scrape gap URLs, clean content, merge into synthesizer article list (dedupe by URL).
 *
 * 5. synthesize-story
 *    Merge prepared + new articles → news synthesizer; require primary article source.
 *
 * 6. persist-story-and-sources
 *    `createNewsSource` per synthesized source; `applyChatStorySynthesis` on existing row.
 *
 * 7. create-completion-notification
 *    Idempotent notification linking to `/newsStory/[storyId]`.
 *
 * ── Failure path ────────────────────────────────────────────────────────────
 *
 * onFailure → mark-story-failed (PENDING only) + create-failure-notification.
 * Notification failures do not fail the function.
 */

import { runNewsContentCleanerAgent } from "@/Agents/news/NewsContentCleanerAgent";
import {
  runNewsSynthesizerAgent,
  storyHasPrimaryArticleSource,
} from "@/Agents/news/NewsSythesizeragent";
import { runChatStoryResearchGapAgent } from "@/Agents/chat/chatStoryResearchGapAgent";
import type { ValidatedSerpToolCall } from "@/Agents/chat/smallDeterminerAgent";
import { inngest } from "@/clients/inngestClient";
import {
  applyChatStorySynthesis,
  getChatNewsStoryForPipeline,
  markChatNewsStoryFailed,
} from "@/repositories/newsStory";
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
import { NonRetriableError } from "inngest";

export const CHAT_STORY_PIPELINE_EVENT = "chat/story.research.requested" as const;

export {
  chatStoryPipelineEventDataSchema,
  type ChatStoryPipelineEventData,
} from "@/services/chat/chatStoryPipelineTypes";

const PIPELINE_LOG_PREFIX = "[chat-story-pipeline]";

function pipelineLog(
  step: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  console.log(`${PIPELINE_LOG_PREFIX} ${step}: ${message}${suffix}`);
}

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
        await markChatNewsStoryFailed(parsed.data.storyId);
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
      if (row.status === "READY" || row.status === "PUBLISHED" || row.status === "ARCHIVED") {
        pipelineLog("validate-story", "already complete", { status: row.status });
        return toJsonSafeStepOutput({ skip: true as const, status: row.status });
      }
      if (row.status === "FAILED") {
        throw new NonRetriableError("Story is FAILED; retry not configured");
      }
      return toJsonSafeStepOutput({ skip: false as const, status: row.status });
    });

    if (story.skip) {
      return toJsonSafeStepOutput({ storyId: input.storyId, status: story.status });
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

    pipelineLog("run", "finished", { storyId: input.storyId });
    return toJsonSafeStepOutput({ storyId: input.storyId, status: "READY" });
  },
);
