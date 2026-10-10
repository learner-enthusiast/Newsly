import { getPublishedNewsStoryWithSources } from "@/repositories/newsStory";
import { listPublishedNewsStoriesByIds } from "@/repositories/newsStorySavedList";
import {
  addUserSavedStory,
  getUserSavedStoryIdSet,
  isStorySavedByUser,
  listUserSavedStoryIdsNewestFirst,
  removeUserSavedStory,
} from "@/repositories/userSavedStories";
import { z } from "zod";

const storyIdParamSchema = z.uuid("storyId must be a uuid");

export type SavedStoryState = {
  saved: boolean;
};

export async function getSavedStoryState(
  userId: string,
  storyId: string,
): Promise<SavedStoryState | null> {
  const bundle = await getPublishedNewsStoryWithSources(
    storyIdParamSchema.parse(storyId),
  );
  if (!bundle) {
    return null;
  }

  const saved = await isStorySavedByUser(userId, storyId);
  return { saved };
}

export async function saveStoryForUser(
  userId: string,
  storyId: string,
): Promise<SavedStoryState | null> {
  const parsedId = storyIdParamSchema.parse(storyId);
  const bundle = await getPublishedNewsStoryWithSources(parsedId);
  if (!bundle) {
    return null;
  }

  await addUserSavedStory(userId, parsedId);
  return { saved: true };
}

export async function unsaveStoryForUser(
  userId: string,
  storyId: string,
): Promise<SavedStoryState | null> {
  const parsedId = storyIdParamSchema.parse(storyId);
  const bundle = await getPublishedNewsStoryWithSources(parsedId);
  if (!bundle) {
    return null;
  }

  await removeUserSavedStory(userId, parsedId);
  return { saved: false };
}

export async function getSavedFlagsForStories(
  userId: string,
  storyIds: string[],
): Promise<Map<string, boolean>> {
  const savedIds = await getUserSavedStoryIdSet(userId, storyIds);
  return new Map(storyIds.map((id) => [id, savedIds.has(id)]));
}

export async function listSavedNewsStoriesForUser(input: {
  userId: string;
  page: number;
  limit: number;
}) {
  const page = Math.max(1, input.page);
  const limit = Math.min(Math.max(1, input.limit), 50);
  const orderedIds = await listUserSavedStoryIdsNewestFirst(input.userId);
  const total = orderedIds.length;
  const skip = (page - 1) * limit;
  const pageIds = orderedIds.slice(skip, skip + limit);

  const stories =
    pageIds.length === 0
      ? []
      : await listPublishedNewsStoriesByIds(pageIds);

  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    stories,
  };
}

export function attachSavedFieldToStory<T>(story: T, userSaved: boolean) {
  return {
    ...story,
    userSaved,
  };
}
