import { z } from "zod";
import { prisma } from "@/db";

const newsSourceIdSchema = z.uuid("id must be a uuid");
const newsStoryIdSchema = z.uuid("newsStoryId must be a uuid");
const newsRequestIdSchema = z.uuid("newsRequestId must be a uuid");

const newsSourceWriteSchema = z.object({
  newsStoryId: newsStoryIdSchema,
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string().min(1),
  scrapedContent: z.string().nullable().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  sourceType: z.string().min(1),
  transcript: z.string().nullable().optional(),
});

const newsSourcePutSchema = newsSourceWriteSchema.omit({ newsStoryId: true });
const newsSourcePatchSchema = newsSourcePutSchema.partial();

export type NewsSourceCreateInput = z.input<typeof newsSourceWriteSchema>;
export type NewsSourcePutInput = z.input<typeof newsSourcePutSchema>;
export type NewsSourcePatchInput = z.input<typeof newsSourcePatchSchema>;

export async function createNewsSource(input: NewsSourceCreateInput) {
  return prisma.newsSource.create({
    data: newsSourceWriteSchema.parse(input),
  });
}

export async function getNewsSourceById(id: string) {
  return prisma.newsSource.findUnique({
    where: { id: newsSourceIdSchema.parse(id) },
  });
}

export async function listNewsSourcesByNewsStoryId(newsStoryId: string) {
  return prisma.newsSource.findMany({
    where: { newsStoryId: newsStoryIdSchema.parse(newsStoryId) },
    orderBy: { createdAt: "asc" },
  });
}

export async function listNewsSourcesByNewsRequestId(newsRequestId: string) {
  return prisma.newsSource.findMany({
    where: {
      newsStory: {
        newsRequestId: newsRequestIdSchema.parse(newsRequestId),
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function listNewsSourceImagesByNewsStoryId(newsStoryId: string) {
  return prisma.newsSource.findMany({
    where: { newsStoryId: newsStoryIdSchema.parse(newsStoryId) },
    select: { url: true, imageUrl: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function listNewsSourcesByIdsForStory(
  newsStoryId: string,
  ids: string[],
) {
  const parsedStoryId = newsStoryIdSchema.parse(newsStoryId);
  const parsedIds = ids.map((id) => newsSourceIdSchema.parse(id));
  if (parsedIds.length === 0) {
    return [];
  }

  const rows = await prisma.newsSource.findMany({
    where: {
      newsStoryId: parsedStoryId,
      id: { in: parsedIds },
    },
  });

  const byId = new Map(rows.map((row) => [row.id, row]));
  return parsedIds
    .map((id) => byId.get(id))
    .filter((row): row is (typeof rows)[number] => row != null);
}

export async function putNewsSource(id: string, input: NewsSourcePutInput) {
  return prisma.newsSource.update({
    where: { id: newsSourceIdSchema.parse(id) },
    data: newsSourcePutSchema.parse(input),
  });
}

export async function patchNewsSource(id: string, input: NewsSourcePatchInput) {
  return prisma.newsSource.update({
    where: { id: newsSourceIdSchema.parse(id) },
    data: newsSourcePatchSchema.parse(input),
  });
}

export async function deleteNewsSource(id: string) {
  return prisma.newsSource.delete({
    where: { id: newsSourceIdSchema.parse(id) },
  });
}
