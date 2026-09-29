import { newsSearchQuerySchema } from "@/lib/newsSearchQuerySchema";
import { inngest } from "@/clients/inngestClient";
import { NEWS_PIPELINE_EVENT } from "@/inngest";
import {
  appendNewsRequestLoadingLog,
  createNewsRequest,
  getNewsRequestByIdForUser,
  listNewsRequestsByUserIdPage,
  listRecentNewsRequestsByUserId,
  patchNewsRequest,
} from "@/repositories/newsRequest";
import { getUserVotesForStories } from "@/repositories/newsStoryVote";
import {
  countStoriesByNewsRequestIds,
  getNewsStoryWithSourcesForPage,
  listNewsStoriesByNewsRequestId,
  listPublishedNewsStoriesPaginated,
  listUserCreatedStoriesForOwner,
} from "@/repositories/newsStory";
import { attachVoteFieldsToStory } from "@/services/news/storyVoteService";
import {
  attachSavedFieldToStory,
  getSavedFlagsForStories,
  listSavedNewsStoriesForUser,
} from "@/services/news/savedStoryService";
import {
  isUserStoryGenerationFailed,
  isUserStoryGenerating,
} from "@/services/news/newsStoryAccess";
import {
  type NewsGenerationConfig,
  newsGenerationConfigFromNewsRequest,
  newsGenerationRequestSchema,
  normalizeNewsGenerationRequest,
} from "@/services/news/newsGenerationRequest";
import {
  RECENT_NEWS_REQUEST_LIMIT,
  USER_NEWS_REQUESTS_MAX_LIMIT,
  type PublishStatus,
  type SerializedNewsRequest,
} from "@/services/news/newsRequestTypes";
import {
  findUserNewsRequest,
} from "@/repositories/user";
import { z } from "zod";
import { resolveCoordsFromFirstAutocompleteHit } from "@/services/location/autocompleteServerCache";

export const requestNewsBodySchema = newsGenerationRequestSchema;

export type RequestNewsBody = z.infer<typeof requestNewsBodySchema>;
export type NewsGenerationRequest = z.infer<typeof newsGenerationRequestSchema>;

function toRequestDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

type ListedStory = Awaited<
  ReturnType<typeof listNewsStoriesByNewsRequestId>
>[number];

type PageStoryRow = ListedStory & {
  isUserCreated?: boolean;
  publishStatus?: PublishStatus;
  ownerId?: string | null;
  chatSessionId?: string | null;
  generationError?: string | null;
  slug?: string;
};

function serializeStoryBase(
  story: PageStoryRow,
  viewerUserId: string | null = null,
) {
  const isUserCreated = story.isUserCreated ?? false;
  const publishStatus = story.publishStatus ?? "published";
  const ownerId = story.ownerId ?? null;
  const generationError = story.generationError ?? null;
  const slug = story.slug ?? "";
  const isGenerating =
    isUserCreated &&
    isUserStoryGenerating({
      slug,
      title: story.title,
      generationError,
    });
  const generationFailed =
    isUserCreated && isUserStoryGenerationFailed({ generationError });

  return {
    id: story.id,
    newsRequestId: story.newsRequestId,
    isUserCreated,
    publishStatus,
    ownerId,
    isGenerating,
    generationFailed,
    generationError,
    title: story.title,
    description: story.description,
    slug,
    summary: story.summary,
    content: story.content,
    category: story.category,
    location: story.location,
    publishedAt: story.publishedAt?.toISOString() ?? null,
    importanceScore:
      story.importanceScore != null ? Number(story.importanceScore) : null,
    imageUrl: story.imageUrl ?? null,
    upvotes: story.upvotes,
    downvotes: story.downvotes,
    sourceUrls: story.sourceUrls,
    createdAt: story.createdAt.toISOString(),
    updatedAt: story.updatedAt.toISOString(),
    canEdit:
      isUserCreated &&
      !isGenerating &&
      !generationFailed &&
      viewerUserId != null &&
      ownerId === viewerUserId,
    originChatSessionId: story.chatSessionId ?? null,
  };
}

function serializeStory(
  story: PageStoryRow,
  userVote: "UP" | "DOWN" | null = null,
  userSaved = false,
  viewerUserId: string | null = null,
) {
  return attachSavedFieldToStory(
    attachVoteFieldsToStory(
      serializeStoryBase(story, viewerUserId),
      userVote,
    ),
    userSaved,
  );
}

