/**
 * scriptWriter — turns the FactSheet into a timed, talking-head script.
 *
 * Length comes from content, never padded: thin (≤ 6 strong facts) ~60–75s,
 * normal ~90–120s, rich up to ~140s, all clamped to [minSec, maxSec]. The LLM
 * writes beats; timing, word counts and the soft-limit trim are deterministic.
 */

import { runVideoAgent, type AgentResult } from "@/Agents/video/shared/agentResult";
import {
  defaultVideoGenerate,
  resolveVideoModel,
  type VideoGenerate,
} from "@/Agents/video/shared/llm";
import {
  CTA_MAX_SEC,
  HOOK_MAX_SEC,
  MAX_SEC_TOLERANCE,
  timeBeats,
  totalWords,
  wordsPerSecond,
} from "@/Agents/video/shared/timing";
import { countWords } from "@/Agents/video/shared/numbers";
import type { FactSheet } from "@/Agents/video/researchBuilder/schema";
import { buildLengthRetryPrompt, buildScriptWriterSystemPrompt, PROMPT_VERSION } from "./prompt";
import {
  FINANCE_DISCLAIMER,
  scriptDraftSchema,
  scriptOutputSchema,
  scriptWriterInputSchema,
  type Beat,
  type ScriptDraft,
  type ScriptOptions,
  type ScriptOutput,
  type ScriptWriterInput,
} from "./schema";

export { PROMPT_VERSION };
export * from "./schema";

export const THIN_STORY_MAX_STRONG_FACTS = 6;
export const RICH_STORY_MIN_STRONG_FACTS = 16;
const MIN_BEATS = 8;
const MAX_BEATS = 18;
/** Below this share of the target minimum, ask once for a longer draft. */
export const SHORT_DRAFT_RATIO = 0.95;
export const MAX_LENGTH_RETRIES = 2;
const TARGET_WORDS_PER_BEAT = 22;

export type LengthPlan = {
  band: "thin" | "normal" | "rich";
  minSec: number;
  maxSec: number;
  strongFacts: number;
};

/** Strong = high confidence and not mere context. */
export function planLength(factSheet: FactSheet, options: ScriptOptions): LengthPlan {
  const strongFacts = factSheet.facts.filter(
    (fact) => fact.confidence === "high" && fact.type !== "context",
  ).length;
  const [band, lo, hi]: [LengthPlan["band"], number, number] =
    strongFacts <= THIN_STORY_MAX_STRONG_FACTS
      ? ["thin", 60, 75]
      : strongFacts >= RICH_STORY_MIN_STRONG_FACTS
        ? ["rich", 120, 140]
        : ["normal", 90, 120];
  const maxSec = Math.min(hi, options.maxSec);
  const minSec = Math.min(Math.max(lo, options.minSec), maxSec);
  return { band, minSec, maxSec, strongFacts };
}

function firstWords(text: string, count: number): string {
  return text.trim().split(/\s+/).slice(0, count).join(" ");
}

/**
 * Deterministic post-processing: clean fields, drop unknown fact ids, time the
 * beats, and trim optional beats (from the end) past the soft limit.
 */
export function finaliseScript(
  draft: ScriptDraft,
  factSheet: FactSheet,
  options: ScriptOptions,
  plan: LengthPlan,
): ScriptOutput {
  const wps = wordsPerSecond(options.language, options.pace);
  const knownFacts = new Set(factSheet.facts.map((fact) => fact.id));

  let beats: Omit<Beat, "index" | "startSec" | "endSec">[] = draft.beats
    .filter((beat) => beat.spokenText.trim())
    .map((beat) => {
      const factIds = [...new Set(beat.factIds)].filter((id) => knownFacts.has(id));
      const onScreen = beat.onScreenText?.trim();
      return {
        spokenText: beat.spokenText.trim(),
        ...(onScreen ? { onScreenText: firstWords(onScreen, 6) } : {}),
        kind: beat.kind === "fact" && factIds.length > 0 ? "fact" : "explain",
        factIds,
        priority: beat.priority,
        ...(beat.cutNote?.trim() ? { cutNote: beat.cutNote.trim() } : {}),
      };
    });

  const limitWords = options.maxSec * (1 + MAX_SEC_TOLERANCE) * wps;
  const trimmed: string[] = [];
  while (totalWords(beats) > limitWords && beats.length > MIN_BEATS) {
    // Never cut the hook (first) or CTA (last).
    let cut = -1;
    for (let i = beats.length - 2; i >= 1; i -= 1) {
      if (beats[i].priority === "optional") {
        cut = i;
        break;
      }
    }
    if (cut < 0) {
      break;
    }
    trimmed.push(beats[cut].spokenText);
    beats = beats.filter((_, i) => i !== cut);
  }

  // Hook must fit HOOK_MAX_SEC: swap in the first hook option that does.
  let hookOptions = draft.hookOptions.map((hook) => hook.trim());
  const hookLimitWords = Math.floor(HOOK_MAX_SEC * wps);
  if (beats[0] && countWords(beats[0].spokenText) > hookLimitWords) {
    const fitting = hookOptions.findIndex((hook) => hook && countWords(hook) <= hookLimitWords);
    if (fitting >= 0) {
      const longHook = beats[0].spokenText;
      beats[0] = { ...beats[0], spokenText: hookOptions[fitting] };
      hookOptions = hookOptions.map((hook, i) => (i === fitting ? longHook : hook));
    }
  }

  const timed = timeBeats(beats, wps);
  const wordCount = totalWords(beats);
  const estimatedSec = Math.round(wordCount / wps);

  const reasonParts = [
    `${plan.band} story (${plan.strongFacts} strong facts) → target ${plan.minSec}–${plan.maxSec}s`,
    `${wordCount} words at ${wps} words/sec ≈ ${estimatedSec}s`,
  ];
  if (trimmed.length > 0) {
    reasonParts.push(`${trimmed.length} optional beat(s) dropped to stay near the ${options.maxSec}s limit`);
  }
  if (estimatedSec > options.maxSec * (1 + MAX_SEC_TOLERANCE)) {
    reasonParts.push(`still over the ${options.maxSec}s soft limit; cut optional beats while editing`);
  }
  const hookSec = (timed[0]?.endSec ?? 0) - (timed[0]?.startSec ?? 0);
  if (hookSec > HOOK_MAX_SEC) {
    reasonParts.push(`hook runs ${hookSec}s (> ${HOOK_MAX_SEC}s); consider a shorter hook option`);
  }

  const cta = draft.cta.trim() || timed.at(-1)?.spokenText || "";
  return {
    title: draft.title.trim(),
    hookOptions,
    beats: timed,
    cta,
    wordCount,
    estimatedSec,
    lengthReason: reasonParts.join("; "),
    wordsPerSecond: wps,
    ...(factSheet.isFinance ? { disclaimer: FINANCE_DISCLAIMER } : {}),
  };
}

