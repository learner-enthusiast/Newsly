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
