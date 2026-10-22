/**
 * publishingKit — titles, thumbnail concepts + background prompts, platform
 * descriptions, hashtags and a pinned comment.
 *
 * Guards: titles / thumbnail text may only use numbers and quoted words that
 * the final script contains; thumbnail prompts pass the genPrompter safety
 * guard. The YouTube description's Sources (FactSheet URLs), Chapters
 * placeholder and finance disclaimer are added deterministically.
 */

import { runVideoAgent, type AgentResult } from "@/Agents/video/shared/agentResult";
import {
  defaultVideoGenerate,
  resolveVideoModel,
  type VideoGenerate,
} from "@/Agents/video/shared/llm";
import {
  extractNumbers,
  extractQuotedSpans,
  normaliseQuoteText,
  splitSentences,
  unsupportedNumbers,
} from "@/Agents/video/shared/numbers";
import { blockedNames, isSafePrompt } from "@/Agents/video/genPrompter";
import { FINANCE_DISCLAIMER, type ScriptOutput } from "@/Agents/video/scriptWriter/schema";
import type { FactSheet } from "@/Agents/video/researchBuilder/schema";
import { buildPublishingKitSystemPrompt, PROMPT_VERSION } from "./prompt";
import {
  publishingDraftSchema,
  publishingKitInputSchema,
  publishingKitSchema,
  THUMBNAIL_SIZE,
  type PublishingDraft,
  type PublishingKit,
  type PublishingKitInput,
} from "./schema";

export { PROMPT_VERSION };
export * from "./schema";

export const X_MAX_CHARS = 280;
export const CHAPTERS_PLACEHOLDER = "Chapters:\n0:00 (filled in after editing)";

function scriptText(script: ScriptOutput): string {
  return [script.title, ...script.hookOptions, ...script.beats.flatMap((b) => [b.spokenText, b.onScreenText ?? ""])].join("\n");
}

/** Numbers and quoted words must already be in the script. */
export function claimsOnlyScript(text: string, script: ScriptOutput): boolean {
  const body = scriptText(script);
  if (unsupportedNumbers(text, extractNumbers(body)).length > 0) {
    return false;
  }
  const normalisedBody = normaliseQuoteText(body);
  return extractQuotedSpans(text).every((span) => normalisedBody.includes(normaliseQuoteText(span)));
}

