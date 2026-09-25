import {
  runYoutubeTranscriptAgent,
  type YoutubeTranscriptAnalysis,
} from "@/Agents/news/YoutubeTranscriptAgent";
import {
  runYoutubeVideoAgent,
  youtubeVideoSearchResultSchema,
  type YoutubeVideoSearchResult,
  type YoutubeVideoSelection,
} from "@/Agents/news/YoutubeVideoAgent";
import { serpEngines } from "@/SERP/index";

const DEFAULT_TOP_VIDEOS = 10;

/** First N `video_results` rows from a YouTube Serp payload. */
export function extractTopYoutubeVideoResults(
  payload: unknown,
  limit = DEFAULT_TOP_VIDEOS,
): YoutubeVideoSearchResult[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const videoResults = (payload as { video_results?: unknown }).video_results;
  if (!Array.isArray(videoResults)) {
    return [];
  }

  const rows: YoutubeVideoSearchResult[] = [];
  for (const row of videoResults.slice(0, limit)) {
    const parsed = youtubeVideoSearchResultSchema.safeParse(row);
    if (parsed.success) {
      rows.push(parsed.data);
    }
  }
  return rows;
}

export async function selectYoutubeVideosForNewsResearch(input: {
  prompt: string;
  youtubeSerpPayload: unknown;
  abortSignal?: AbortSignal;
}): Promise<YoutubeVideoSelection & { model: string; candidateCount: number }> {
  const videos = extractTopYoutubeVideoResults(input.youtubeSerpPayload);
  const selection = await runYoutubeVideoAgent({
    prompt: input.prompt,
    videos,
    abortSignal: input.abortSignal,
  });
  return { ...selection, candidateCount: videos.length };
}

export type YoutubeTranscriptFetchRow = {
  videoId: string;
  title: string | null;
  language: string | null;
  transcript: string | null;
  raw: unknown;
};

/** Join Serp `youtube_video_transcript` segments into plain text. */
export function transcriptTextFromSerpPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const segments = record.transcript;
  if (!Array.isArray(segments) || segments.length === 0) {
    return null;
  }

  const parts: string[] = [];
  for (const segment of segments) {
    if (!segment || typeof segment !== "object") {
      continue;
    }
    const row = segment as Record<string, unknown>;
    const text =
      (typeof row.snippet === "string" && row.snippet.trim()) ||
      (typeof row.text === "string" && row.text.trim()) ||
      "";
    if (text) {
      parts.push(text);
    }
  }

  const joined = parts.join(" ").trim();
  return joined.length > 0 ? joined : null;
}

function titleFromTranscriptPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const title = (payload as { title?: unknown }).title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function languageFromTranscriptPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const language = (payload as { language?: unknown }).language;
  return typeof language === "string" && language.trim() ? language.trim() : null;
}

/** Fetch transcripts for every video id in parallel via Serp `youtube_video_transcript`. */
export async function fetchYoutubeTranscriptsByVideoIds(
  videoIds: string[],
): Promise<YoutubeTranscriptFetchRow[]> {
  const unique = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return [];
  }

  const payloads = await Promise.all(
    unique.map((videoId) =>
      serpEngines.searchYoutubeVideoTranscript
        .fn({ v: videoId })
        .catch(() => null),
    ),
  );

  return unique.map((videoId, index) => {
    const raw = payloads[index];
    return {
      videoId,
      title: raw ? titleFromTranscriptPayload(raw) : null,
      language: raw ? languageFromTranscriptPayload(raw) : null,
      transcript: raw ? transcriptTextFromSerpPayload(raw) : null,
      raw,
    };
  });
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId.trim())}`;
}

export function buildYoutubeArticlesForSynthesizer(input: {
  transcripts: Array<{
    videoId: string;
    title: string | null;
    transcript: string | null;
  }>;
  synthesis?: {
    overview: string;
    facts: Array<{
      videoId: string;
      fact: string;
      detailedContext: string;
      weight: number;
    }>;
  };
}): Array<{
  url: string;
  domain: string;
  title: string;
  sourceType: string;
  scrapedContent: string;
  transcript: string | null;
  isPrimaryStorySource: false;
}> {
  const factsByVideo = new Map<string, string[]>();
  for (const row of input.synthesis?.facts ?? []) {
    const block = `[weight ${row.weight}] ${row.fact}\n${row.detailedContext}`;
    const list = factsByVideo.get(row.videoId) ?? [];
    list.push(block);
    factsByVideo.set(row.videoId, list);
  }

  const overview = input.synthesis?.overview?.trim() ?? "";

  return input.transcripts
    .filter((row) => row.transcript?.trim())
    .map((row) => {
      const factBlocks = factsByVideo.get(row.videoId) ?? [];
      const scrapedContent = [
        overview ? `Overview: ${overview}` : "",
        ...factBlocks,
        row.transcript!.trim().slice(0, 12_000),
      ]
        .filter(Boolean)
        .join("\n\n");

      return {
        url: youtubeWatchUrl(row.videoId),
        domain: "youtube.com",
        title: row.title?.trim() || `YouTube ${row.videoId}`,
        sourceType: "youtube",
        scrapedContent,
        transcript: row.transcript!.trim().slice(0, 50_000),
        isPrimaryStorySource: false as const,
      };
    });
}

export type YoutubeTranscriptAnalysisRow = {
  videoId: string;
  title: string | null;
  analysis: YoutubeTranscriptAnalysis & { model: string };
};

/** Run YoutubeTranscriptAgent on each non-empty transcript in parallel. */
export async function analyzeYoutubeTranscriptsInParallel(input: {
  prompt: string;
  transcripts: YoutubeTranscriptFetchRow[];
  abortSignal?: AbortSignal;
}): Promise<YoutubeTranscriptAnalysisRow[]> {
  const jobs = input.transcripts.filter(
    (row): row is YoutubeTranscriptFetchRow & { transcript: string } =>
      typeof row.transcript === "string" && row.transcript.trim().length > 0,
  );

  if (jobs.length === 0) {
    return [];
  }

  const analyses = await Promise.all(
    jobs.map((row) =>
      runYoutubeTranscriptAgent({
        transcript: row.transcript,
        prompt: input.prompt,
        abortSignal: input.abortSignal,
      }),
    ),
  );

  return jobs.map((row, index) => ({
    videoId: row.videoId,
    title: row.title,
    analysis: analyses[index]!,
  }));
}
