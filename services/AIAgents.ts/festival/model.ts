import { resolveAgentModel } from "../agentModel";

/** Careful factual extraction of festival dates from scraped sources. */
export const defaultModel = "gpt-4.1-mini";

export const model = resolveAgentModel({
  agentEnvKey: "FESTIVAL_AGENT_MODEL",
  defaultModel: "gpt-4.1-mini",
});
