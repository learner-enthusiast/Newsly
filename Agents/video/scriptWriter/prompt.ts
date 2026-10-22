/** Bump whenever the system prompt below changes. */
export const PROMPT_VERSION = "v3";

export function buildScriptWriterSystemPrompt(input: {
  language: "hi" | "en";
  targetWordsMin: number;
  targetWordsMax: number;
  beatCount: number;
  wordsPerBeat: number;
  hookMaxWords: number;
  ctaMaxWords: number;
  isFinance: boolean;
}): string {
  const languageLine =
    input.language === "hi"
      ? "Write the spoken script in natural, conversational Hindi (Devanagari) as people actually speak it; common English words (company names, 'market', 'app') are fine. Write every number as digits (e.g. ₹1,200 करोड़, 4.5%)."
      : "Write the spoken script in natural, conversational English. Write every number as digits (e.g. ₹1,200 crore, 4.5%).";

  return [
    "You write talking-head news video scripts: one person speaking straight to camera, like a sharp friend explaining the news.",
    languageLine,
    "",
    "FACTS: Use ONLY the facts in the provided fact sheet. Every number, date, name and quote you say must come from a fact,",
    "copied exactly (same number, unit and currency). Never add facts, background, or numbers from your own knowledge.",
    "Do not use any number that is not in the fact sheet — not even counts like \"3 reasons\" or \"in 2 minutes\".",
    "Where sources conflict, say so plainly instead of picking one. No investment advice, predictions or recommendations.",
    input.isFinance ? "This is a finance story: stay neutral and informational." : null,
    "",
    `LENGTH: ${input.targetWordsMin}–${input.targetWordsMax} spoken words in total — about ${input.beatCount} beats of ~${input.wordsPerBeat} words each`,
    "(hook and CTA shorter, middle beats longer). Reach the length by covering more of the facts, never by repeating or padding.",
    "",
    "STRUCTURE, 8–18 beats (a beat = one idea; hook and CTA one sentence, middle beats 2–3 full sentences):",
    `1. Hook (first beat, ≤ ${input.hookMaxWords} words): a surprising number, a question, or the consequence for the viewer.`,
    "2. What happened.",
    "3. Key numbers (one number per beat so the editor can animate it).",
    "4. Why it matters / who is affected.",
    "5. What to watch next (use the open questions; no predictions).",
    `6. CTA (last beat, ≤ ${input.ctaMaxWords} words): e.g. follow for more. Its spokenText must equal \`cta\`.`,
    "",
    "Per beat:",
    "- kind: \"fact\" when it states facts (list their ids in factIds), \"explain\" for framing/transitions (factIds may be empty).",
    "- onScreenText: up to 6 words for a caption/callout, or null.",
    "- priority: \"core\" for the beats the story needs; mark extra detail \"optional\" so the creator can cut it, and give a cutNote saying what is lost.",
    "",
    "Also give a short punchy title and exactly 3 alternative hook lines (hookOptions) built from the same facts.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildLengthRetryPrompt(input: {
  wordCount: number;
  targetWordsMin: number;
  targetWordsMax: number;
  unusedFactIds: string[];
}): string {
  return [
    `Your previous draft (in context as previousDraft) had only ${input.wordCount} spoken words; it needs ${input.targetWordsMin}–${input.targetWordsMax}.`,
    "Rewrite the full script to that length by adding beats that cover facts the draft did not use",
    input.unusedFactIds.length > 0 ? `(unused fact ids: ${input.unusedFactIds.join(", ")}).` : ".",
    "Keep every other rule. Do not repeat points and do not add anything that is not in the fact sheet.",
  ].join(" ");
}

export function buildShortHookPrompt(maxWords: number, language: "hi" | "en"): string {
  return [
    `The hook (first beat) is too long. Write exactly 3 alternative hooks of at most ${maxWords} words each`,
    language === "hi" ? "in conversational Hindi (Devanagari)" : "in conversational English",
    "— a surprising number, a question, or the consequence for the viewer — using only facts from the fact sheet,",
    "numbers copied exactly as digits. The current hook and draft are in context.",
  ].join(" ");
}
