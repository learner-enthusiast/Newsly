import { inngest } from "@/clients/inngestClient";
import { NEWS_PIPELINE_EVENT } from "@/inngest";
import {
  createNewsRequest,
  getNewsRequestByIdForUser,
  newsScopeSchema,
  patchNewsRequest,
} from "@/repositories/newsRequest";
import { listNewsStoriesByNewsRequestId } from "@/repositories/newsStory";
import { findUserNewsRequest } from "@/repositories/user";
import { z } from "zod";

export const requestNewsBodySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    scope: newsScopeSchema,
    location: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.scope === "local" && !data.location?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "location is required when scope is local",
        path: ["location"],
      });
    }
    if (data.scope === "world" && data.location?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "location must not be set when scope is world",
        path: ["location"],
      });
    }
  });

export type RequestNewsBody = z.infer<typeof requestNewsBodySchema>;

function toRequestDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function serializeStory(story: Awaited<
  ReturnType<typeof listNewsStoriesByNewsRequestId>
>[number]) {
  return {
    id: story.id,
    newsRequestId: story.newsRequestId,
    title: story.title,
    slug: story.slug,
    summary: story.summary,
    content: story.content,
    category: story.category,
    location: story.location,
    publishedAt: story.publishedAt?.toISOString() ?? null,
    importanceScore:
      story.importanceScore != null ? Number(story.importanceScore) : null,
    createdAt: story.createdAt.toISOString(),
    updatedAt: story.updatedAt.toISOString(),
  };
}

function serializeNewsRequest(
  request: NonNullable<Awaited<ReturnType<typeof getNewsRequestByIdForUser>>>,
) {
  return {
    id: request.id,
    userId: request.userId,
    date: request.date.toISOString().slice(0, 10),
    location: request.location,
    scope: request.scope,
    status: request.status,
    error: request.error,
    searchQuery: request.searchQuery,
    createdAt: request.createdAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
  };
}

async function loadStoriesIfReady(newsRequestId: string, status: string) {
  if (status !== "success") {
    return [];
  }
  const stories = await listNewsStoriesByNewsRequestId(newsRequestId);
  return stories.map(serializeStory);
}

async function triggerNewsPipeline(params: {
  userId: string;
  newsRequestId: string;
  date: string;
  scope: z.infer<typeof newsScopeSchema>;
  location: string | null;
}) {
  await inngest.send({
    name: NEWS_PIPELINE_EVENT,
    data: {
      userId: params.userId,
      newsRequestId: params.newsRequestId,
      date: params.date,
      scope: params.scope,
      location: params.location,
    },
  });
}

/** Create or reuse a news request; trigger pipeline when new or retrying failed. */
export async function requestNews(userId: string, body: RequestNewsBody) {
  const parsed = requestNewsBodySchema.parse(body);
  const date = toRequestDate(parsed.date);
  const location = parsed.scope === "local" ? parsed.location!.trim() : null;

  const existing = await findUserNewsRequest({
    userId,
    date,
    scope: parsed.scope,
    location,
  });

  if (existing) {
    if (existing.status === "failed") {
      await patchNewsRequest(existing.id, {
        status: "pending",
        error: null,
        completedAt: null,
      });
      await triggerNewsPipeline({
        userId,
        newsRequestId: existing.id,
        date: parsed.date,
        scope: parsed.scope,
        location,
      });
      const updated = await getNewsRequestByIdForUser(existing.id, userId);
      return {
        newsRequest: serializeNewsRequest(updated ?? existing),
        stories: [],
        created: false as const,
        pipelineTriggered: true as const,
      };
    }

    const stories = await loadStoriesIfReady(existing.id, existing.status);
    return {
      newsRequest: serializeNewsRequest(existing),
      stories,
      created: false as const,
      pipelineTriggered: false as const,
    };
  }

  const newsRequest = await createNewsRequest({
    userId,
    date,
    location,
    scope: parsed.scope,
    searchQuery: { news: "pending", search: "pending" },
    status: "pending",
  });

  await triggerNewsPipeline({
    userId,
    newsRequestId: newsRequest.id,
    date: parsed.date,
    scope: parsed.scope,
    location,
  });

  return {
    newsRequest: serializeNewsRequest(newsRequest),
    stories: [] as ReturnType<typeof serializeStory>[],
    created: true as const,
    pipelineTriggered: true as const,
  };
}

/** Poll news request status and stories for the owning user. */
export async function getNewsRequestResult(userId: string, newsRequestId: string) {
  const newsRequest = await getNewsRequestByIdForUser(newsRequestId, userId);
  if (!newsRequest) {
    return null;
  }

  const stories = await loadStoriesIfReady(newsRequest.id, newsRequest.status);

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

  await patchNewsRequest(newsRequest.id, {
    status: "pending",
    error: null,
    completedAt: null,
  });

  await triggerNewsPipeline({
    userId,
    newsRequestId: newsRequest.id,
    date: newsRequest.date.toISOString().slice(0, 10),
    scope: newsRequest.scope,
    location: newsRequest.location,
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
