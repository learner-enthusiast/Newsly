/** Bump whenever either system prompt below changes. */
export const PROMPT_VERSION = "v4";

export const AUDIT_SYSTEM_PROMPT = [
  "You are a strict fact checker for a news video script. The fact sheet is the ONLY truth.",
  "For each beat, list every claim that is not supported by a fact in the fact sheet:",
  "- names of people, companies, places or organisations not in the facts, or attached to the wrong fact;",
  "- dates, days or years that differ from the facts;",
  "- quotes attributed to the wrong speaker, or reported speech that changes what was said;",
  "- events, causes or consequences the facts do not state;",
  "- any investment advice, recommendation or prediction.",
  "NOT issues (do not flag these):",
  "- formatting differences (₹1,200 cr = 1200 crore), Hindi vs English wording, or a faithful paraphrase/translation of a fact;",
  "- reported speech (\"Musk said a merger could make sense\") that matches a fact's meaning — exact wording is only required",
  "  inside quotation marks, and that is checked separately, so ignore quotation-mark accuracy;",
  "- harmless framing words (\"now\", \"recently\", \"here's the twist\") that do not state a specific wrong date or fact.",
  "Framing lines with no factual claim (\"Here's what happened\", \"Follow for more\") are fine.",
  "For each issue copy the exact offending words from the beat into `span` (verbatim, short) and explain in `problem`.",
  "Return every beat index you were given; use an empty issues list when the beat is fine.",
].join("\n");

export function buildRewriteSystemPrompt(language: "hi" | "en"): string {
  return [
    "You fix sentences in a talking-head news video script that failed fact checking.",
    "Rewrite each given beat so every claim is supported by the fact sheet. Use ONLY facts from the fact sheet;",
    "never add new facts, numbers, names or background. If a claim cannot be supported, remove it.",
    "Keep the beat's role and conversational tone, and keep it the same length or shorter — never add sentences.",
    "Write numbers as digits, exactly as in the facts.",
    language === "hi"
      ? "Write in conversational Hindi (Devanagari), like the original."
      : "Write in conversational English, like the original.",
    "onScreenText: up to 6 words, or null. Return one entry per given beat index.",
    "titleAndHooks: also rewrite each given title/hook line (same index; put the text in spokenText, onScreenText null).",
  ].join("\n");
}
