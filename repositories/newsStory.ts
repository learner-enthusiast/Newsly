import { z } from "zod";
import { prisma } from "@/db";

const newsStoryIdSchema = z.uuid("id must be a uuid");
const newsRequestIdSchema = z.uuid("newsRequestId must be a uuid");

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

  return rows.map(({ sources, ...story }) => {
    const byId = new Map(sources.map((source) => [source.id, source]));
    const ordered =
      story.newsSourceIds.length > 0
        ? story.newsSourceIds
            .map((id) => byId.get(id))
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
  });
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
