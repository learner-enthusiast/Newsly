/**
 * factChecker — every number, date, name and quote in the script must match
 * the FactSheet.
 *
 * 1. Check: deterministic number match (₹1,200 cr = 1200 crore) + LLM audit for
 *    names / dates / quotes / unsupported events.
 * 2. Failing beats are rewritten once from FactSheet facts only, then re-checked.
 * 3. Still failing → the offending sentences are removed (whole beat if nothing
 *    is left). Facts are never added. Beats are re-timed afterwards.
 */

import { runVideoAgent, type AgentResult } from "@/Agents/video/shared/agentResult";
import {
  defaultVideoGenerate,
  resolveVideoModel,
  type VideoGenerate,
} from "@/Agents/video/shared/llm";
import {
  countWords,
  extractNumbers,
  extractQuotedSpans,
  normaliseQuoteText,
  splitSentences,
  unsupportedNumbers,
  type NumberToken,
} from "@/Agents/video/shared/numbers";
import { timeBeats, totalWords } from "@/Agents/video/shared/timing";
import type { FactSheet } from "@/Agents/video/researchBuilder/schema";
import type { Beat, ScriptOutput } from "@/Agents/video/scriptWriter/schema";
import { AUDIT_SYSTEM_PROMPT, buildRewriteSystemPrompt, PROMPT_VERSION } from "./prompt";
import {
  auditSchema,
  factCheckerInputSchema,
  factCheckerOutputSchema,
  rewriteSchema,
  type BeatCheck,
  type FactCheckerInput,
  type FactCheckerOutput,
} from "./schema";

export { PROMPT_VERSION };
export * from "./schema";

export function factSheetNumbers(factSheet: FactSheet): NumberToken[] {
  return factSheet.facts.flatMap((fact) =>
    extractNumbers(`${fact.text} ${fact.value ?? ""}`),
  );
}

type Issue = { span: string | null; problem: string };

/** A rewritten beat may be at most this much longer than the original. */
export const MAX_REWRITE_GROWTH = 1.3;

/** Rewrite indexes ≥ this are the title (base) and hook options (base + 1…). */
const EXTRA_INDEX_BASE = 1_000;
type WorkingBeat = Beat & { originalIndex: number };

function numberIssues(beat: Pick<Beat, "spokenText" | "onScreenText">, allowed: NumberToken[]): Issue[] {
  return unsupportedNumbers(`${beat.spokenText}\n${beat.onScreenText ?? ""}`, allowed).map(
    (token) => ({ span: token.raw, problem: `number "${token.raw}" is not in the fact sheet` }),
  );
}

const DEVANAGARI = /[\u0900-\u097F]/;

/**
 * Words inside quotation marks must be a verbatim excerpt of a FactSheet quote.
 * Devanagari spans are skipped: a Hindi script may translate an English quote.
 */
export function quoteIssues(text: string, quotes: string[]): Issue[] {
  return extractQuotedSpans(text)
    .filter((span) => !DEVANAGARI.test(span))
    .filter((span) => !quotes.some((quote) => quote.includes(normaliseQuoteText(span))))
    .map((span) => ({ span, problem: `quoted words "${span}" are not a verbatim quote from the fact sheet` }));
}

function deterministicIssues(
  beat: Pick<Beat, "spokenText" | "onScreenText">,
  allowed: NumberToken[],
  quotes: string[],
): Issue[] {
  return [...numberIssues(beat, allowed), ...quoteIssues(beat.spokenText, quotes)];
}

function factsForPrompt(factSheet: FactSheet) {
  return factSheet.facts.map(({ id, text, type, value, speaker }) => ({
    id,
    text,
    type,
    value: value ?? null,
    speaker: speaker ?? null,
  }));
}

/** Removes sentences containing an issue span; `null` span → drop the whole text. */
function removeClaims(text: string, issues: Issue[]): string {
  if (issues.some((issue) => !issue.span)) {
    return "";
  }
  const spans = issues.map((issue) => issue.span!.toLowerCase());
  return splitSentences(text)
    .filter((sentence) => {
      const lower = sentence.toLowerCase();
      return !spans.some((span) => lower.includes(span));
    })
    .join(" ");
}

export type FactCheckerDeps = { generate?: VideoGenerate; model?: string };

