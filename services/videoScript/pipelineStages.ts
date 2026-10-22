/**
 * Video script pipeline stages. Each stage loads the `VideoScript` row, runs one
 * agent, persists the result and returns a small summary (large payloads stay
 * in the database, not in Inngest step output).
 *
 * A stage returns `{ ok: false, reason }` when its agent fails; the Inngest
 * function turns that into a non-retriable failure.
 */

import {
  PROMPT_VERSION as RESEARCH_BUILDER_VERSION,
  factSheetSchema,
  runResearchBuilder,
} from "@/Agents/video/researchBuilder";
import {
  PROMPT_VERSION as SCRIPT_WRITER_VERSION,
  runScriptWriter,
  scriptOptionsSchema,
  scriptOutputSchema,
} from "@/Agents/video/scriptWriter";
import {
  PROMPT_VERSION as FACT_CHECKER_VERSION,
  runFactChecker,
} from "@/Agents/video/factChecker";
import {
  PROMPT_VERSION as CREATIVE_DIRECTOR_VERSION,
  runCreativeDirector,
} from "@/Agents/video/creativeDirector";
import {
  PROMPT_VERSION as IMAGE_FINDER_VERSION,
  runImageFinder,
} from "@/Agents/video/imageFinder";
import {
  PROMPT_VERSION as GEN_PROMPTER_VERSION,
  runGenPrompter,
} from "@/Agents/video/genPrompter";
import { creativeDirectionSchema } from "@/Agents/video/creativeDirector/schema";
import type { Prisma } from "@/db/generated/client";
import {
  getVideoScriptWithStory,
  listVisualAssets,
  patchVideoScript,
  recordPromptVersions,
  replaceVisualAssets,
} from "@/repositories/videoScript";

export type StageResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; reason: string };

const json = (value: unknown) => value as Prisma.InputJsonValue;

async function loadRow(scriptId: string) {
  const row = await getVideoScriptWithStory(scriptId);
  if (!row) {
    throw new Error("Video script not found");
  }
  return row;
}

function scriptOptions(row: Awaited<ReturnType<typeof loadRow>>) {
  return scriptOptionsSchema.parse({
    language: row.language,
    minSec: row.minSec,
    maxSec: row.maxSec,
    pace: row.pace,
    aspectRatio: row.aspectRatio,
  });
}

export async function runResearchStage(scriptId: string): Promise<StageResult<{ facts: number; sources: number }>> {
  const row = await loadRow(scriptId);
  const story = row.newsStory;
  const result = await runResearchBuilder({
    story: {
      id: story.id,
      title: story.title,
      description: story.description,
      summary: story.summary,
      content: story.content,
      category: story.category,
      location: story.location,
      publishedAt: story.publishedAt?.toISOString() ?? null,
      createdAt: story.createdAt.toISOString(),
    },
    sources: story.sources.map((source) => ({
      id: source.id,
      url: source.url,
      title: source.title,
      domain: source.domain,
      scrapedContent: source.scrapedContent,
      transcript: source.transcript,
      publishedAt: source.publishedAt?.toISOString() ?? null,
    })),
    now: new Date().toISOString(),
  });
  if (result.status === "failed") {
    return { ok: false, reason: result.reason };
  }
  await patchVideoScript(scriptId, { research: json(result.data) });
  await recordPromptVersions(scriptId, { researchBuilder: RESEARCH_BUILDER_VERSION });
  return { ok: true, facts: result.data.facts.length, sources: result.data.sources.length };
}

export async function runScriptStage(scriptId: string): Promise<StageResult<{ beats: number; estimatedSec: number }>> {
  const row = await loadRow(scriptId);
  const result = await runScriptWriter({
    factSheet: factSheetSchema.parse(row.research),
    story: { title: row.newsStory.title, category: row.newsStory.category },
    options: scriptOptions(row),
  });
  if (result.status === "failed") {
    return { ok: false, reason: result.reason };
  }
  await patchVideoScript(scriptId, {
    script: json(result.data),
    estimatedSec: result.data.estimatedSec,
    lengthReason: result.data.lengthReason,
  });
  await recordPromptVersions(scriptId, { scriptWriter: SCRIPT_WRITER_VERSION });
  return { ok: true, beats: result.data.beats.length, estimatedSec: result.data.estimatedSec };
}

export async function runFactCheckStage(scriptId: string): Promise<StageResult<{ passed: boolean; estimatedSec: number }>> {
  const row = await loadRow(scriptId);
  const result = await runFactChecker({
    factSheet: factSheetSchema.parse(row.research),
    script: scriptOutputSchema.parse(row.script),
    storyTitle: row.newsStory.title,
    language: scriptOptions(row).language,
  });
  if (result.status === "failed") {
    return { ok: false, reason: result.reason };
  }
  await patchVideoScript(scriptId, {
    script: json(result.data.script),
    factCheck: json(result.data.factCheck),
    estimatedSec: result.data.script.estimatedSec,
    lengthReason: result.data.script.lengthReason,
  });
  await recordPromptVersions(scriptId, { factChecker: FACT_CHECKER_VERSION });
  return { ok: true, passed: result.data.factCheck.passed, estimatedSec: result.data.script.estimatedSec };
}

