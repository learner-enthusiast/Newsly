const RECENT_TURN_LIMIT = 6;
const RECENT_TURN_CHARS = 400;

/** Combine enhanced question with recent turns for article selection / research. */
export function buildResearchPromptWithHistory(
  researchPrompt: string,
  recentMessages?: Array<{ role: string; content: string }>,
): string {
  const prompt = researchPrompt.trim();
  if (!recentMessages?.length) {
    return prompt;
  }

  const turns = recentMessages
    .slice(-RECENT_TURN_LIMIT)
    .flatMap((message) => {
      const role = message.role.trim();
      const content = message.content.trim().slice(0, RECENT_TURN_CHARS);
      if (!role || !content) {
        return [];
      }
      return [`${role}: ${content}`];
    });

  if (turns.length === 0) {
    return prompt;
  }

  return [
    "Resolved research question (use this intent for relevance, not raw pronouns alone):",
    prompt,
    "",
    "Recent conversation (context only):",
    ...turns,
  ].join("\n");
}

export function todayIsoDateUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
