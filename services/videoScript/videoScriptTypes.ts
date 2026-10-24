import { z } from "zod";

/** Pipeline statuses, in run order. `done` / `failed` are terminal. */
export const VIDEO_SCRIPT_STATUSES = [
  "queued",
  "researching",
  "scripting",
  "fact_checking",
  "directing",
  "finding_images",
  "prompting",
  "packaging",
  "building",
  "done",
  "failed",
] as const;

export const videoScriptStatusSchema = z.enum(VIDEO_SCRIPT_STATUSES);
export type VideoScriptStatus = z.infer<typeof videoScriptStatusSchema>;

export const videoScriptLanguageSchema = z.enum(["hi", "en"]);
export const videoScriptPaceSchema = z.enum(["slow", "normal", "fast"]);
export const videoScriptAspectRatioSchema = z.enum(["9:16", "16:9"]);

export const VIDEO_SCRIPT_DEFAULT_MIN_SEC = 60;
export const VIDEO_SCRIPT_DEFAULT_MAX_SEC = 140;

/**
 * `/newsStory/[storyId]?createScript=1` opens the story with the video-script
 * options already open (newsletter "Create video script" links).
 */
export const CREATE_SCRIPT_QUERY_PARAM = "createScript";

export function storyCreateScriptPath(storyId: string): string {
  return `/newsStory/${storyId}?${CREATE_SCRIPT_QUERY_PARAM}=1`;
}

/** Body of `POST /api/news/stories/[storyId]/script`. */
export const createVideoScriptBodySchema = z.object({
  language: videoScriptLanguageSchema.default("en"),
  maxSec: z.number().int().min(30).max(180).default(VIDEO_SCRIPT_DEFAULT_MAX_SEC),
  pace: videoScriptPaceSchema.default("normal"),
  aspectRatio: videoScriptAspectRatioSchema.default("9:16"),
  regenerate: z.boolean().default(false),
});

export type CreateVideoScriptBody = z.infer<typeof createVideoScriptBodySchema>;

/** Never let the floor exceed a short max (e.g. maxSec 30). */
export function resolveMinSec(maxSec: number): number {
  return Math.min(VIDEO_SCRIPT_DEFAULT_MIN_SEC, maxSec);
}

export function isTerminalVideoScriptStatus(status: string): boolean {
  return status === "done" || status === "failed";
}

/**
 * Re-clicking reuses the latest script unless the user asked to regenerate
 * or the previous run failed.
 */
export function shouldReuseVideoScript(
  latest: { status: string } | null,
  regenerate: boolean,
): boolean {
  return latest != null && !regenerate && latest.status !== "failed";
}

/** UI stepper stages; each maps to the pipeline status that runs it. */
export const VIDEO_SCRIPT_STAGES = [
  { status: "researching", label: "Research" },
  { status: "scripting", label: "Script" },
  { status: "fact_checking", label: "Fact check" },
  { status: "directing", label: "Direction" },
  { status: "finding_images", label: "Images" },
  { status: "prompting", label: "Prompts" },
  { status: "packaging", label: "Publishing" },
  { status: "building", label: "Edit pack" },
] as const satisfies ReadonlyArray<{
  status: VideoScriptStatus;
  label: string;
}>;

export type VideoScriptStageState = "pending" | "active" | "complete";

/** Stage state for the stepper. `queued` / `failed` show every stage pending. */
export function resolveStageStates(status: string): VideoScriptStageState[] {
  if (status === "done") {
    return VIDEO_SCRIPT_STAGES.map(() => "complete");
  }
  const activeIndex = VIDEO_SCRIPT_STAGES.findIndex(
    (stage) => stage.status === status,
  );
  return VIDEO_SCRIPT_STAGES.map((_, index) => {
    if (activeIndex < 0) {
      return "pending";
    }
    if (index < activeIndex) {
      return "complete";
    }
    return index === activeIndex ? "active" : "pending";
  });
}

export type VisualAssetPayload = {
  id: string;
  beatIndex: number;
  kind: string;
  source: string | null;
  url: string | null;
  previewUrl: string | null;
  pageUrl: string | null;
  title: string | null;
  prompt: string | null;
  meta: unknown;
  rank: number;
};

export type VideoScriptPayload = {
  id: string;
  newsId: string;
  status: VideoScriptStatus;
  error: string | null;
  language: string;
  minSec: number;
  maxSec: number;
  pace: string;
  aspectRatio: string;
  estimatedSec: number | null;
  lengthReason: string | null;
  research: unknown;
  script: unknown;
  factCheck: unknown;
  direction: unknown;
  publishing: unknown;
  editPack: unknown;
  recordingBrief: string | null;
  renderPrompt: string | null;
  promptVersions: unknown;
  createdAt: string;
  updatedAt: string;
  /** Keyed by beat index. */
  assetsByBeat: Record<string, VisualAssetPayload[]>;
};

export type VideoScriptResponse = { videoScript: VideoScriptPayload | null };

export function groupAssetsByBeat(
  assets: VisualAssetPayload[],
): Record<string, VisualAssetPayload[]> {
  const grouped: Record<string, VisualAssetPayload[]> = {};
  for (const asset of [...assets].sort((a, b) => a.rank - b.rank)) {
    (grouped[String(asset.beatIndex)] ??= []).push(asset);
  }
  return grouped;
}
