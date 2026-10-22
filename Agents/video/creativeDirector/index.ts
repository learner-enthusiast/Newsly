/**
 * creativeDirector — per-beat overlay + editing direction and a global look.
 * The LLM applies the craft rules; post-processing guarantees one direction per
 * beat, search queries only where media is searched, and no generative logos.
 */

import { runVideoAgent, type AgentResult } from "@/Agents/video/shared/agentResult";
import {
  defaultVideoGenerate,
  resolveVideoModel,
  type VideoGenerate,
} from "@/Agents/video/shared/llm";
import { extractNumbers, unsupportedNumbers } from "@/Agents/video/shared/numbers";
import type { FactSheet } from "@/Agents/video/researchBuilder/schema";
import type { ScriptOutput } from "@/Agents/video/scriptWriter/schema";
import { buildCreativeDirectorSystemPrompt, PROMPT_VERSION } from "./prompt";
import {
  creativeDirectionSchema,
  creativeDirectorInputSchema,
  directionDraftSchema,
  SEARCHABLE_OVERLAYS,
  type BeatDirection,
  type CreativeDirection,
  type CreativeDirectorInput,
  type DirectionDraft,
} from "./schema";

export { PROMPT_VERSION };
export * from "./schema";

const clean = (value: string | null | undefined) => value?.trim() || undefined;

function speakerOnly(index: number): BeatDirection {
  return {
    index,
    needsVisual: false,
    overlayType: "none",
    searchQueries: [],
    preferGenerative: false,
    editing: { transitionIn: "cut", transitionOut: "cut", motion: "none", speakerFraming: "normal" },
    editorNote: "Speaker only.",
  };
}

/** Fallback query when the director chose a searchable overlay but gave none. */
function fallbackQuery(beat: ScriptOutput["beats"][number], overlay: string): string[] {
  const basis = beat.onScreenText ?? beat.spokenText.split(/\s+/).slice(0, 8).join(" ");
  return basis ? [overlay === "logo" ? `${basis} official logo` : basis] : [];
}

export const UNCHECKED_FIGURES_NOTE = "(Check figures against the fact sheet.)";

export function finaliseDirection(
  draft: DirectionDraft,
  script: ScriptOutput,
  factSheet: FactSheet,
): CreativeDirection {
  const allowed = factSheet.facts.flatMap((fact) => extractNumbers(`${fact.text} ${fact.value ?? ""}`));
  const flagFigures = (note: string) =>
    unsupportedNumbers(note, allowed).length > 0 ? `${note} ${UNCHECKED_FIGURES_NOTE}` : note;
  const byIndex = new Map(draft.beats.map((beat) => [beat.index, beat]));
  const beats = script.beats.map((scriptBeat): BeatDirection => {
    const raw = byIndex.get(scriptBeat.index);
    if (!raw) {
      return speakerOnly(scriptBeat.index);
    }
    const searchable = SEARCHABLE_OVERLAYS.has(raw.overlayType);
    const queries = searchable
      ? [...new Set(raw.searchQueries.map((q) => q.trim()).filter(Boolean))].slice(0, 3)
      : [];
    return {
      index: scriptBeat.index,
      needsVisual: raw.overlayType !== "none",
      overlayType: raw.overlayType,
      searchQueries: searchable && queries.length === 0 ? fallbackQuery(scriptBeat, raw.overlayType) : queries,
      // Logos must be the real mark, never generated.
      preferGenerative: raw.overlayType !== "logo" && raw.overlayType !== "none" && raw.preferGenerative,
      editing: {
        transitionIn: clean(raw.editing.transitionIn) ?? "cut",
        transitionOut: clean(raw.editing.transitionOut) ?? "cut",
        motion: clean(raw.editing.motion) ?? "none",
        ...(clean(raw.editing.textAnimation) ? { textAnimation: clean(raw.editing.textAnimation) } : {}),
        speakerFraming: raw.editing.speakerFraming,
        ...(clean(raw.editing.sfx) ? { sfx: clean(raw.editing.sfx) } : {}),
        ...(clean(raw.editing.musicCue) ? { musicCue: clean(raw.editing.musicCue) } : {}),
      },
      editorNote: flagFigures(
        clean(raw.editorNote) ?? (raw.overlayType === "none" ? "Speaker only." : "See overlay."),
      ),
    };
  });

  const g = draft.global;
  return {
    beats,
    global: {
      pacing: clean(g.pacing) ?? "Tight cuts, no dead air.",
      hookTreatment: clean(g.hookTreatment) ?? "Open on the strongest visual with a punch-in.",
      subtitleStyle: clean(g.subtitleStyle) ?? "Bold, 3–4 words per line, key word highlighted.",
      colorTreatment: clean(g.colorTreatment) ?? "Natural, slightly warm.",
      musicMood: clean(g.musicMood) ?? "Low, steady news bed.",
    },
  };
}

export type CreativeDirectorDeps = { generate?: VideoGenerate; model?: string };

export function createCreativeDirector(deps: CreativeDirectorDeps = {}) {
  const generate = deps.generate ?? defaultVideoGenerate;

  return async function creativeDirector(
    rawInput: CreativeDirectorInput,
  ): Promise<AgentResult<CreativeDirection>> {
    return runVideoAgent(
      "creativeDirector",
      { input: creativeDirectorInputSchema, output: creativeDirectionSchema },
      rawInput,
      async ({ script, factSheet, aspectRatio, language }) => {
        const factById = new Map(factSheet.facts.map((fact) => [fact.id, fact]));
        const draft = await generate({
          model: resolveVideoModel(deps.model),
          system: buildCreativeDirectorSystemPrompt(aspectRatio),
          prompt: `Direct the edit for: ${script.title}`,
          extraContext: {
            language,
            aspectRatio,
            beats: script.beats.map((beat) => ({
              index: beat.index,
              startSec: beat.startSec,
              endSec: beat.endSec,
              spokenText: beat.spokenText,
              onScreenText: beat.onScreenText ?? null,
              priority: beat.priority,
              facts: beat.factIds.map((id) => {
                const fact = factById.get(id);
                return fact ? { type: fact.type, text: fact.text } : null;
              }),
            })),
          },
          schemaName: "VideoCreativeDirection",
          schemaDescription: "Per-beat overlay and editing direction plus a global look.",
          output: directionDraftSchema,
          temperature: 0.5,
          maxOutputTokens: 6_000,
        });
        return finaliseDirection(draft, script, factSheet);
      },
    );
  };
}

export const runCreativeDirector = createCreativeDirector();
