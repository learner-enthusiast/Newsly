import { z } from "zod";
import { prisma } from "@/db";
import type { PublishStatus } from "@/db/generated/client";
import {
  canViewerAccessNewsStoryPage,
  publicNewsStoryWhere,
} from "@/services/news/newsStoryAccess";

const newsStoryIdSchema = z.uuid("id must be a uuid");
const newsRequestIdSchema = z.uuid("newsRequestId must be a uuid");
const userIdSchema = z.string().min(1, "userId is required");

const newsSourceIdSchema = z.uuid();

const newsStoryWriteSchema = z.object({
  newsRequestId: newsRequestIdSchema.optional().nullable(),
  chatSessionId: z.uuid().optional().nullable(),
  ownerId: userIdSchema.optional().nullable(),
  isUserCreated: z.boolean().optional(),
  publishStatus: z.enum(["draft", "published"]).optional(),
  generationError: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  slug: z.string().min(1),
  summary: z.string().min(1),
  content: z.string().min(1),
  category: z.string().min(1),
  location: z.string().min(1).nullable().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  importanceScore: z.coerce.number().nullable().optional(),
  newsSourceIds: z.array(newsSourceIdSchema).optional(),
  imageUrl: z.string().url().nullable().optional(),
});

export const newsStorySourceUrlSchema = z.object({
  id: newsSourceIdSchema,
  url: z.url(),
  title: z.string().min(1),
  domain: z.string().min(1),
});

export type NewsStorySourceUrl = z.infer<typeof newsStorySourceUrlSchema>;

const newsStoryPutSchema = newsStoryWriteSchema.omit({ newsRequestId: true });
const newsStoryPatchSchema = newsStoryPutSchema.partial();

export type NewsStoryCreateInput = z.input<typeof newsStoryWriteSchema>;
export type NewsStoryPutInput = z.input<typeof newsStoryPutSchema>;
export type NewsStoryPatchInput = z.input<typeof newsStoryPatchSchema>;

export async function createNewsStory(input: NewsStoryCreateInput) {
  return prisma.newsStory.create({
    data: newsStoryWriteSchema.parse(input),
  });
}

export async function getNewsStoryById(id: string) {
  return prisma.newsStory.findUnique({
    where: { id: newsStoryIdSchema.parse(id) },
  });
}

export async function getNewsStoryByIdForUser(storyId: string, userId: string) {
  const parsedUserId = userIdSchema.parse(userId);
  const parsedStoryId = newsStoryIdSchema.parse(storyId);
  return prisma.newsStory.findFirst({
    where: {
      id: parsedStoryId,
      OR: [
        { newsRequest: { userId: parsedUserId } },
        { ownerId: parsedUserId },
      ],
    },
  });
}

export async function createUserChatNewsStoryShell(input: {
  chatSessionId: string;
  ownerId: string;
  storyId?: string;
}) {
  const chatSessionId = z.uuid().parse(input.chatSessionId);
  const ownerId = userIdSchema.parse(input.ownerId);
  const slug = `pending-${Date.now()}`;

  return prisma.newsStory.create({
    data: {
      ...(input.storyId ? { id: newsStoryIdSchema.parse(input.storyId) } : {}),
      newsRequestId: null,
      chatSessionId,
      ownerId,
      isUserCreated: true,
      publishStatus: "draft",
      title: "Story in progress",
      slug,
      summary: "Research and synthesis in progress.",
      content: "Story generation is in progress.",
      category: "general",
    },
  });
}

/** @deprecated alias */
export const createPendingChatNewsStory = createUserChatNewsStoryShell;

export async function markChatNewsStoryFailed(storyId: string, errorMessage: string) {
  return prisma.newsStory.updateMany({
    where: {
      id: newsStoryIdSchema.parse(storyId),
      isUserCreated: true,
      publishStatus: "draft",
      generationError: null,
    },
    data: {
      generationError: errorMessage.slice(0, 2000),
      title: "Story generation failed",
      summary: "We could not finish this story.",
      content: "Story generation failed. You can try creating a new story from chat.",
    },
  });
}

export async function getChatNewsStoryForPipeline(input: {
  storyId: string;
  userId: string;
  chatSessionId: string;
}) {
  return prisma.newsStory.findFirst({
    where: {
      id: newsStoryIdSchema.parse(input.storyId),
      ownerId: userIdSchema.parse(input.userId),
      chatSessionId: z.uuid().parse(input.chatSessionId),
    },
  });
}

export async function applyChatStorySynthesis(input: {
  storyId: string;
  title: string;
  description: string | null;
  slug: string;
  summary: string;
  content: string;
  category: string;
  location: string | null;
  imageUrl: string | null;
  importanceScore: number | null;
  newsSourceIds: string[];
  publishedAt?: Date | null;
}) {
  return prisma.newsStory.update({
    where: { id: newsStoryIdSchema.parse(input.storyId) },
    data: {
      title: input.title,
      description: input.description,
      slug: input.slug,
      summary: input.summary,
      content: input.content,
      category: input.category,
      location: input.location,
      imageUrl: input.imageUrl,
      importanceScore: input.importanceScore,
      newsSourceIds: input.newsSourceIds,
      publishedAt: input.publishedAt ?? null,
      generationError: null,
    },
  });
}