function readSearchQueries(searchQuery: unknown): SerializedNewsRequest["searchQueries"] {
  const parsed = newsSearchQuerySchema.safeParse(searchQuery);
  if (!parsed.success) {
    return null;
  }
  const extraPairs = (parsed.data.planPairs ?? []).filter(
    (pair) =>
      pair.news !== parsed.data.news || pair.search !== parsed.data.search,
  );
  return {
    news: parsed.data.news,
    search: parsed.data.search,
    extraPairs,
  };
}

function serializeNewsRequest(
  request: NonNullable<Awaited<ReturnType<typeof getNewsRequestByIdForUser>>>,
  createdStoryCount = 0,
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
    createdStoryCount,
    searchQueries: readSearchQueries(request.searchQuery),
    categories: config.categories,
    customQuery: config.customQuery,
    language: config.language,
    sources: config.sources,
    loadingLogs: request.loadingLogs,
    createdAt: request.createdAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
  };
}

async function serializeNewsRequestsWithStoryCounts(
  rows: Array<NonNullable<Awaited<ReturnType<typeof getNewsRequestByIdForUser>>>>,
) {
  const counts = await countStoriesByNewsRequestIds(rows.map((row) => row.id));
  return rows.map((row) =>
    serializeNewsRequest(row, counts.get(row.id) ?? 0),
  );
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
  const savedFlags = await getSavedFlagsForStories(
    userId,
    stories.map((story) => story.id),
  );
  return stories.map((story) =>
    serializeStory(
      story,
      userVotes.get(story.id) ?? null,
      savedFlags.get(story.id) ?? false,
      userId,
    ),
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
      latitude: params.config.latitude,
      longitude: params.config.longitude,
      locationRadiusMeters: params.config.locationRadiusMeters,
      categories: params.config.categories,
      customQuery: params.config.customQuery,
      storyCount: params.config.storyCount,
      language: params.config.language,
      sources: params.config.sources,
      serpHl: params.config.serpHl,
    },
  });
}

function buildInitialSearchQuery(config: NewsGenerationConfig) {
  return {
    news: "pending",
    search: "pending",
    ...(config.latitude != null && config.longitude != null
      ? {
          locationGeo: {
            latitude: config.latitude,
            longitude: config.longitude,
            ...(config.locationRadiusMeters != null
              ? { radiusMeters: config.locationRadiusMeters }
              : {}),
          },
        }
      : {}),
  };
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
    searchQuery: buildInitialSearchQuery(config),
    status: "pending" as const,
    loadingLogs: ["Request accepted; pipeline queued."],
  };
}

/** Create or reuse a news request; trigger pipeline when new or retrying failed. */
export async function requestNews(userId: string, body: RequestNewsBody) {
  let input = body;
  const needsLocation = body.scope === "local" || body.scope === "both";
  if (
    needsLocation &&
    body.location?.trim() &&
    (body.latitude === undefined || body.longitude === undefined)
  ) {
    const coords = await resolveCoordsFromFirstAutocompleteHit(
      body.location,
    ).catch(() => null);
    if (coords) {
      input = {
        ...body,
        latitude: coords.latitude,
        longitude: coords.longitude,
      };
    }
  }

  const config = normalizeNewsGenerationRequest(input);

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

/** Recent news requests for the signed-in user (newest first). */
export async function listRecentNewsRequests(userId: string) {
  const rows = await listRecentNewsRequestsByUserId(
    userId,
    RECENT_NEWS_REQUEST_LIMIT,
  );
  return serializeNewsRequestsWithStoryCounts(rows);
}

/** Paginated news requests for the signed-in user (newest first). */
export async function listUserNewsRequestsPage(input: {
  userId: string;
  page: number;
  limit: number;
}) {
  const limit = Math.min(
    Math.max(1, input.limit),
    USER_NEWS_REQUESTS_MAX_LIMIT,
  );
  const page = Math.max(1, input.page);
  const { total, rows } = await listNewsRequestsByUserIdPage({
    userId: input.userId,
    skip: (page - 1) * limit,
    take: limit,
  });
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    newsRequests: await serializeNewsRequestsWithStoryCounts(rows),
    page,
    limit,
    total,
    totalPages,
  };
}

