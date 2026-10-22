/**
 * imageFinder — finds candidate media for image / logo / b-roll beats.
 *
 * image & logo: SerpApi Google Images → Google Images Light → Bing Images, moving
 * to the next engine only while fewer than 3 usable results; Pexels photos last
 * (only with PEXELS_API_KEY). video_broll: Pexels Videos, else skipped.
 * ≤ 6 candidates per beat; an LLM ranks them from text metadata; top 4 kept.
 * URLs only — nothing is downloaded.
 */

import { createCallBudget, type CallBudget } from "@/clients/callTool";
import { runVideoAgent, type AgentResult } from "@/Agents/video/shared/agentResult";
import {
  defaultVideoGenerate,
  resolveVideoModel,
  type VideoGenerate,
} from "@/Agents/video/shared/llm";
import {
  defaultVideoTools,
  type ImageEngine,
  type ImageHit,
  type VideoHit,
  type VideoTools,
} from "@/services/videoScript/videoTools";
import { IMAGE_RANKER_SYSTEM_PROMPT, PROMPT_VERSION } from "./prompt";
import {
  imageFinderInputSchema,
  imageFinderOutputSchema,
  rankingSchema,
  type BeatMedia,
  type ImageFinderInput,
  type ImageFinderOutput,
  type MediaCandidate,
} from "./schema";

export { PROMPT_VERSION };
export * from "./schema";

export const IMAGE_ENGINES: ImageEngine[] = ["google_images", "google_images_light", "bing_images"];
export const MIN_USABLE_RESULTS = 3;
export const MAX_CANDIDATES = 6;
export const KEEP_CANDIDATES = 4;
/** Searches allowed per run (cache hits are free). */
export const IMAGE_CALL_BUDGET = 40;
const MIN_IMAGE_SIDE = 200;

type Candidate = Omit<MediaCandidate, "relevance" | "rank">;

function isUsableImage(hit: ImageHit): boolean {
  if (!/^https?:\/\//i.test(hit.url)) {
    return false;
  }
  if (hit.width != null && hit.height != null && Math.min(hit.width, hit.height) < MIN_IMAGE_SIDE) {
    return false;
  }
  return true;
}

function fromImage(hit: ImageHit, query: string): Candidate {
  return {
    kind: "image",
    source: hit.source,
    url: hit.url,
    previewUrl: hit.previewUrl,
    pageUrl: hit.pageUrl,
    title: hit.title,
    site: hit.site,
    width: hit.width,
    height: hit.height,
    durationSec: null,
    query,
  };
}

function fromVideo(hit: VideoHit, query: string): Candidate {
  return {
    kind: "video",
    source: "pexels",
    url: hit.url,
    previewUrl: hit.previewUrl,
    pageUrl: hit.pageUrl,
    title: hit.title,
    site: "Pexels",
    width: null,
    height: null,
    durationSec: hit.durationSec,
    query,
  };
}

/**
 * Image beats try queries in order until 3 usable results. Logo beats usually
 * name several companies (one query each), so every query is searched and the
 * candidate slots are shared between them.
 */
async function searchImageBeat(
  queries: string[],
  isLogo: boolean,
  orientation: "portrait" | "landscape",
  tools: VideoTools,
  budget: CallBudget,
): Promise<{ candidates: Candidate[]; searched: string[] }> {
  const candidates: Candidate[] = [];
  const searched: string[] = [];
  const seen = new Set<string>();
  const perQuery = isLogo ? Math.max(1, Math.floor(MAX_CANDIDATES / Math.max(1, queries.length))) : MAX_CANDIDATES;
  const perQueryCount = new Map<string, number>();
  const add = (hits: ImageHit[], query: string) => {
    for (const hit of hits) {
      if (candidates.length >= MAX_CANDIDATES || (perQueryCount.get(query) ?? 0) >= perQuery) {
        return;
      }
      if (isUsableImage(hit) && !seen.has(hit.url)) {
        seen.add(hit.url);
        perQueryCount.set(query, (perQueryCount.get(query) ?? 0) + 1);
        candidates.push(fromImage(hit, query));
      }
    }
  };

  const satisfied = (query: string) =>
    isLogo ? (perQueryCount.get(query) ?? 0) >= Math.min(perQuery, MIN_USABLE_RESULTS) : candidates.length >= MIN_USABLE_RESULTS;
  for (const engine of IMAGE_ENGINES) {
    for (const query of queries) {
      if (satisfied(query)) {
        continue;
      }
      searched.push(`${engine}: ${query}`);
      add(await tools.searchImages(engine, query, budget), query);
    }
    if (queries.every(satisfied)) {
      break;
    }
  }
  // Stock photos never stand in for a logo.
  if (!isLogo && candidates.length < MIN_USABLE_RESULTS && tools.pexelsEnabled() && queries[0]) {
    searched.push(`pexels: ${queries[0]}`);
    add(await tools.searchPexelsPhotos(queries[0], orientation, budget), queries[0]);
  }
  return { candidates, searched };
}

