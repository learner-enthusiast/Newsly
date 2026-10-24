import type { Prisma } from "@/db/generated/client";
import { prisma } from "@/db";
import {
  groupAssetsByBeat,
  videoScriptStatusSchema,
  type VideoScriptPayload,
  type VideoScriptStatus,
} from "@/services/videoScript/videoScriptTypes";
import { z } from "zod";

const newsStoryIdSchema = z.uuid("newsStoryId must be a uuid");
const scriptIdSchema = z.string().min(1, "scriptId is required");
const userIdSchema = z.string().min(1, "userId is required");

const createVideoScriptSchema = z.object({
  newsId: newsStoryIdSchema,
  userId: userIdSchema,
  language: z.string().min(1),
  minSec: z.number().int(),
  maxSec: z.number().int(),
  pace: z.string().min(1),
  aspectRatio: z.string().min(1),
});

export async function createVideoScript(
  input: z.input<typeof createVideoScriptSchema>,
) {
  const data = createVideoScriptSchema.parse(input);
  return prisma.videoScript.create({ data: { ...data, status: "queued" } });
}

export async function findLatestVideoScriptForUser(
  newsId: string,
  userId: string,
) {
  return prisma.videoScript.findFirst({
    where: {
      newsId: newsStoryIdSchema.parse(newsId),
      userId: userIdSchema.parse(userId),
    },
    orderBy: { createdAt: "desc" },
    include: { assets: { orderBy: [{ beatIndex: "asc" }, { rank: "asc" }] } },
  });
}

/** Max cards on the scripts page (one per story). */
export const VIDEO_SCRIPT_LIST_LIMIT = 100;

/**
 * The user's latest script per story, newest first — the same row the story's
 * script page shows. Story fields are what the list card renders.
 */
export async function listLatestVideoScriptsForUser(userId: string) {
  const rows = await prisma.videoScript.findMany({
    where: { userId: userIdSchema.parse(userId) },
    orderBy: { createdAt: "desc" },
    distinct: ["newsId"],
    select: {
      id: true,
      newsId: true,
      status: true,
      error: true,
      language: true,
      pace: true,
      aspectRatio: true,
      maxSec: true,
      estimatedSec: true,
      script: true,
      createdAt: true,
      updatedAt: true,
      newsStory: {
        select: {
          title: true,
          description: true,
          category: true,
          location: true,
          imageUrl: true,
        },
      },
    },
  });
  return rows.slice(0, VIDEO_SCRIPT_LIST_LIMIT);
}

export type VideoScriptListRow = Awaited<
  ReturnType<typeof listLatestVideoScriptsForUser>
>[number];

export async function getVideoScriptById(scriptId: string) {
  return prisma.videoScript.findUnique({
    where: { id: scriptIdSchema.parse(scriptId) },
  });
}

export async function setVideoScriptStatus(
  scriptId: string,
  status: VideoScriptStatus,
) {
  return prisma.videoScript.update({
    where: { id: scriptIdSchema.parse(scriptId) },
    data: { status: videoScriptStatusSchema.parse(status), error: null },
  });
}

export async function markVideoScriptFailed(scriptId: string, error: string) {
  return prisma.videoScript.update({
    where: { id: scriptIdSchema.parse(scriptId) },
    data: { status: "failed", error: error.slice(0, 4000) },
  });
}

type VideoScriptWithAssets = NonNullable<
  Awaited<ReturnType<typeof findLatestVideoScriptForUser>>
>;

export function serializeVideoScript(
  row: VideoScriptWithAssets,
): VideoScriptPayload {
  const { assets, createdAt, updatedAt, userId: _userId, ...rest } = row;
  const parsedStatus = videoScriptStatusSchema.safeParse(rest.status);
  return {
    ...rest,
    status: parsedStatus.success ? parsedStatus.data : "failed",
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    assetsByBeat: groupAssetsByBeat(
      assets.map(({ scriptId: _scriptId, ...asset }) => asset),
    ),
  };
}

export async function getVideoScriptWithStory(scriptId: string) {
  return prisma.videoScript.findUnique({
    where: { id: scriptIdSchema.parse(scriptId) },
    include: {
      newsStory: {
        include: { sources: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
}

export type VideoScriptPatch = Prisma.VideoScriptUpdateInput;

export async function patchVideoScript(scriptId: string, data: VideoScriptPatch) {
  return prisma.videoScript.update({
    where: { id: scriptIdSchema.parse(scriptId) },
    data,
  });
}

/** Merges `{ agentName: version }` into `promptVersions`. */
export async function recordPromptVersions(
  scriptId: string,
  versions: Record<string, string>,
) {
  const row = await getVideoScriptById(scriptId);
  const current =
    row?.promptVersions && typeof row.promptVersions === "object" && !Array.isArray(row.promptVersions)
      ? (row.promptVersions as Record<string, string>)
      : {};
  await patchVideoScript(scriptId, { promptVersions: { ...current, ...versions } });
}

export async function replaceVisualAssets(
  scriptId: string,
  kinds: string[],
  assets: Array<Omit<Prisma.VisualAssetCreateManyInput, "scriptId">>,
) {
  const id = scriptIdSchema.parse(scriptId);
  await prisma.$transaction([
    prisma.visualAsset.deleteMany({ where: { scriptId: id, kind: { in: kinds } } }),
    prisma.visualAsset.createMany({ data: assets.map((asset) => ({ ...asset, scriptId: id })) }),
  ]);
}

export async function listVisualAssets(scriptId: string) {
  return prisma.visualAsset.findMany({
    where: { scriptId: scriptIdSchema.parse(scriptId) },
    orderBy: [{ beatIndex: "asc" }, { rank: "asc" }],
  });
}
