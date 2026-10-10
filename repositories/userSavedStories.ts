import { z } from "zod";
import { prisma } from "@/db";

const userIdSchema = z.string().min(1, "userId is required");
const storyIdSchema = z.uuid("storyId must be a uuid");

export async function getUserSavedStoryIds(userId: string): Promise<string[]> {
  const row = await prisma.user.findUnique({
    where: { id: userIdSchema.parse(userId) },
    select: { savedStories: true },
  });
  return row?.savedStories ?? [];
}

export async function isStorySavedByUser(
  userId: string,
  storyId: string,
): Promise<boolean> {
  const ids = await getUserSavedStoryIds(userId);
  const parsed = storyIdSchema.parse(storyId);
  return ids.includes(parsed);
}

/** Returns saved story ids in reverse order (most recently saved first). */
export async function listUserSavedStoryIdsNewestFirst(
  userId: string,
): Promise<string[]> {
  const ids = await getUserSavedStoryIds(userId);
  return [...ids].reverse();
}

export async function addUserSavedStory(
  userId: string,
  storyId: string,
): Promise<string[]> {
  const parsedStoryId = storyIdSchema.parse(storyId);
  const parsedUserId = userIdSchema.parse(userId);

  const existing = await getUserSavedStoryIds(parsedUserId);
  if (existing.includes(parsedStoryId)) {
    return existing;
  }

  const updated = await prisma.user.update({
    where: { id: parsedUserId },
    data: { savedStories: [...existing, parsedStoryId] },
    select: { savedStories: true },
  });

  return updated.savedStories;
}

export async function removeUserSavedStory(
  userId: string,
  storyId: string,
): Promise<string[]> {
  const parsedStoryId = storyIdSchema.parse(storyId);
  const parsedUserId = userIdSchema.parse(userId);

  const existing = await getUserSavedStoryIds(parsedUserId);
  const next = existing.filter((id) => id !== parsedStoryId);

  if (next.length === existing.length) {
    return existing;
  }

  const updated = await prisma.user.update({
    where: { id: parsedUserId },
    data: { savedStories: next },
    select: { savedStories: true },
  });

  return updated.savedStories;
}

export async function getUserSavedStoryIdSet(
  userId: string,
  storyIds: string[],
): Promise<Set<string>> {
  if (storyIds.length === 0) {
    return new Set();
  }

  const saved = await getUserSavedStoryIds(userId);
  const savedSet = new Set(saved);
  const wanted = new Set(storyIds.map((id) => storyIdSchema.parse(id)));
  const intersection = new Set<string>();
  for (const id of savedSet) {
    if (wanted.has(id)) {
      intersection.add(id);
    }
  }
  return intersection;
}
