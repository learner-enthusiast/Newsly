import { z } from "zod";

/** OpenAI strict structured outputs reject open-ended z.record(..., z.unknown()). */
export const strictPreferenceEntrySchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const strictOtherPreferencesSchema = z.array(strictPreferenceEntrySchema);

export function preferenceEntriesToRecord(
  entries: Array<{ key: string; value: string }>,
): Record<string, unknown> {
  return Object.fromEntries(entries.map(({ key, value }) => [key, value]));
}
