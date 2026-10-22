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
import type { Prisma } from "@/db/generated/client";
import {
  getVideoScriptWithStory,
  patchVideoScript,
  recordPromptVersions,
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
