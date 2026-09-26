import {
  extractTopYoutubeVideoResults,
  fetchYoutubeTranscriptsByVideoIds,
  youtubeWatchUrl,
} from "@/services/news/youtubeResearch";
import {
  youtubeVideoSearchResultSchema,
  type YoutubeVideoSearchResult,
} from "@/Agents/news/YoutubeVideoAgent";
import { serpEngines } from "@/SERP/index";

export const CHAT_YOUTUBE_MAX_VIDEOS = 3;
export const CHAT_YOUTUBE_TRANSCRIPT_MAX_CHARS = 12_000;

export type ChatYoutubeEvidenceRow = {
  url: string;
  domain: string;
  title: string;
  sourceType: "youtube";
  content: string;
};

function videoIdFromRow(row: YoutubeVideoSearchResult): string | null {
  const direct = row.video_id?.trim();
  if (direct) {
    return direct;
  }
  const link = row.link?.trim();
  if (!link) {
    return null;
  }
  try {
    const parsed = new URL(link);
    const fromQuery = parsed.searchParams.get("v")?.trim();
    if (fromQuery) {
      return fromQuery;
    }
    if (parsed.hostname.includes("youtu.be")) {
      const slug = parsed.pathname.replace(/^\//, "").trim();
      return slug || null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Top Serp YouTube rows by position — no extra LLM selection (chat fast path). */
export function pickChatYoutubeVideoIds(
  payload: unknown,
  maxVideos = CHAT_YOUTUBE_MAX_VIDEOS,
): Array<{ videoId: string; title: string }> {
  const candidates = extractTopYoutubeVideoResults(payload, 8);
  const picked: Array<{ videoId: string; title: string }> = [];
  const seen = new Set<string>();

  for (const row of candidates) {
    const parsed = youtubeVideoSearchResultSchema.safeParse(row);
    if (!parsed.success) {
      continue;
    }
    const videoId = videoIdFromRow(parsed.data);
    if (!videoId || seen.has(videoId)) {
      continue;
    }
    seen.add(videoId);
    const title =
      parsed.data.title?.trim() || `YouTube video ${videoId}`;
    picked.push({ videoId, title });
    if (picked.length >= maxVideos) {
      break;
    }
  }

  return picked;
}

function truncateTranscript(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  const head = Math.floor(maxChars * 0.65);
  const tail = maxChars - head - 40;
  return `${trimmed.slice(0, head)}\n\n…[transcript truncated]…\n\n${trimmed.slice(-tail)}`;
}

/** One targeted YouTube Serp search → up to 3 transcripts as chat evidence. */
export async function fetchChatYoutubeEvidence(input: {
  researchPrompt: string;
  abortSignal?: AbortSignal;
}): Promise<ChatYoutubeEvidenceRow[]> {
  try {
    const payload = await serpEngines.searchYoutube.fn({
      search_query: input.researchPrompt,
      num: 10,
    });

    const videos = pickChatYoutubeVideoIds(payload);
    if (videos.length === 0) {
      return [];
    }

    const transcripts = await fetchYoutubeTranscriptsByVideoIds(
      videos.map((row) => row.videoId),
    );

    const byId = new Map(transcripts.map((row) => [row.videoId, row]));
    const rows: ChatYoutubeEvidenceRow[] = [];

    for (const video of videos) {
      const transcriptRow = byId.get(video.videoId);
      const transcript = transcriptRow?.transcript?.trim();
      if (!transcript) {
        continue;
      }
      const title =
        transcriptRow?.title?.trim() || video.title;
      rows.push({
        url: youtubeWatchUrl(video.videoId),
        domain: "youtube.com",
        title,
        sourceType: "youtube",
        content: truncateTranscript(
          transcript,
          CHAT_YOUTUBE_TRANSCRIPT_MAX_CHARS,
        ),
      });
    }

    return rows;
  } catch {
    return [];
  }
}