export type ScriptWriterDeps = { generate?: VideoGenerate; model?: string };

export function createScriptWriter(deps: ScriptWriterDeps = {}) {
  const generate = deps.generate ?? defaultVideoGenerate;

  return async function scriptWriter(
    rawInput: ScriptWriterInput,
  ): Promise<AgentResult<ScriptOutput>> {
    return runVideoAgent(
      "scriptWriter",
      { input: scriptWriterInputSchema, output: scriptOutputSchema },
      rawInput,
      async ({ factSheet, story, options }) => {
        const plan = planLength(factSheet, options);
        const wps = wordsPerSecond(options.language, options.pace);

        const targetWordsMin = Math.round(plan.minSec * wps);
        const targetWordsMax = Math.round(plan.maxSec * wps);
        const targetWords = (targetWordsMin + targetWordsMax) / 2;
        const beatCount = Math.min(MAX_BEATS, Math.max(MIN_BEATS, Math.round(targetWords / TARGET_WORDS_PER_BEAT)));
        const system = buildScriptWriterSystemPrompt({
          language: options.language,
          targetWordsMin,
          targetWordsMax,
          beatCount,
          wordsPerBeat: Math.round(targetWords / beatCount),
          hookMaxWords: Math.floor(HOOK_MAX_SEC * wps),
          ctaMaxWords: Math.floor(CTA_MAX_SEC * wps),
          isFinance: factSheet.isFinance,
        });
        const extraContext = {
          category: story.category,
          aspectRatio: options.aspectRatio,
          factSheet: {
            facts: factSheet.facts.map(({ id, text, type, value, speaker, confidence }) => ({
              id,
              text,
              type,
              value: value ?? null,
              speaker: speaker ?? null,
              confidence,
            })),
            whatHappened: factSheet.whatHappened,
            whatChanged: factSheet.whatChanged,
            whyItMatters: factSheet.whyItMatters,
            whoIsAffected: factSheet.whoIsAffected,
            openQuestions: factSheet.openQuestions,
            conflicts: factSheet.conflicts,
          },
        };
        const request = (prompt: string, context: Record<string, unknown>) =>
          generate({
            model: resolveVideoModel(deps.model),
            system,
            prompt,
            extraContext: context,
            schemaName: "VideoScriptDraft",
            schemaDescription: "Talking-head video script beats grounded in the fact sheet.",
            output: scriptDraftSchema,
            temperature: 0.4,
            maxOutputTokens: 6_000,
          });

        let draft = await request(`Write the video script for: ${story.title}`, extraContext);
        for (let attempt = 0; attempt < MAX_LENGTH_RETRIES; attempt += 1) {
          const draftWords = totalWords(draft.beats);
          if (draftWords >= targetWordsMin * SHORT_DRAFT_RATIO) {
            break;
          }
          const used = new Set(draft.beats.flatMap((beat) => beat.factIds));
          const retry = await request(
            buildLengthRetryPrompt({
              wordCount: draftWords,
              targetWordsMin,
              targetWordsMax,
              unusedFactIds: factSheet.facts.map((fact) => fact.id).filter((id) => !used.has(id)),
            }),
            { ...extraContext, previousDraft: draft },
          );
          if (totalWords(retry.beats) <= draftWords) {
            break;
          }
          draft = retry;
        }

        return finaliseScript(draft, factSheet, options, plan);
      },
    );
  };
}

export const runScriptWriter = createScriptWriter();
