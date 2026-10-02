import { canonicalResearchUrl } from "@/services/chat/normalizeSerpResults";
import { extractYoutubeVideoId } from "@/services/news/newsRerunKnownSources";

export function articleResourceId(url: string): string {
  const key = canonicalResearchUrl(url);
  return key ? `article:${key}` : `article:${url}`;
}

export function youtubeResourceId(videoId: string): string {
  return `youtube:${videoId}`;
}

export function youtubeResourceIdFromUrl(url: string): string | null {
  const videoId = extractYoutubeVideoId(url);
  return videoId ? youtubeResourceId(videoId) : null;
}