export type ImageFinderDeps = {
  generate?: VideoGenerate;
  tools?: VideoTools;
  budget?: CallBudget;
  model?: string;
};

export function createImageFinder(deps: ImageFinderDeps = {}) {
  const generate = deps.generate ?? defaultVideoGenerate;
  const tools = deps.tools ?? defaultVideoTools;

  return async function imageFinder(
    rawInput: ImageFinderInput,
  ): Promise<AgentResult<ImageFinderOutput>> {
    return runVideoAgent(
      "imageFinder",
      { input: imageFinderInputSchema, output: imageFinderOutputSchema },
      rawInput,
      async ({ beats, aspectRatio }) => {
        const budget = deps.budget ?? createCallBudget(IMAGE_CALL_BUDGET);
        const orientation = aspectRatio === "9:16" ? "portrait" : "landscape";

        const found = await Promise.all(
          beats.map(async (beat) => {
            const queries = beat.searchQueries.map((q) => q.trim()).filter(Boolean);
            if (beat.overlayType === "video_broll") {
              if (!tools.pexelsEnabled()) {
                return { beat, candidates: [] as Candidate[], searched: [], skipped: "PEXELS_API_KEY not set" };
              }
              const query = queries[0] ?? "";
              const hits = query ? await tools.searchPexelsVideos(query, orientation, budget) : [];
              return {
                beat,
                candidates: hits.slice(0, MAX_CANDIDATES).map((hit) => fromVideo(hit, query)),
                searched: query ? [`pexels videos: ${query}`] : [],
              };
            }
            if (beat.overlayType !== "image" && beat.overlayType !== "logo") {
              return null;
            }
            return {
              beat,
              ...(await searchImageBeat(queries, beat.overlayType === "logo", orientation, tools, budget)),
            };
          }),
        );
        const searchedBeats = found.filter((row): row is NonNullable<typeof row> => row != null);

        // One LLM call ranks every beat's candidates (text metadata only).
        let ranking: Map<number, Array<{ candidate: number; relevance: "high" | "medium" | "low" }>> | null = null;
        const toRank = searchedBeats.filter((row) => row.candidates.length > 0);
        if (toRank.length > 0) {
          try {
            const result = await generate({
              model: resolveVideoModel(deps.model),
              system: IMAGE_RANKER_SYSTEM_PROMPT,
              prompt: "Rank the candidates for each beat.",
              extraContext: {
                aspectRatio,
                beats: toRank.map((row) => ({
                  index: row.beat.index,
                  overlayType: row.beat.overlayType,
                  spokenText: row.beat.spokenText,
                  onScreenText: row.beat.onScreenText ?? null,
                  candidates: row.candidates.map((c, i) => ({
                    candidate: i,
                    kind: c.kind,
                    title: c.title,
                    site: c.site,
                    pageUrl: c.pageUrl,
                    width: c.width,
                    height: c.height,
                    durationSec: c.durationSec,
                  })),
                })),
              },
              schemaName: "VideoImageRanking",
              schemaDescription: "Candidate order and relevance per beat.",
              output: rankingSchema,
              temperature: 0,
              maxOutputTokens: 3_000,
            });
            ranking = new Map(result.beats.map((row) => [row.index, row.ranked]));
          } catch (error) {
            console.warn("[imageFinder] ranking failed; keeping engine order", error);
          }
        }

        const out: BeatMedia[] = searchedBeats.map((row) => {
          const order = ranking?.get(row.beat.index);
          let ranked: MediaCandidate[];
          if (order) {
            const used = new Set<number>();
            const picks = order.filter(({ candidate }) => {
              const ok = candidate >= 0 && candidate < row.candidates.length && !used.has(candidate);
              used.add(candidate);
              return ok;
            });
            ranked = picks.map(({ candidate, relevance }) => ({ ...row.candidates[candidate], relevance, rank: 0 }));
            // Anything the ranker skipped goes last as low.
            row.candidates.forEach((c, i) => {
              if (!used.has(i)) ranked.push({ ...c, relevance: "low", rank: 0 });
            });
          } else {
            ranked = row.candidates.map((c) => ({ ...c, relevance: "unranked" as const, rank: 0 }));
          }
          const kept = ranked.slice(0, KEEP_CANDIDATES).map((c, rank) => ({ ...c, rank }));
          return {
            index: row.beat.index,
            overlayType: row.beat.overlayType,
            candidates: kept,
            goodResult: kept.some((c) => c.relevance !== "low"),
            searched: row.searched,
            ...("skipped" in row && row.skipped ? { skipped: row.skipped } : {}),
          };
        });

        return { beats: out, ranked: ranking != null };
      },
    );
  };
}

export const runImageFinder = createImageFinder();
