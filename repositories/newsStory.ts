import { z } from "zod";
import { prisma } from "@/db";

const newsStoryIdSchema = z.uuid("id must be a uuid");
const newsRequestIdSchema = z.uuid("newsRequestId must be a uuid");

const newsStoryWriteSchema = z.object({
  newsRequestId: newsRequestIdSchema,
  title: z.string().min(1),
  slug: z.string().min(1),
  summary: z.string().min(1),
  content: z.string().min(1),
  category: z.string().min(1),
  location: z.string().min(1).nullable().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  importanceScore: z.coerce.number().nullable().optional(),
});

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
  return prisma.newsStory.findMany({
    where: { newsRequestId: newsRequestIdSchema.parse(newsRequestId) },
    orderBy: [{ importanceScore: "desc" }, { createdAt: "desc" }],
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
