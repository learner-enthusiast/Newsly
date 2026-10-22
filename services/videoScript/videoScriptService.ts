import { enqueueVideoScriptPipeline } from "@/inngest/generateVideoScript";
import { getNewsStoryWithSourcesForPage } from "@/repositories/newsStory";
import {
  createVideoScript,
  findLatestVideoScriptForUser,
  markVideoScriptFailed,
  serializeVideoScript,
} from "@/repositories/videoScript";
import {
  resolveMinSec,
  shouldReuseVideoScript,
  type CreateVideoScriptBody,
  type VideoScriptPayload,
} from "@/services/videoScript/videoScriptTypes";
import { z } from "zod";

/** Same visibility rules as the story page. */
async function canAccessStory(storyId: string, userId: string) {
  if (!z.uuid().safeParse(storyId).success) {
    return false;
  }
  const bundle = await getNewsStoryWithSourcesForPage(storyId, userId);
  return bundle != null;
}

export async function getLatestVideoScript(input: {
  storyId: string;
  userId: string;
}): Promise<{ videoScript: VideoScriptPayload | null } | null> {
  if (!(await canAccessStory(input.storyId, input.userId))) {
    return null;
  }
  const row = await findLatestVideoScriptForUser(input.storyId, input.userId);
  return { videoScript: row ? serializeVideoScript(row) : null };
}

/**
 * Reuses the latest script for this user + story unless `regenerate` is set or
 * it failed; otherwise creates a queued row and enqueues the pipeline.
 */
export async function startVideoScript(input: {
  storyId: string;
  userId: string;
  body: CreateVideoScriptBody;
}): Promise<{ scriptId: string; reused: boolean } | null> {
  if (!(await canAccessStory(input.storyId, input.userId))) {
    return null;
  }

  const latest = await findLatestVideoScriptForUser(
    input.storyId,
    input.userId,
  );
  if (latest && shouldReuseVideoScript(latest, input.body.regenerate)) {
    return { scriptId: latest.id, reused: true };
  }

  const created = await createVideoScript({
    newsId: input.storyId,
    userId: input.userId,
    language: input.body.language,
    minSec: resolveMinSec(input.body.maxSec),
    maxSec: input.body.maxSec,
    pace: input.body.pace,
    aspectRatio: input.body.aspectRatio,
  });

  try {
    await enqueueVideoScriptPipeline({ scriptId: created.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start pipeline";
    await markVideoScriptFailed(created.id, message);
    throw error;
  }

  return { scriptId: created.id, reused: false };
}
