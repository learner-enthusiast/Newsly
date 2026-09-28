import { photoUploadClient } from "@/clients/photoUploadClient";
import { updateUserCreatedStoryForOwner } from "@/repositories/newsStory";
import { z } from "zod";

export const USER_STORY_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const allowedMimeTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

const storyPhotoFileSchema = z.object({
  buffer: z
    .instanceof(Buffer)
    .refine((b) => b.length > 0, "Photo file is empty")
    .refine(
      (b) => b.length <= USER_STORY_PHOTO_MAX_BYTES,
      `Photo must be ${USER_STORY_PHOTO_MAX_BYTES / (1024 * 1024)}MB or smaller`,
    ),
  filename: z.string().min(1),
  mimeType: z.enum(allowedMimeTypes),
});

export type UserStoryPhotoFileInput = z.input<typeof storyPhotoFileSchema>;

export async function uploadOwnedUserStoryPhoto(input: {
  storyId: string;
  ownerId: string;
  file: UserStoryPhotoFileInput;
}) {
  const file = storyPhotoFileSchema.parse(input.file);

  const upload = await photoUploadClient.uploadPhoto({
    buffer: file.buffer,
    filename: file.filename,
    mimeType: file.mimeType,
    folder: process.env.NEWS_STORY_PHOTO_FOLDER ?? "newsly/stories",
    publicId: `story-${input.storyId}`,
  });

  const updated = await updateUserCreatedStoryForOwner({
    storyId: input.storyId,
    ownerId: input.ownerId,
    data: { imageUrl: upload.url },
  });

  if (!updated) {
    return null;
  }

  return {
    storyId: updated.id,
    imageUrl: updated.imageUrl,
    provider: upload.provider,
    bytes: upload.bytes,
  };
}

export function isAllowedStoryPhotoMimeType(
  mimeType: string,
): mimeType is (typeof allowedMimeTypes)[number] {
  return (allowedMimeTypes as readonly string[]).includes(
    mimeType.toLowerCase(),
  );
}
