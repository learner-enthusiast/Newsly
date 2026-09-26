import { z } from "zod";
import { prisma } from "@/db";

const newsStoryIdSchema = z.uuid("id must be a uuid");
const newsRequestIdSchema = z.uuid("newsRequestId must be a uuid");
const userIdSchema = z.string().min(1, "userId is required");

const newsSourceIdSchema = z.uuid();

const newsStoryWriteSchema = z.object({
  newsRequestId: newsRequestIdSchema,
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
  return prisma.newsStory.findFirst({
    where: {
      id: newsStoryIdSchema.parse(storyId),
      newsRequest: { userId: userIdSchema.parse(userId) },
    },
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
      id: newsStoryIdSchema.parse(storyId),
      newsRequest: { status: "success" },
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

const publishedStoryWhere = {
  newsRequest: { status: "success" as const },
};

const publishedStoryOrderBy = [
  { upvotes: "desc" as const },
  { publishedAt: "desc" as const },
  { createdAt: "desc" as const },
];

function mapStoryRowWithSources<
  T extends {
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
      newsRequest: { status: "success" },
      OR: [
        { publishedAt: { gte: input.since } },
        {
          publishedAt: null,
          createdAt: { gte: input.since },
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