export async function listUserCreatedStoriesForOwner(input: {
  ownerId: string;
  page: number;
  limit: number;
}) {
  const ownerId = userIdSchema.parse(input.ownerId);
  const page = Math.max(1, input.page);
  const limit = Math.min(Math.max(1, input.limit), 50);
  const skip = (page - 1) * limit;

  const where = {
    ownerId,
    isUserCreated: true,
  };

  const [total, rows] = await prisma.$transaction([
    prisma.newsStory.count({ where }),
    prisma.newsStory.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      include: {
        sources: {
          select: { id: true, url: true, title: true, domain: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  return {
    page,
    limit,
    total,
    stories: rows.map((row) => mapStoryRowWithSources(row)),
  };
}

export async function updateUserCreatedStoryForOwner(input: {
  storyId: string;
  ownerId: string;
  data: {
    title?: string;
    description?: string | null;
    summary?: string;
    content?: string;
    category?: string;
    location?: string | null;
    imageUrl?: string | null;
    newsSourceIds?: string[];
  };
}) {
  const storyId = newsStoryIdSchema.parse(input.storyId);
  const ownerId = userIdSchema.parse(input.ownerId);
  const existing = await prisma.newsStory.findFirst({
    where: { id: storyId, ownerId, isUserCreated: true },
    select: { id: true },
  });
  if (!existing) {
    return null;
  }
  return prisma.newsStory.update({
    where: { id: storyId },
    data: input.data,
  });
}

export async function setUserStoryPublishStatus(input: {
  storyId: string;
  ownerId: string;
  publishStatus: PublishStatus;
}) {
  const storyId = newsStoryIdSchema.parse(input.storyId);
  const ownerId = userIdSchema.parse(input.ownerId);
  const existing = await prisma.newsStory.findFirst({
    where: { id: storyId, ownerId, isUserCreated: true },
    select: { id: true, generationError: true, slug: true, title: true },
  });
  if (!existing) {
    return null;
  }
  if (
    input.publishStatus === "published" &&
    (existing.generationError ||
      existing.slug.startsWith("pending-") ||
      existing.title === "Story in progress")
  ) {
    throw new Error("Story is not ready to publish");
  }
  return prisma.newsStory.update({
    where: { id: storyId },
    data: { publishStatus: input.publishStatus },
  });
}

/** Story row plus sources ordered by `newsSourceIds` (fallback: createdAt). */
export async function getNewsStoryWithSourcesById(id: string) {
  const row = await prisma.newsStory.findUnique({
    where: { id: newsStoryIdSchema.parse(id) },
    include: {
      sources: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!row) {
    return null;
  }

  const { sources, ...story } = row;
  const byId = new Map(sources.map((source) => [source.id, source]));
  const ordered =
    story.newsSourceIds.length > 0
      ? story.newsSourceIds
          .map((sourceId) => byId.get(sourceId))
          .filter((source): source is (typeof sources)[number] => source != null)
      : sources;

  return { ...story, sources: ordered };
}

const trendingStorySelect = {
  id: true,
  newsRequestId: true,
  title: true,
  description: true,
  summary: true,
  category: true,
  location: true,
  publishedAt: true,
  importanceScore: true,
  upvotes: true,
  downvotes: true,
  imageUrl: true,
  createdAt: true,
  sources: {
    select: { id: true, url: true, title: true, domain: true },
    orderBy: { createdAt: "asc" as const },
    take: 3,
  },
} as const;

/** Recent stories from successful briefings, ranked by community upvotes. */
/** Story from a completed briefing (public story page). */
export async function getPublishedNewsStoryWithSources(storyId: string) {
  const row = await prisma.newsStory.findFirst({
    where: {
      AND: [{ id: newsStoryIdSchema.parse(storyId) }, publicNewsStoryWhere],
    },
    include: {
      newsRequest: true,
      sources: {
        select: { id: true, url: true, title: true, domain: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!row) {
    return null;
  }

  const { sources, newsRequest, ...story } = row;
  const byId = new Map(sources.map((source) => [source.id, source]));
  const ordered =
    story.newsSourceIds.length > 0
      ? story.newsSourceIds
          .map((sourceId) => byId.get(sourceId))
          .filter((source): source is (typeof sources)[number] => source != null)
      : sources;

  return {
    newsRequest,
    story: {
      ...story,
      sourceUrls: ordered.map((source) =>
        newsStorySourceUrlSchema.parse({
          id: source.id,
          url: source.url,
          title: source.title,
          domain: source.domain,
        }),
      ),
    },
  };
}

/** Latest chat-origin story for a session (owner-only lookup). */
export async function getLatestChatOriginStoryForSession(input: {
  chatSessionId: string;
  ownerId: string;
}) {
  return prisma.newsStory.findFirst({
    where: {
      chatSessionId: z.uuid().parse(input.chatSessionId),
      ownerId: userIdSchema.parse(input.ownerId),
      isUserCreated: true,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      isUserCreated: true,
      publishStatus: true,
      generationError: true,
      slug: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/** Story page bundle for public briefing stories, public chat stories, or owner chat drafts. */
export async function getNewsStoryWithSourcesForPage(
  storyId: string,
  viewerUserId: string | null,
) {
  const row = await prisma.newsStory.findUnique({
    where: { id: newsStoryIdSchema.parse(storyId) },
    include: {
      newsRequest: true,
      sources: {
        select: { id: true, url: true, title: true, domain: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!row) {
    return null;
  }

  const allowed = canViewerAccessNewsStoryPage({
    isUserCreated: row.isUserCreated,
    publishStatus: row.publishStatus,
    ownerId: row.ownerId,
    viewerUserId,
    newsRequestSuccess:
      row.newsRequest != null && row.newsRequest.status === "success",
  });

  if (!allowed) {
    return null;
  }

  const { sources, newsRequest, ...story } = row;
  const byId = new Map(sources.map((source) => [source.id, source]));
  const ordered =
    story.newsSourceIds.length > 0
      ? story.newsSourceIds
          .map((sourceId) => byId.get(sourceId))
          .filter((source): source is (typeof sources)[number] => source != null)
      : sources;

  return {
    newsRequest,
    story: {
      ...story,
      sourceUrls: ordered.map((source) =>
        newsStorySourceUrlSchema.parse({
          id: source.id,
          url: source.url,
          title: source.title,
          domain: source.domain,
        }),
      ),
    },
  };
}

const publishedStoryWhere = publicNewsStoryWhere;

const publishedStoryOrderBy = [
  { upvotes: "desc" as const },
  { publishedAt: "desc" as const },
  { createdAt: "desc" as const },
];

function mapStoryRowWithSources<
  T extends {
    id: string;
    newsSourceIds: string[];
    sources: {
      id: string;
      url: string;
      title: string;
      domain: string;
    }[];
  },
>(row: T) {
  const { sources, ...story } = row;
  const byId = new Map(sources.map((source) => [source.id, source]));
  const ordered =
    story.newsSourceIds.length > 0
      ? story.newsSourceIds
          .map((sourceId) => byId.get(sourceId))
          .filter((source): source is (typeof sources)[number] => source != null)
      : sources;

  return {
    ...story,
    sourceUrls: ordered.map((source) =>
      newsStorySourceUrlSchema.parse({
        id: source.id,
        url: source.url,
        title: source.title,
        domain: source.domain,
      }),
    ),
  };
}

/** Paginated published stories (successful briefings), ranked by votes then recency. */
export async function listPublishedNewsStoriesPaginated(input: {
  page: number;
  limit: number;
}) {
  const page = Math.max(1, input.page);
  const limit = Math.min(Math.max(1, input.limit), 50);
  const skip = (page - 1) * limit;

  const [total, rows] = await prisma.$transaction([
    prisma.newsStory.count({ where: publishedStoryWhere }),
    prisma.newsStory.findMany({
      where: publishedStoryWhere,
      orderBy: publishedStoryOrderBy,
      skip,
      take: limit,
      include: {
        sources: {
          select: { id: true, url: true, title: true, domain: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  return {
    page,
    limit,
    total,
    stories: rows.map((row) => mapStoryRowWithSources(row)),
  };
}

export async function listTrendingNewsStories(input: {
  since: Date;
  limit: number;
}) {
  const limit = Math.min(Math.max(1, input.limit), 20);

  return prisma.newsStory.findMany({
    where: {
      AND: [
        publicNewsStoryWhere,
        {
          OR: [
            { publishedAt: { gte: input.since } },
            {
              publishedAt: null,
              createdAt: { gte: input.since },
            },
          ],
        },
      ],
    },
    orderBy: [{ upvotes: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: trendingStorySelect,
  });
}

export async function listNewsStoriesByNewsRequestId(newsRequestId: string) {
  const rows = await prisma.newsStory.findMany({
    where: { newsRequestId: newsRequestIdSchema.parse(newsRequestId) },
    orderBy: [{ importanceScore: "desc" }, { createdAt: "desc" }],
    include: {
      sources: {
        select: { id: true, url: true, title: true, domain: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return rows.map((row) => mapStoryRowWithSources(row));
}

export async function putNewsStory(id: string, input: NewsStoryPutInput) {
  return prisma.newsStory.update({
    where: { id: newsStoryIdSchema.parse(id) },
    data: newsStoryPutSchema.parse(input),
  });
}

export async function patchNewsStory(id: string, input: NewsStoryPatchInput) {
  return prisma.newsStory.update({
    where: { id: newsStoryIdSchema.parse(id) },
    data: newsStoryPatchSchema.parse(input),
  });
}

export async function deleteNewsStory(id: string) {
  return prisma.newsStory.delete({
    where: { id: newsStoryIdSchema.parse(id) },
  });
}
