import { countWords } from "@/Agents/video/shared/numbers";

export type Pace = "slow" | "normal" | "fast";
export type ScriptLanguage = "hi" | "en";

/** Speaking rate, words per second. Tune here. */
export const WORDS_PER_SECOND: Record<ScriptLanguage, Record<Pace, number>> = {
  en: { slow: 2.0, normal: 2.4, fast: 2.8 },
  hi: { slow: 1.9, normal: 2.2, fast: 2.6 },
};

/** Hook and CTA must each fit in this many seconds. */
export const HOOK_MAX_SEC = 5;
export const CTA_MAX_SEC = 5;
/** maxSec is a soft limit: allow this much over. */
export const MAX_SEC_TOLERANCE = 0.1;

export function wordsPerSecond(language: ScriptLanguage, pace: Pace): number {
  return WORDS_PER_SECOND[language][pace];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Re-index beats from 0 and set start/end from cumulative words ÷ wps. */
export function timeBeats<T extends { spokenText: string }>(
  beats: T[],
  wps: number,
): Array<T & { index: number; startSec: number; endSec: number }> {
  let words = 0;
  return beats.map((beat, index) => {
    const startSec = round1(words / wps);
    words += countWords(beat.spokenText);
    return { ...beat, index, startSec, endSec: round1(words / wps) };
  });
}

export function totalWords(beats: Array<{ spokenText: string }>): number {
  return beats.reduce((sum, beat) => sum + countWords(beat.spokenText), 0);
}
