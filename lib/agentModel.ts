/** Default OpenAI model for structured agent calls (fast + cost-efficient). */
export const DEFAULT_OPENAI_AGENT_MODEL = "gpt-4o-mini";

export type AgentModelOptions = {
  /** Primary env var for this agent, e.g. RESEARCH_AGENT_MODEL */
  agentEnvKey: string;
  /** Fallback when no env vars are set (per-agent default) */
  defaultModel?: string;
  /** Older/alternate env names checked before the shared agent default */
  legacyEnvKeys?: string[];
};

/**
 * Resolves the OpenAI model id for an agent.
 * Precedence: agent-specific env → legacy env keys → AI_AGENT_MODEL → OPENAI_AGENT_MODEL → default.
 */
export function resolveAgentModel(options: AgentModelOptions): string {
  const candidates = [
    options.agentEnvKey,
    ...(options.legacyEnvKeys ?? []),
    "AI_AGENT_MODEL",
    "OPENAI_AGENT_MODEL",
  ];

  for (const key of candidates) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return options.defaultModel ?? DEFAULT_OPENAI_AGENT_MODEL;
}
