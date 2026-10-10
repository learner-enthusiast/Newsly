import { z } from "zod";
import {
  setUserStoryPublishStatus,
  updateUserCreatedStoryForOwner,
} from "@/repositories/newsStory";
import { getNewsSourceById } from "@/repositories/newsSource";

const newsSourceIdSchema = z.uuid();

export const userStoryContentUpdateSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().min(1).max(2000).nullable().optional(),
    summary: z.string().min(1).max(20_000).optional(),
    content: z.string().min(1).max(100_000).optional(),
    category: z.string().min(1).max(120).optional(),
    location: z.string().min(1).max(200).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    newsSourceIds: z.array(newsSourceIdSchema).max(50).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

export type UserStoryContentUpdate = z.infer<typeof userStoryContentUpdateSchema>;

export async function updateOwnedUserStory(input: {
  storyId: string;
  ownerId: string;
  data: UserStoryContentUpdate;
}) {
  const parsed = userStoryContentUpdateSchema.parse(input.data);

  if (parsed.newsSourceIds) {
    for (const sourceId of parsed.newsSourceIds) {
      const source = await getNewsSourceById(sourceId);
      if (!source) {
        throw new Error("Invalid source selection");
      }
    }
  }

  const updated = await updateUserCreatedStoryForOwner({
    storyId: input.storyId,
    ownerId: input.ownerId,
    data: parsed,
  });

  if (!updated) {
    return null;
  }

  return updated;
}

export async function publishOwnedUserStory(storyId: string, ownerId: string) {
  return setUserStoryPublishStatus({
    storyId,
    ownerId,
    publishStatus: "published",
  });
}

export async function unpublishOwnedUserStory(storyId: string, ownerId: string) {
  return setUserStoryPublishStatus({
    storyId,
    ownerId,
    publishStatus: "draft",
  });
}
