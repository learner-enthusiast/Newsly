/**
 * YouTube video selection agent (pre-transcript)
 *
 * What it does: Ranks YouTube SERP video metadata for a news/research prompt and
 * returns 0–4 video IDs (plus rank/score/reason) for a separate transcript pipeline.
 * Does not fetch transcripts or call Serp/Firecrawl.
 *
 * Input: prompt; videos (≤10 Serp YouTube rows).
 *
 * Output: selectedVideos ordered by rank.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

const MAX_VIDEOS_IN = 10;
const MAX_SELECTED = 4;

const youtubeChannelSchema = z.looseObject({
  name: z.string().optional(),
  link: z.string().optional(),
  verified: z.boolean().optional(),
  thumbnail: z.string().optional(),
});

const youtubeThumbnailSchema = z.looseObject({
  static: z.string().optional(),
});

/** Serp YouTube `video_results` row shape (all fields optional). */
export const youtubeVideoSearchResultSchema = z.looseObject({
  position_on_page: z.number().optional(),
  title: z.string().optional(),
  link: z.string().optional(),
  serpapi_link: z.string().optional(),
  video_id: z.string().optional(),
  watching: z.number().optional(),
  live: z.boolean().optional(),
  channel: youtubeChannelSchema.optional(),
  description: z.string().optional(),
  extensions: z.array(z.string()).optional(),
  thumbnail: youtubeThumbnailSchema.optional(),
});

export type YoutubeVideoSearchResult = z.infer<
  typeof youtubeVideoSearchResultSchema
>;

export const youtubeVideoAgentParamsSchema = z.object({
  prompt: z.string().min(1).max(8_000),
  videos: z.array(youtubeVideoSearchResultSchema).max(MAX_VIDEOS_IN),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type YoutubeVideoAgentParams = z.input<
  typeof youtubeVideoAgentParamsSchema
> & {
  abortSignal?: AbortSignal;
};

export const youtubeVideoSelectionSchema = z.object({
  selectedVideos: z
    .array(
      z.object({
        videoId: z.string().min(1),
        rank: z.number().int().min(1).max(MAX_SELECTED),
        relevanceScore: z.number().int().min(1).max(10),
        reason: z.string().min(1).max(400),
      }),
    )
    .max(MAX_SELECTED),
});

export type YoutubeVideoSelection = z.infer<typeof youtubeVideoSelectionSchema>;

const youtubeVideoModelOutputSchema = z.object({
  selectedVideos: z
    .array(
      z.object({
        videoId: z.string().min(1),
        rank: z.number().int().min(1).max(MAX_SELECTED),
        relevanceScore: z.number().int().min(1).max(10),
        reason: z.string().min(1).max(400),
      }),
    )
    .max(MAX_SELECTED),
});

type ModelPick = z.infer<
  typeof youtubeVideoModelOutputSchema
>["selectedVideos"][number];

export type IndexedYoutubeVideo = YoutubeVideoSearchResult & {
  videoId: string;
};

function resolveYoutubeVideoModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.YOUTUBE_VIDEO_AGENT_MODEL ??
      process.env.RESEARCH_ARTICLE_SELECTOR_MODEL,
  );
}

/** Parse `v=` from watch URLs or youtu.be paths. */
export function extractYoutubeVideoId(
  row: YoutubeVideoSearchResult,
): string | null {
  const fromField = row.video_id?.trim();
  if (fromField) {
    return fromField;
  }

  const link = row.link?.trim();
  if (!link) {
    return null;
  }

  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    if (host.includes("youtube.com")) {
      const v = url.searchParams.get("v")?.trim();
      if (v) {
        return v;
      }
      const shorts = /^\/shorts\/([^/?#]+)/.exec(url.pathname);
      if (shorts?.[1]) {
        return shorts[1];
      }
    }
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").split("/")[0]?.trim();
      return id || null;
    }
  } catch {
    return null;
  }

  return null;
}

/** Dedupe by video id, drop rows without id, cap at 10. */
export function indexYoutubeSearchResults(
  videos: YoutubeVideoSearchResult[],
): IndexedYoutubeVideo[] {
  const parsed = z.array(youtubeVideoSearchResultSchema).parse(videos);
  const byId = new Map<string, IndexedYoutubeVideo>();

  for (const row of parsed) {
    const videoId = extractYoutubeVideoId(row);
    if (!videoId || byId.has(videoId)) {
      continue;
    }
    byId.set(videoId, { ...row, videoId });
    if (byId.size >= MAX_VIDEOS_IN) {
      break;
    }
  }

  return [...byId.values()];
}

function trimDescription(value: string | undefined, max = 400): string | null {
  if (!value?.trim()) {
    return null;
  }
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function normalizeYoutubeVideoSelection(
  picks: ModelPick[],
  allowedIds: Set<string>,
): YoutubeVideoSelection {
  const best = new Map<string, ModelPick>();

  for (const pick of picks) {
    const videoId = pick.videoId.trim();
    if (!allowedIds.has(videoId)) {
      continue;
    }

    const existing = best.get(videoId);
    if (!existing || pick.rank < existing.rank) {
      best.set(videoId, pick);
    }
  }

  const ordered = [...best.values()].sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    return right.relevanceScore - left.relevanceScore;
  });

  const selectedVideos = ordered.slice(0, MAX_SELECTED).map((pick, index) => ({
    videoId: pick.videoId.trim(),
    rank: index + 1,
    relevanceScore: pick.relevanceScore,
    reason: pick.reason.trim(),
  }));

  return youtubeVideoSelectionSchema.parse({ selectedVideos });
}

