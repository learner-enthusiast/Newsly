import { resolveAgentModel } from "../agentModel";

/** Day titles and descriptions from fixed place lists. */
export const defaultModel = "gpt-4.1-mini";

export const model = resolveAgentModel({
  agentEnvKey: "ITINERARY_AGENT_MODEL",
  defaultModel: "gpt-4.1-mini",
});
