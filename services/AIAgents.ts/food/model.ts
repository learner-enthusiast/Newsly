import { resolveAgentModel } from "../agentModel";

/** Classify and extract food stalls/restaurants from research text. */
export const defaultModel = "gpt-4o-mini";

export const model = resolveAgentModel({
  agentEnvKey: "FOOD_AGENT_MODEL",
  defaultModel: "gpt-4o-mini",
});