function buildSystemPrompt(): string {
  return [
    "You select YouTube videos for NEWS DISCOVERY before transcripts are fetched.",
    "You only see Serp metadata (title, description, channel, extensions, live, watching, position).",
    "You cannot know what is said inside a video. Do not extract or invent facts from videos.",
    "Do not fetch transcripts, scrape YouTube, or call external tools.",
    "",
    "Goal: pick up to 4 video IDs (prefer 3–4 when enough strong matches exist) whose transcripts",
    "are most likely to help answer the user's news/research prompt.",
    "If only 0–2 videos are genuinely relevant, return fewer. Never pad with irrelevant picks.",
    "Never return more than 4. Order selectedVideos by rank (1 = best).",
    "",
    "PRIMARY criterion: relevance of metadata to the supplied prompt (topic, geography, date hints).",
    "relevanceScore 1–10 reflects usefulness for the prompt, not accuracy, channel fame, or views.",
    "",
    "EXCLUDE or score 1–3 for general news prompts when the video is mainly:",
    "stock picks, stocks to buy/sell/watch, target prices, intraday/options calls, trading setups,",
    "multibagger tips, portfolio advice, or generic investing/trading tutorials.",
    "",
    "INCLUDE legitimate news coverage: daily market wrap, closing bell, business/economic roundups,",
    "breaking event coverage, RBI/policy/market developments — even when stocks are mentioned.",
    "",
    "Date: prefer metadata that aligns with dates in the prompt; do not invent upload dates.",
    "Treat \"today\" in titles cautiously unless context matches the prompt date.",
    "",
    "Live streams: useful when they match the prompt date/topic; do not prefer generic 24/7 streams",
    "over specific daily news when the latter fits better.",
    "watching count and position_on_page are weak signals only — relevance dominates.",
    "Verified channels are a minor signal; never select solely because a channel is verified.",
    "",
    "Prefer useful diversity when scores are close (wrap vs closing vs broader business news),",
    "but never pick a less relevant video for artificial variety.",
    "",
    "Use only videoId values from the candidate list. Do not invent IDs.",
    "reason: one short sentence why this video is worth fetching a transcript.",
  ].join("\n");
}

function outputTokenBudget(candidateCount: number): number {
  return Math.min(4096, Math.max(800, candidateCount * 200));
}

async function runYoutubeVideoSelection(
  params: YoutubeVideoAgentParams,
  generate: typeof aiClient.generate,
): Promise<YoutubeVideoSelection & { model: string }> {
  const { abortSignal, ...rawParams } = params;
  const parsed = youtubeVideoAgentParamsSchema.parse(rawParams);
  const indexed = indexYoutubeSearchResults(parsed.videos);

  if (indexed.length === 0) {
    return { selectedVideos: [], model: resolveYoutubeVideoModel(parsed.model) };
  }

  const allowedIds = new Set(indexed.map((row) => row.videoId));
  const model = resolveYoutubeVideoModel(parsed.model);

  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: parsed.prompt.trim(),
    extraContext: {
      maxSelect: MAX_SELECTED,
      candidates: indexed.map((row) => ({
        videoId: row.videoId,
        position_on_page: row.position_on_page ?? null,
        title: row.title ?? null,
        link: row.link ?? null,
        watching: row.watching ?? null,
        live: row.live ?? null,
        channel: row.channel
          ? {
              name: row.channel.name ?? null,
              verified: row.channel.verified ?? null,
            }
          : null,
        description: trimDescription(row.description),
        extensions: row.extensions ?? null,
      })),
    },
    schemaName: "YoutubeVideoSelection",
    schemaDescription:
      "Up to 4 YouTube video IDs ranked for transcript retrieval on a news research prompt.",
    output: youtubeVideoModelOutputSchema,
    temperature: 0,
    maxOutputTokens: outputTokenBudget(indexed.length),
    abortSignal,
  });

  const selection = normalizeYoutubeVideoSelection(raw.selectedVideos, allowedIds);
  return { ...selection, model };
}

export function createYoutubeVideoAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function youtubeVideoAgent(
    params: YoutubeVideoAgentParams,
  ): Promise<YoutubeVideoSelection & { model: string }> {
    return runYoutubeVideoSelection(params, client.generate.bind(client));
  };
}

/** Rank Serp YouTube results and return the best video IDs for transcript fetch (metadata only). */
export async function runYoutubeVideoAgent(
  params: YoutubeVideoAgentParams,
): Promise<YoutubeVideoSelection & { model: string }> {
  return runYoutubeVideoSelection(params, aiClient.generate.bind(aiClient));
}