export function createFactChecker(deps: FactCheckerDeps = {}) {
  const generate = deps.generate ?? defaultVideoGenerate;

  return async function factChecker(
    rawInput: FactCheckerInput,
  ): Promise<AgentResult<FactCheckerOutput>> {
    return runVideoAgent(
      "factChecker",
      { input: factCheckerInputSchema, output: factCheckerOutputSchema },
      rawInput,
      async ({ factSheet, script, storyTitle, language }) => {
        const model = resolveVideoModel(deps.model);
        const allowed = factSheetNumbers(factSheet);
        const quotes = factSheet.facts
          .filter((fact) => fact.type === "quote" && fact.value)
          .map((fact) => normaliseQuoteText(fact.value!));
        const facts = factsForPrompt(factSheet);

        async function audit(beats: WorkingBeat[]): Promise<Map<number, Issue[]>> {
          const issues = new Map<number, Issue[]>(
            beats.map((beat) => [beat.originalIndex, deterministicIssues(beat, allowed, quotes)]),
          );
          if (beats.length === 0) {
            return issues;
          }
          const result = await generate({
            model,
            system: AUDIT_SYSTEM_PROMPT,
            prompt: "Check these script beats against the fact sheet.",
            extraContext: {
              facts,
              conflicts: factSheet.conflicts,
              beats: beats.map((beat) => ({
                index: beat.originalIndex,
                spokenText: beat.spokenText,
                onScreenText: beat.onScreenText ?? null,
              })),
            },
            schemaName: "VideoScriptAudit",
            schemaDescription: "Unsupported claims per beat.",
            output: auditSchema,
            temperature: 0,
            maxOutputTokens: 4_000,
          });
          for (const row of result.beats) {
            const list = issues.get(row.index);
            if (!list) {
              continue;
            }
            for (const issue of row.issues) {
              const span = issue.span.trim();
              list.push({ span: span || null, problem: issue.problem.trim() });
            }
          }
          return issues;
        }

        const working: WorkingBeat[] = script.beats.map((beat) => ({ ...beat, originalIndex: beat.index }));
        const firstIssues = await audit(working);
        const failing = working.filter((beat) => (firstIssues.get(beat.originalIndex) ?? []).length > 0);

        // Title and hook options are checked deterministically and, when they
        // fail, rewritten in the same call under reserved indexes.
        const textIssues = (text: string) => deterministicIssues({ spokenText: text }, allowed, quotes);
        const extras = [script.title, ...script.hookOptions]
          .map((text, i) => ({ index: EXTRA_INDEX_BASE + i, text, issues: textIssues(text) }))
          .filter((extra) => extra.issues.length > 0);
        const rewrittenExtras = new Map<number, string>();

        // One rewrite pass for failing beats.
        const rewritten = new Map<number, WorkingBeat>();
        if (failing.length > 0 || extras.length > 0) {
          const rewrite = await generate({
            model,
            system: buildRewriteSystemPrompt(language),
            prompt: "Rewrite these beats so they only use facts from the fact sheet.",
            extraContext: {
              facts,
              beats: failing.map((beat) => ({
                index: beat.originalIndex,
                spokenText: beat.spokenText,
                onScreenText: beat.onScreenText ?? null,
                issues: (firstIssues.get(beat.originalIndex) ?? []).map((issue) => issue.problem),
              })),
              titleAndHooks: extras.map((extra) => ({
                index: extra.index,
                role: extra.index === EXTRA_INDEX_BASE ? "video title" : "alternative hook line",
                spokenText: extra.text,
                issues: extra.issues.map((issue) => issue.problem),
              })),
            },
            schemaName: "VideoScriptRewrite",
            schemaDescription: "Rewritten beats using only fact-sheet facts.",
            output: rewriteSchema,
            temperature: 0,
            maxOutputTokens: 4_000,
          });
          for (const row of rewrite.beats) {
            if (row.index >= EXTRA_INDEX_BASE) {
              if (row.spokenText.trim() && textIssues(row.spokenText).length === 0) {
                rewrittenExtras.set(row.index, row.spokenText.trim());
              }
              continue;
            }
            const original = failing.find((beat) => beat.originalIndex === row.index);
            if (!original || !row.spokenText.trim()) {
              continue;
            }
            // A fix must not pad the beat; longer rewrites fall back to claim removal.
            if (countWords(row.spokenText) > countWords(original.spokenText) * MAX_REWRITE_GROWTH) {
              continue;
            }
            const onScreen = row.onScreenText?.trim();
            rewritten.set(row.index, {
              ...original,
              spokenText: row.spokenText.trim(),
              onScreenText: onScreen ? onScreen.split(/\s+/).slice(0, 6).join(" ") : undefined,
            });
          }
        }

        const recheck = await audit([...rewritten.values()]);

        const finalBeats: WorkingBeat[] = [];
        const checks: Array<Omit<BeatCheck, "index"> & { originalIndex: number }> = [];
        const removedBeats: FactCheckerOutput["factCheck"]["removedBeats"] = [];

        for (const beat of working) {
          const initial = firstIssues.get(beat.originalIndex) ?? [];
          if (initial.length === 0) {
            finalBeats.push(beat);
            checks.push({ originalIndex: beat.originalIndex, status: "ok", issues: [] });
            continue;
          }
          const candidate = rewritten.get(beat.originalIndex);
          const remaining = candidate ? (recheck.get(beat.originalIndex) ?? []) : initial;
          const problems = initial.map((issue) => issue.problem);
          if (candidate && remaining.length === 0) {
            finalBeats.push(candidate);
            checks.push({ originalIndex: beat.originalIndex, status: "fixed", issues: problems });
            continue;
          }

          const base = candidate ?? beat;
          const spokenText = removeClaims(base.spokenText, remaining);
          const onScreenIssues = numberIssues({ spokenText: "", onScreenText: base.onScreenText }, allowed);
          const allIssues = [...problems, ...remaining.map((issue) => issue.problem)];
          // Removal must leave nothing unsupported; otherwise drop the beat.
          if (!spokenText || deterministicIssues({ spokenText }, allowed, quotes).length > 0) {
            removedBeats.push({ originalIndex: beat.originalIndex, spokenText: beat.spokenText, issues: allIssues });
            continue;
          }
          finalBeats.push({
            ...base,
            spokenText,
            onScreenText: onScreenIssues.length > 0 ? undefined : base.onScreenText,
          });
          checks.push({ originalIndex: beat.originalIndex, status: "removed_claim", issues: allIssues });
        }

        const timed = timeBeats(
          finalBeats.map(({ originalIndex, ...beat }) => (void originalIndex, beat)),
          script.wordsPerSecond,
        );
        const indexByOriginal = new Map(finalBeats.map((beat, i) => [beat.originalIndex, i]));
        const wordCount = totalWords(timed);
        const estimatedSec = Math.round(wordCount / script.wordsPerSecond);

        const hook = timed[0]?.spokenText ?? "";
        const supported = (text: string) => textIssues(text).length === 0;
        const fixExtra = (text: string, index: number, fallback: string) =>
          supported(text) ? text : (rewrittenExtras.get(index) ?? fallback);
        const titleFallback = [storyTitle, timed[0]?.onScreenText ?? ""].find(
          (candidate) => candidate && supported(candidate),
        );
        const changed = checks.some((check) => check.status !== "ok") || removedBeats.length > 0;

        const finalScript: ScriptOutput = {
          ...script,
          title: fixExtra(script.title, EXTRA_INDEX_BASE, titleFallback ?? storyTitle),
          hookOptions: script.hookOptions.map((option, i) =>
            fixExtra(option, EXTRA_INDEX_BASE + 1 + i, hook),
          ),
          beats: timed,
          cta: timed.at(-1)?.spokenText ?? script.cta,
          wordCount,
          estimatedSec,
          lengthReason: changed
            ? `${script.lengthReason}; after fact check ${wordCount} words ≈ ${estimatedSec}s`
            : script.lengthReason,
        };

        const passed =
          timed.length > 0 &&
          timed.every((beat) => deterministicIssues(beat, allowed, quotes).length === 0) &&
          supported(finalScript.title) &&
          finalScript.hookOptions.every(supported);

        return {
          factCheck: {
            beats: checks.map(({ originalIndex, ...check }) => ({
              index: indexByOriginal.get(originalIndex)!,
              ...check,
            })),
            removedBeats,
            passed,
          },
          script: finalScript,
        };
      },
    );
  };
}

export const runFactChecker = createFactChecker();