export async function runDirectionStage(scriptId: string): Promise<StageResult<{ beatsWithVisual: number; beats: number }>> {
  const row = await loadRow(scriptId);
  const options = scriptOptions(row);
  const result = await runCreativeDirector({
    script: scriptOutputSchema.parse(row.script),
    factSheet: factSheetSchema.parse(row.research),
    aspectRatio: options.aspectRatio,
    language: options.language,
  });
  if (result.status === "failed") {
    return { ok: false, reason: result.reason };
  }
  await patchVideoScript(scriptId, { direction: json(result.data) });
  await recordPromptVersions(scriptId, { creativeDirector: CREATIVE_DIRECTOR_VERSION });
  return {
    ok: true,
    beats: result.data.beats.length,
    beatsWithVisual: result.data.beats.filter((beat) => beat.needsVisual).length,
  };
}

export const MEDIA_ASSET_KINDS = ["image", "video"];
export const PROMPT_ASSET_KINDS = ["ai_image_prompt", "ai_video_prompt"];

export async function runImageStage(scriptId: string): Promise<StageResult<{ beatsSearched: number; assets: number }>> {
  const row = await loadRow(scriptId);
  const script = scriptOutputSchema.parse(row.script);
  const direction = creativeDirectionSchema.parse(row.direction);
  const scriptBeats = new Map(script.beats.map((beat) => [beat.index, beat]));

  const result = await runImageFinder({
    aspectRatio: scriptOptions(row).aspectRatio,
    beats: direction.beats
      .filter((beat) => beat.needsVisual)
      .map((beat) => ({
        index: beat.index,
        overlayType: beat.overlayType,
        searchQueries: beat.searchQueries,
        spokenText: scriptBeats.get(beat.index)?.spokenText ?? "",
        onScreenText: scriptBeats.get(beat.index)?.onScreenText,
      })),
  });
  if (result.status === "failed") {
    return { ok: false, reason: result.reason };
  }

  const assets = result.data.beats.flatMap((beat) =>
    beat.candidates.map((candidate) => ({
      beatIndex: beat.index,
      kind: candidate.kind,
      source: candidate.source,
      url: candidate.url,
      previewUrl: candidate.previewUrl,
      pageUrl: candidate.pageUrl,
      title: candidate.title,
      rank: candidate.rank,
      meta: json({
        relevance: candidate.relevance,
        site: candidate.site,
        width: candidate.width,
        height: candidate.height,
        durationSec: candidate.durationSec,
        query: candidate.query,
        overlayType: beat.overlayType,
      }),
    })),
  );
  await replaceVisualAssets(scriptId, MEDIA_ASSET_KINDS, assets);
  await recordPromptVersions(scriptId, { imageFinder: IMAGE_FINDER_VERSION });
  return { ok: true, beatsSearched: result.data.beats.length, assets: assets.length };
}

/** Beat indexes with at least one media candidate that is not rated low. */
async function beatsWithGoodMedia(scriptId: string): Promise<Set<number>> {
  const assets = await listVisualAssets(scriptId);
  const good = new Set<number>();
  for (const asset of assets) {
    const relevance = (asset.meta as { relevance?: string } | null)?.relevance;
    if (MEDIA_ASSET_KINDS.includes(asset.kind) && relevance !== "low") {
      good.add(asset.beatIndex);
    }
  }
  return good;
}

export async function runPromptStage(scriptId: string): Promise<StageResult<{ beatsWithPrompts: number; prompts: number }>> {
  const row = await loadRow(scriptId);
  const script = scriptOutputSchema.parse(row.script);
  const direction = creativeDirectionSchema.parse(row.direction);
  const scriptBeats = new Map(script.beats.map((beat) => [beat.index, beat]));
  const good = await beatsWithGoodMedia(scriptId);

  const result = await runGenPrompter({
    aspectRatio: scriptOptions(row).aspectRatio,
    factSheet: factSheetSchema.parse(row.research),
    beats: direction.beats.map((beat) => ({
      index: beat.index,
      overlayType: beat.overlayType,
      needsVisual: beat.needsVisual,
      preferGenerative: beat.preferGenerative,
      goodResult: good.has(beat.index),
      spokenText: scriptBeats.get(beat.index)?.spokenText ?? "",
      editorNote: beat.editorNote,
    })),
  });
  if (result.status === "failed") {
    return { ok: false, reason: result.reason };
  }

  const assets = result.data.beats.flatMap((beat) =>
    beat.prompts.map((prompt, rank) => ({
      beatIndex: beat.index,
      kind: prompt.kind === "image" ? "ai_image_prompt" : "ai_video_prompt",
      prompt: prompt.prompt,
      rank,
      meta: json({
        negativePrompt: prompt.negativePrompt ?? null,
        style: prompt.style,
        aspectRatio: prompt.aspectRatio,
        durationSec: prompt.durationSec ?? null,
        cameraMove: prompt.cameraMove ?? null,
        notes: prompt.notes,
      }),
    })),
  );
  await replaceVisualAssets(scriptId, PROMPT_ASSET_KINDS, assets);
  await recordPromptVersions(scriptId, { genPrompter: GEN_PROMPTER_VERSION });
  return { ok: true, beatsWithPrompts: result.data.beats.length, prompts: assets.length };
}
