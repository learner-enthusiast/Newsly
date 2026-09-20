import { resolveAgentModel } from "../agentModel";

/** Structured pandal/place fields from maps + research snippets. */
export const defaultModel = "gpt-4o-mini";

export const model = resolveAgentModel({
  agentEnvKey: "PLACES_AGENT_MODEL",
  defaultModel: "gpt-4o-mini",
});