/** Drops sentences (line by line) that claim more than the script; logs them. */
export function keepScriptClaims(text: string, script: ScriptOutput, dropped: string[], label: string): string {
  return text
    .split("\n")
    .map((line) =>
      splitSentences(line)
        .filter((sentence) => {
          const ok = claimsOnlyScript(sentence, script);
          if (!ok) dropped.push(`${label}: ${sentence}`);
          return ok;
        })
        .join(" "),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function normaliseHashtag(tag: string): string | null {
  const body = tag.trim().replace(/^#+/, "").replace(/[\s#]+/g, "");
  return body ? `#${body}` : null;
}

function sourceUrls(factSheet: FactSheet): string[] {
  return [...new Set(factSheet.sources.filter((s) => s.origin !== "story").map((s) => s.url))];
}

export function buildYoutubeDescription(
  draft: PublishingDraft,
  factSheet: FactSheet,
  script: ScriptOutput,
  dropped: string[],
): string {
  const parts = [keepScriptClaims(draft.descriptions.youtubeSummary, script, dropped, "youtube summary") || script.title];
  const points = draft.descriptions.youtubeKeyPoints
    .map((p) => p.trim())
    .filter((p) => {
      const ok = Boolean(p) && claimsOnlyScript(p, script);
      if (!ok && p) dropped.push(`key point: ${p}`);
      return ok;
    });
  if (points.length > 0) {
    parts.push(`Key points:\n${points.map((p) => `• ${p}`).join("\n")}`);
  }
  const urls = sourceUrls(factSheet);
  if (urls.length > 0) {
    parts.push(`Sources:\n${urls.join("\n")}`);
  }
  parts.push(CHAPTERS_PLACEHOLDER);
  if (factSheet.isFinance) {
    parts.push(FINANCE_DISCLAIMER);
  }
  return parts.join("\n\n");
}

export function finalisePublishingKit(
  draft: PublishingDraft,
  input: { script: ScriptOutput; factSheet: FactSheet; aspectRatio: "9:16" | "16:9" },
): PublishingKit {
  const { script, factSheet } = input;
  const dropped: string[] = [];

  const titles = draft.titles
    .map((t) => ({ text: t.text.replace(/\s*#[\p{L}\p{N}_]+/gu, "").trim(), style: t.style }))
    .filter((t) => {
      const ok = Boolean(t.text) && claimsOnlyScript(t.text, script);
      if (!ok && t.text) dropped.push(`title: ${t.text}`);
      return ok;
    })
    .map((t) => ({ ...t, charCount: [...t.text].length }));
  if (titles.length === 0) {
    titles.push({ text: script.title, style: "direct", charCount: [...script.title].length });
  }

  const concepts = draft.thumbnail.concepts
    .map((c) => ({
      idea: c.idea.trim(),
      textOverlay: c.textOverlay.trim().split(/\s+/).slice(0, 4).join(" "),
      layout: c.layout.trim(),
    }))
    .filter((c) => {
      const ok = claimsOnlyScript(`${c.idea}\n${c.textOverlay}`, script);
      if (!ok) dropped.push(`thumbnail concept: ${c.textOverlay}`);
      return ok;
    });
  if (concepts.length === 0) {
    concepts.push({
      idea: "Creator's face beside the main subject of the story.",
      textOverlay: script.title.split(/\s+/).slice(0, 4).join(" "),
      layout: "Face on the right third, text on the left.",
    });
  }

  const names = blockedNames(factSheet);
  const openaiPrompts = draft.thumbnail.openaiPrompts
    .map((p) => ({ prompt: p.prompt.trim(), size: THUMBNAIL_SIZE[input.aspectRatio], notes: p.notes.trim() }))
    .filter((p) => {
      const ok = Boolean(p.prompt) && isSafePrompt(p.prompt, names);
      if (!ok && p.prompt) dropped.push(`thumbnail prompt: ${p.prompt}`);
      return ok;
    });

  const disclaimer = factSheet.isFinance ? `\n\n${FINANCE_DISCLAIMER}` : "";
  const xBase = keepScriptClaims(draft.descriptions.x, script, dropped, "x") || script.title;
  const shorts = keepScriptClaims(draft.descriptions.shorts, script, dropped, "shorts");
  const instagram = keepScriptClaims(draft.descriptions.instagram, script, dropped, "instagram");
  const youtube = buildYoutubeDescription(draft, factSheet, script, dropped);
  const xWithDisclaimer = factSheet.isFinance ? `${xBase} ${FINANCE_DISCLAIMER}` : xBase;

  const hashtags = [
    ...new Set(draft.hashtags.map(normaliseHashtag).filter((tag): tag is string => tag != null)),
  ].slice(0, 10);

  return {
    titles: titles.slice(0, 5),
    thumbnail: {
      concepts: concepts.slice(0, 3),
      openaiPrompts,
      tips: draft.thumbnail.tips.map((tip) => tip.trim()).filter(Boolean),
    },
    descriptions: {
      youtube,
      shorts: shorts.split(/\n+/).slice(0, 2).join("\n") || script.title,
      instagram: `${instagram || script.title}${disclaimer}`,
      x: truncateAtWord(xWithDisclaimer.length <= X_MAX_CHARS ? xWithDisclaimer : xBase || script.title, X_MAX_CHARS),
    },
    hashtags,
    pinnedComment:
      keepScriptClaims(draft.pinnedComment, script, dropped, "pinned comment") ||
      "What do you think? Tell us in the comments.",
    dropped,
  };
}

export type PublishingKitDeps = { generate?: VideoGenerate; model?: string };

export function createPublishingKit(deps: PublishingKitDeps = {}) {
  const generate = deps.generate ?? defaultVideoGenerate;

  return async function publishingKit(
    rawInput: PublishingKitInput,
  ): Promise<AgentResult<PublishingKit>> {
    return runVideoAgent(
      "publishingKit",
      { input: publishingKitInputSchema, output: publishingKitSchema },
      rawInput,
      async ({ script, factSheet, direction, language, aspectRatio }) => {
        const draft = await generate({
          model: resolveVideoModel(deps.model),
          system: buildPublishingKitSystemPrompt({ language, aspectRatio, isFinance: factSheet.isFinance }),
          prompt: `Write the publishing kit for: ${script.title}`,
          extraContext: {
            script: {
              title: script.title,
              hookOptions: script.hookOptions,
              beats: script.beats.map((beat) => beat.spokenText),
              cta: script.cta,
            },
            look: {
              colorTreatment: direction.global.colorTreatment,
              hookTreatment: direction.global.hookTreatment,
            },
          },
          schemaName: "VideoPublishingKit",
          schemaDescription: "Titles, thumbnail ideas, descriptions, hashtags and pinned comment.",
          output: publishingDraftSchema,
          temperature: 0.6,
          maxOutputTokens: 4_000,
        });
        return finalisePublishingKit(draft, { script, factSheet, aspectRatio });
      },
    );
  };
}

export const runPublishingKit = createPublishingKit();
