import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getNewsStoryPageResult } from "@/services/news/apiService";
import {
  isAllowedStoryPhotoMimeType,
  uploadOwnedUserStoryPhoto,
  USER_STORY_PHOTO_MAX_BYTES,
} from "@/services/news/userStoryPhotoUpload";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ storyId: string }>;
};

const storyIdParamSchema = z.uuid();

export async function POST(request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId: rawStoryId } = await context.params;
  const storyIdParsed = storyIdParamSchema.safeParse(rawStoryId);
  if (!storyIdParsed.success) {
    return NextResponse.json({ error: "Invalid story id" }, { status: 400 });
  }
  const storyId = storyIdParsed.data;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const entry = formData.get("photo") ?? formData.get("file");
  if (!(entry instanceof File)) {
    return NextResponse.json(
      { error: "Missing photo file (use form field photo or file)" },
      { status: 400 },
    );
  }

  const mimeType = (entry.type || "application/octet-stream").toLowerCase();
  if (!isAllowedStoryPhotoMimeType(mimeType)) {
    return NextResponse.json(
      { error: "Unsupported image type. Use JPEG, PNG, WebP, GIF, or AVIF." },
      { status: 400 },
    );
  }

  if (entry.size > USER_STORY_PHOTO_MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Photo must be ${USER_STORY_PHOTO_MAX_BYTES / (1024 * 1024)}MB or smaller`,
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await entry.arrayBuffer());
  const filename = entry.name.trim() || `story-${storyId}.jpg`;

  try {
    const result = await uploadOwnedUserStoryPhoto({
      storyId,
      ownerId: user.id,
      file: { buffer, filename, mimeType },
    });

    if (!result) {
      return NextResponse.json(
        { error: "Story not found or you are not the owner" },
        { status: 404 },
      );
    }

    const page = await getNewsStoryPageResult(storyId, user.id);

    return NextResponse.json({
      storyId: result.storyId,
      imageUrl: result.imageUrl,
      provider: result.provider,
      bytes: result.bytes,
      story: page?.story ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload photo";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
