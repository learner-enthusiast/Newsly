import type { VideoScriptListRow } from "@/repositories/videoScript";
import {
  isTerminalVideoScriptStatus,
  VIDEO_SCRIPT_STAGES,
} from "@/services/videoScript/videoScriptTypes";

/** One card on `/scripts`; links to the story's script page. */
export type VideoScriptListItem = {
  id: string;
  storyId: string;
  href: string;
  storyTitle: string;
  storyDescription: string | null;
  storyCategory: string;
  storyLocation: string | null;
  storyImageUrl: string | null;
  /** Script headline once the writer stage has run. */
  scriptTitle: string | null;
  hook: string | null;
  beatCount: number | null;
  status: string;
  statusLabel: string;
  statusTone: "ready" | "running" | "failed";
  error: string | null;
  language: string;
  pace: string;
  aspectRatio: string;
  /** Estimated runtime when known, else the requested max. */
  durationSec: number;
  durationIsEstimate: boolean;
  createdAt: string;
  updatedAt: string;
};

const LANGUAGE_LABELS: Record<string, string> = { en: "English", hi: "Hindi" };

export function videoScriptLanguageLabel(language: string): string {
  return LANGUAGE_LABELS[language] ?? language;
}

/** "Ready" / "Failed" / the running stage's label ("Fact check…"). */
export function videoScriptStatusLabel(status: string): string {
  if (status === "done") {
    return "Ready";
  }
  if (status === "failed") {
    return "Failed";
  }
  if (status === "queued") {
    return "Queued";
  }
  const stage = VIDEO_SCRIPT_STAGES.find((item) => item.status === status);
  return stage ? `${stage.label}…` : "In progress";
}

function readScriptSummary(script: unknown): {
  title: string | null;
  hook: string | null;
  beatCount: number | null;
} {
  if (!script || typeof script !== "object" || Array.isArray(script)) {
    return { title: null, hook: null, beatCount: null };
  }
  const value = script as {
    title?: unknown;
    hookOptions?: unknown;
    beats?: unknown;
  };
  const title =
    typeof value.title === "string" && value.title.trim()
      ? value.title.trim()
      : null;
  const firstHook = Array.isArray(value.hookOptions)
    ? value.hookOptions.find(
        (hook): hook is string => typeof hook === "string" && hook.trim() !== "",
      )
    : undefined;
  return {
    title,
    hook: firstHook?.trim() ?? null,
    beatCount: Array.isArray(value.beats) ? value.beats.length : null,
  };
}

export function toVideoScriptListItem(
  row: VideoScriptListRow,
): VideoScriptListItem {
  const summary = readScriptSummary(row.script);
  const statusTone =
    row.status === "done"
      ? "ready"
      : row.status === "failed" || !isKnownStatus(row.status)
        ? "failed"
        : "running";
  return {
    id: row.id,
    storyId: row.newsId,
    href: `/newsStory/${row.newsId}/script`,
    storyTitle: row.newsStory.title,
    storyDescription: row.newsStory.description?.trim() || null,
    storyCategory: row.newsStory.category,
    storyLocation: row.newsStory.location?.trim() || null,
    storyImageUrl: row.newsStory.imageUrl?.trim() || null,
    scriptTitle: summary.title,
    hook: summary.hook,
    beatCount: summary.beatCount,
    status: row.status,
    statusLabel: videoScriptStatusLabel(row.status),
    statusTone,
    error: row.status === "failed" ? row.error : null,
    language: row.language,
    pace: row.pace,
    aspectRatio: row.aspectRatio,
    durationSec: row.estimatedSec ?? row.maxSec,
    durationIsEstimate: row.estimatedSec != null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isKnownStatus(status: string): boolean {
  return (
    isTerminalVideoScriptStatus(status) ||
    status === "queued" ||
    VIDEO_SCRIPT_STAGES.some((stage) => stage.status === status)
  );
}