export const PUBLIC_NEWS_STORIES_DEFAULT_LIMIT = 20;
export const PUBLIC_NEWS_STORIES_MAX_LIMIT = 50;

/** Public paginated story feed (successful briefings only). */
export async function listPublicNewsStories(input: {
  page: number;
  limit: number;
  viewerUserId: string | null;
}) {
  const limit = Math.min(
    Math.max(1, input.limit),
    PUBLIC_NEWS_STORIES_MAX_LIMIT,
  );
  const page = Math.max(1, input.page);

  const { total, stories } = await listPublishedNewsStoriesPaginated({
    page,
    limit,
  });

  const userVotes = input.viewerUserId
    ? await getUserVotesForStories(
        input.viewerUserId,
        stories.map((story) => story.id),
      )
    : new Map<string, "UP" | "DOWN">();

  const savedFlags = input.viewerUserId
    ? await getSavedFlagsForStories(
        input.viewerUserId,
        stories.map((story) => story.id),
      )
    : new Map<string, boolean>();

  const serialized = stories.map((story) =>
    serializeStory(
      story as ListedStory,
      userVotes.get(story.id) ?? null,
      savedFlags.get(story.id) ?? false,
      input.viewerUserId,
    ),
  );

  return {
    stories: serialized,
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

/** Public single-story page (successful briefings only). */
export async function getNewsStoryPageResult(
  storyId: string,
  viewerUserId: string | null,
) {
  const bundle = await getNewsStoryWithSourcesForPage(storyId, viewerUserId);
  if (!bundle) {
    return null;
  }

  const userVotes = viewerUserId
    ? await getUserVotesForStories(viewerUserId, [bundle.story.id])
    : new Map<string, "UP" | "DOWN">();

  const userSaved = viewerUserId
    ? ((await getSavedFlagsForStories(viewerUserId, [bundle.story.id])).get(
        bundle.story.id,
      ) ?? false)
    : false;

  const story = serializeStory(
    bundle.story as PageStoryRow,
    userVotes.get(bundle.story.id) ?? null,
    userSaved,
    viewerUserId,
  );

  const ownerId = bundle.story.ownerId ?? null;

  return {
    newsRequest: bundle.newsRequest
      ? serializeNewsRequest(bundle.newsRequest)
      : null,
    story,
    canViewFullBriefing: bundle.newsRequest
      ? viewerUserId === bundle.newsRequest.userId
      : ownerId != null && viewerUserId === ownerId,
  };
}

/** Paginated bookmarked community stories for the signed-in viewer. */
export async function listViewerBookmarkedNewsStories(input: {
  userId: string;
  page: number;
  limit: number;
}) {
  const limit = Math.min(
    Math.max(1, input.limit),
    PUBLIC_NEWS_STORIES_MAX_LIMIT,
  );
  const page = Math.max(1, input.page);

  const { stories, total, totalPages } = await listSavedNewsStoriesForUser({
    userId: input.userId,
    page,
    limit,
  });

  const userVotes = await getUserVotesForStories(
    input.userId,
    stories.map((story) => story.id),
  );

  const serialized = stories.map((story) =>
    serializeStory(
      story as ListedStory,
      userVotes.get(story.id) ?? null,
      true,
      input.userId,
    ),
  );

  return {
    stories: serialized,
    page,
    limit,
    total,
    totalPages,
  };
}

/** User-created stories owned by the signed-in viewer (Saved Stories page). */
export async function listViewerUserCreatedNewsStories(input: {
  userId: string;
  page: number;
  limit: number;
}) {
  const limit = Math.min(
    Math.max(1, input.limit),
    PUBLIC_NEWS_STORIES_MAX_LIMIT,
  );
  const page = Math.max(1, input.page);

  const { stories, total } = await listUserCreatedStoriesForOwner({
    ownerId: input.userId,
    page,
    limit,
  });

  const userVotes = await getUserVotesForStories(
    input.userId,
    stories.map((story) => story.id),
  );

  const serialized = stories.map((story) =>
    serializeStory(
      story as ListedStory,
      userVotes.get(story.id) ?? null,
      false,
      input.userId,
    ),
  );

  return {
    stories: serialized,
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

/** @deprecated Use listViewerBookmarkedNewsStories */
export const listViewerSavedNewsStories = listViewerBookmarkedNewsStories;

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
