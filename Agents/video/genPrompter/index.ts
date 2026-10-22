/**
 * genPrompter — OPTIONAL image/video generation prompt suggestions. The
 * pipeline never generates media; these are text for the creator to copy.
 *
 * Only beats that need a visual of a searchable kind (image / b-roll) AND have
 * no good search result or a director preference for generative get prompts.
 * A deterministic guard drops prompts naming real people/companies from the
 * FactSheet or describing logos, documents or headlines.
 */

import { runVideoAgent, type AgentResult } from "@/Agents/video/shared/agentResult";
import {
  defaultVideoGenerate,
  resolveVideoModel,
  type VideoGenerate,
} from "@/Agents/video/shared/llm";
import type { FactSheet } from "@/Agents/video/researchBuilder/schema";
import { buildGenPrompterSystemPrompt, PROMPT_VERSION } from "./prompt";
import {
  genPrompterInputSchema,
  genPrompterOutputSchema,
  promptDraftSchema,
  type GenPrompt,
  type GenPrompterInput,
  type GenPrompterOutput,
} from "./schema";

export { PROMPT_VERSION };
export * from "./schema";

/** Overlay kinds a generated visual can stand in for (never logos, charts, maps). */
const GENERATIVE_OVERLAYS = new Set(["image", "video_broll"]);

export function needsGenPrompts(beat: GenPrompterInput["beats"][number]): boolean {
  return beat.needsVisual && GENERATIVE_OVERLAYS.has(beat.overlayType) && (!beat.goodResult || beat.preferGenerative);
}

const BLOCKED_PATTERNS = [
  /\blogos?\b/i,
  /\btrademark/i,
  /\bbrand(ed)? (name|mark)/i,
  /\bheadlines?\b/i,
  /\bfront page\b/i,
  /\bnewspaper\b/i,
  /\bdocuments?\b/i,
  /\bletterhead\b/i,
  /\bscreenshot/i,
  /\bofficial seal\b/i,
  /\bsignature\b/i,
];

const NAME_STOPWORDS = new Set([
  "The", "This", "That", "CEO", "CFO", "CTO", "Chief", "Officer", "President", "Minister", "Prime",
  "Company", "Inc", "Ltd", "Group", "Board", "Court", "State", "Government", "India", "Indian",
]);

/** Proper names from name facts and quote speakers (people, companies). */
export function blockedNames(factSheet: FactSheet): string[] {
  const names = new Set<string>();
  for (const fact of factSheet.facts) {
    if (fact.speaker) {
      fact.speaker.split(/\s+/).forEach((part) => names.add(part.replace(/[^\p{L}\p{N}-]/gu, "")));
    }
    if (fact.type === "name" || fact.type === "quote") {
      for (const match of fact.text.matchAll(/\b\p{Lu}[\p{L}\p{N}&.-]{2,}/gu)) {
        names.add(match[0].replace(/[.]+$/, ""));
      }
    }
  }
  return [...names].filter((name) => name.length >= 3 && !NAME_STOPWORDS.has(name));
}

export function isSafePrompt(prompt: string, names: string[]): boolean {
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return false;
  }
  return !names.some((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(prompt));
}

export type GenPrompterDeps = { generate?: VideoGenerate; model?: string };

export function createGenPrompter(deps: GenPrompterDeps = {}) {
  const generate = deps.generate ?? defaultVideoGenerate;

  return async function genPrompter(
    rawInput: GenPrompterInput,
  ): Promise<AgentResult<GenPrompterOutput>> {
    return runVideoAgent(
      "genPrompter",
      { input: genPrompterInputSchema, output: genPrompterOutputSchema },
      rawInput,
      async ({ beats, factSheet, aspectRatio }) => {
        const selected = beats.filter(needsGenPrompts);
        if (selected.length === 0) {
          return { beats: [] };
        }
        const draft = await generate({
          model: resolveVideoModel(deps.model),
          system: buildGenPrompterSystemPrompt(aspectRatio),
          prompt: "Write optional generation prompts for these beats.",
          extraContext: {
            beats: selected.map((beat) => ({
              index: beat.index,
              overlayType: beat.overlayType,
              spokenText: beat.spokenText,
              editorNote: beat.editorNote,
            })),
          },
          schemaName: "VideoGenPrompts",
          schemaDescription: "Tool-neutral image/video prompt suggestions per beat.",
          output: promptDraftSchema,
          temperature: 0.7,
          maxOutputTokens: 4_000,
        });

        const names = blockedNames(factSheet);
        const wanted = new Set(selected.map((beat) => beat.index));
        return {
          beats: draft.beats
            .filter((row) => wanted.has(row.index))
            .map((row) => {
              const all: GenPrompt[] = [
                ...row.imagePrompts.map((p) => ({
                  kind: "image" as const,
                  prompt: p.prompt.trim(),
                  ...(p.negativePrompt?.trim() ? { negativePrompt: p.negativePrompt.trim() } : {}),
                  style: p.style.trim(),
                  aspectRatio,
                  notes: p.notes.trim(),
                })),
                ...row.videoPrompts.map((p) => ({
                  kind: "video" as const,
                  prompt: p.prompt.trim(),
                  ...(p.negativePrompt?.trim() ? { negativePrompt: p.negativePrompt.trim() } : {}),
                  style: p.style.trim(),
                  aspectRatio,
                  ...(p.durationSec != null ? { durationSec: p.durationSec } : {}),
                  ...(p.cameraMove?.trim() ? { cameraMove: p.cameraMove.trim() } : {}),
                  notes: p.notes.trim(),
                })),
              ].filter((p) => p.prompt);
              const safe = all.filter((p) => isSafePrompt(p.prompt, names));
              return { index: row.index, prompts: safe, blocked: all.length - safe.length };
            }),
        };
      },
    );
  };
}

export const runGenPrompter = createGenPrompter();
