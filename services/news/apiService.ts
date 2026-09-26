import { inngest } from "@/clients/inngestClient";
import { NEWS_PIPELINE_EVENT } from "@/inngest";
import {
  appendNewsRequestLoadingLog,
  createNewsRequest,
  getNewsRequestByIdForUser,
  patchNewsRequest,
} from "@/repositories/newsRequest";
import { getUserVotesForStories } from "@/repositories/newsStoryVote";
import { listNewsStoriesByNewsRequestId } from "@/repositories/newsStory";
import { attachVoteFieldsToStory } from "@/services/news/storyVoteService";
import {
  type NewsGenerationConfig,
  newsGenerationConfigFromNewsRequest,
  newsGenerationRequestSchema,
  normalizeNewsGenerationRequest,
} from "@/services/news/newsGenerationRequest";
import {
  findUserNewsRequest,
  getNewsRequestsByUserId,
} from "@/repositories/user";
import { z } from "zod";

export const requestNewsBodySchema = newsGenerationRequestSchema;

export type RequestNewsBody = z.infer<typeof requestNewsBodySchema>;
export type NewsGenerationRequest = z.infer<typeof newsGenerationRequestSchema>;

function toRequestDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

type ListedStory = Awaited<
  ReturnType<typeof listNewsStoriesByNewsRequestId>
>[number];

function serializeStoryBase(story: ListedStory) {
  return {
    id: story.id,
    newsRequestId: story.newsRequestId,
    title: story.title,
    description: story.description,
    slug: story.slug,
    summary: story.summary,
    content: story.content,
    category: story.category,
    location: story.location,
    publishedAt: story.publishedAt?.toISOString() ?? null,
    importanceScore:
      story.importanceScore != null ? Number(story.importanceScore) : null,
    upvotes: story.upvotes,
    downvotes: story.downvotes,
    sourceUrls: story.sourceUrls,
    createdAt: story.createdAt.toISOString(),
    updatedAt: story.updatedAt.toISOString(),
  };
}

function serializeStory(
  story: ListedStory,
  userVote: "UP" | "DOWN" | null = null,
) {
  return attachVoteFieldsToStory(serializeStoryBase(story), userVote);
}

function serializeNewsRequest(
  request: NonNullable<Awaited<ReturnType<typeof getNewsRequestByIdForUser>>>,
) {
  const config = newsGenerationConfigFromNewsRequest(request);
  return {
    id: request.id,
    userId: request.userId,
    date: request.date.toISOString().slice(0, 10),
    location: request.location,
    scope: request.scope,
    status: request.status,
    error: request.error,
    searchQuery: request.searchQuery,
    storyCount: config.storyCount,
    categories: config.categories,
    customQuery: config.customQuery,
    language: config.language,
    sources: config.sources,
    loadingLogs: request.loadingLogs,
    createdAt: request.createdAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
  };
}

async function loadStoriesIfReady(
  newsRequestId: string,
  status: string,
  userId: string,
) {
  if (status !== "success") {
    return [];
  }
  const stories = await listNewsStoriesByNewsRequestId(newsRequestId);
  const userVotes = await getUserVotesForStories(
    userId,
    stories.map((story) => story.id),
  );
  return stories.map((story) =>
    serializeStory(story, userVotes.get(story.id) ?? null),
  );
}

async function triggerNewsPipeline(params: {
  userId: string;
  newsRequestId: string;
  config: NewsGenerationConfig;
}) {
  await inngest.send({
    name: NEWS_PIPELINE_EVENT,
    data: {
      userId: params.userId,
      newsRequestId: params.newsRequestId,
      date: params.config.date,
      scope: params.config.scope,
      location: params.config.location,
      categories: params.config.categories,
      customQuery: params.config.customQuery,
      storyCount: params.config.storyCount,
      language: params.config.language,
      sources: params.config.sources,
      serpHl: params.config.serpHl,
    },
  });
}

