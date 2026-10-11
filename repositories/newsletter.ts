import type { NewsletterFrequency, NewsScope, Prisma } from "@/db/generated/client";
import { prisma } from "@/db";
import { z } from "zod";

const idSchema = z.string().min(1);
const userIdSchema = z.string().min(1);

export {
  MAX_NEWSLETTERS_PER_USER,
  NEWSLETTER_MAX_STORY_COUNT,
} from "@/lib/newsletter/constants";

export async function countNewslettersForUser(userId: string) {
  return await prisma.newsletter.count({
    where: { userId: userIdSchema.parse(userId) },
  });
}

export async function listNewslettersForUser(userId: string) {
  return await prisma.newsletter.findMany({
    where: { userId: userIdSchema.parse(userId) },
    orderBy: { createdAt: "desc" },
    include: {
      deliveries: {
        orderBy: { scheduledFor: "desc" },
        take: 10,
      },
    },
  });
}

export async function getNewsletterForUser(id: string, userId: string) {
  return await prisma.newsletter.findFirst({
    where: { id: idSchema.parse(id), userId: userIdSchema.parse(userId) },
    include: {
      deliveries: { orderBy: { scheduledFor: "desc" }, take: 10 },
    },
  });
}

export async function getNewsletterById(id: string) {
  return await prisma.newsletter.findUnique({
    where: { id: idSchema.parse(id) },
  });
}

export type NewsletterWriteInput = {
  userId: string;
  name: string;
  email: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  scope: NewsScope;
  storyCount: number;
  categories: string[];
  customQuery: string | null;
  language: string | null;
  sources: string[];
  frequency: NewsletterFrequency;
  sendTimeLocal: string;
  timezone: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  paramsFingerprint: string;
  nextRunAt: Date | null;
  isActive?: boolean;
};

export async function createNewsletter(input: NewsletterWriteInput) {
  return await prisma.newsletter.create({ data: input });
}

export async function patchNewsletter(
  id: string,
  userId: string,
  data: Prisma.NewsletterUpdateInput,
) {
  const existing = await getNewsletterForUser(id, userId);
  if (!existing) {
    return null;
  }
  return await prisma.newsletter.update({
    where: { id: existing.id },
    data,
  });
}

export async function deleteNewsletter(id: string, userId: string) {
  const existing = await getNewsletterForUser(id, userId);
  if (!existing) {
    return false;
  }
  await prisma.newsletter.delete({ where: { id: existing.id } });
  return true;
}

export async function listDueNewsletters(now: Date, limit = 50) {
  return await prisma.newsletter.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
    },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });
}

export async function advanceNewsletterNextRunIfMatches(
  id: string,
  expectedScheduledFor: Date,
  nextRunAt: Date,
) {
  const result = await prisma.newsletter.updateMany({
    where: {
      id,
      isActive: true,
      nextRunAt: expectedScheduledFor,
    },
    data: { nextRunAt },
  });
  return result.count === 1;
}

export async function deactivateNewsletter(id: string) {
  return await prisma.newsletter.update({
    where: { id: idSchema.parse(id) },
    data: { isActive: false, nextRunAt: null },
  });
}
