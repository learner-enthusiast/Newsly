export const FALLBACK_OPENAI_MODEL = "gpt-4o-mini";

/**
 * Model id resolution: call-time override → agent-specific env → OPENAI_MODEL → fallback.
 */
export function resolveOpenAiModelId(
  override?: string,
  agentSpecificEnv?: string | null,
): string {
  return (
    override?.trim() ||
    agentSpecificEnv?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    FALLBACK_OPENAI_MODEL
  );
}