function newsRequestCreateFields(config: NewsGenerationConfig) {
  return {
    date: toRequestDate(config.date),
    location: config.location,
    scope: config.scope,
    storyCount: config.storyCount,
    categories: config.categories,
    customQuery: config.customQuery,
    language: config.language,
    sources: config.sources,
    searchQuery: { news: "pending", search: "pending" },
    status: "pending" as const,
    loadingLogs: ["Request accepted; pipeline queued."],
  };
}

/** Create or reuse a news request; trigger pipeline when new or retrying failed. */
export async function requestNews(userId: string, body: RequestNewsBody) {
  const config = normalizeNewsGenerationRequest(body);

  const existing = await findUserNewsRequest({
    userId,
    date: toRequestDate(config.date),
    scope: config.scope,
    location: config.location,
  });

  if (existing) {
    if (existing.status === "failed") {
      await patchNewsRequest(existing.id, {
        status: "pending",
        error: null,
        completedAt: null,
        storyCount: config.storyCount,
        categories: config.categories,
        customQuery: config.customQuery,
        language: config.language,
        sources: config.sources,
      });
      await appendNewsRequestLoadingLog(
        existing.id,
        "Retrying failed news pipeline.",
      );
      await triggerNewsPipeline({
        userId,
        newsRequestId: existing.id,
        config,
      });
      const updated = await getNewsRequestByIdForUser(existing.id, userId);
      return {
        newsRequest: serializeNewsRequest(updated ?? existing),
        stories: [],
        created: false as const,
        pipelineTriggered: true as const,
      };
    }

    const stories = await loadStoriesIfReady(existing.id, existing.status, userId);
    return {
      newsRequest: serializeNewsRequest(existing),
      stories,
      created: false as const,
      pipelineTriggered: false as const,
    };
  }

  const newsRequest = await createNewsRequest({
    userId,
    ...newsRequestCreateFields(config),
  });

  await triggerNewsPipeline({
    userId,
    newsRequestId: newsRequest.id,
    config,
  });

  return {
    newsRequest: serializeNewsRequest(newsRequest),
    stories: [] as ReturnType<typeof serializeStory>[],
    created: true as const,
    pipelineTriggered: true as const,
  };
}

const RECENT_NEWS_REQUEST_LIMIT = 20;

/** Recent news requests for the signed-in user (newest first). */
export async function listRecentNewsRequests(userId: string) {
  const rows = await getNewsRequestsByUserId(userId);
  return rows
    .slice(0, RECENT_NEWS_REQUEST_LIMIT)
    .map((row) => serializeNewsRequest(row));
}

/** Poll news request status and stories for the owning user. */
export async function getNewsRequestResult(userId: string, newsRequestId: string) {
  const newsRequest = await getNewsRequestByIdForUser(newsRequestId, userId);
  if (!newsRequest) {
    return null;
  }

  const stories = await loadStoriesIfReady(
    newsRequest.id,
    newsRequest.status,
    userId,
  );

  return {
    newsRequest: serializeNewsRequest(newsRequest),
    stories,
  };
}

/** Re-run pipeline for a failed request owned by the user. */
export async function retryFailedNewsRequest(userId: string, newsRequestId: string) {
  const newsRequest = await getNewsRequestByIdForUser(newsRequestId, userId);
  if (!newsRequest || newsRequest.status !== "failed") {
    return null;
  }

  const config = newsGenerationConfigFromNewsRequest(newsRequest);

  await patchNewsRequest(newsRequest.id, {
    status: "pending",
    error: null,
    completedAt: null,
  });

  await appendNewsRequestLoadingLog(newsRequest.id, "Manual retry started.");

  await triggerNewsPipeline({
    userId,
    newsRequestId: newsRequest.id,
    config,
  });

  const updated = await getNewsRequestByIdForUser(newsRequestId, userId);
  if (!updated) {
    return null;
  }

  return {
    newsRequest: serializeNewsRequest(updated),
    stories: [] as ReturnType<typeof serializeStory>[],
  };
}
