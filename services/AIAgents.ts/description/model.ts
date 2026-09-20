import { resolveAgentModel } from "../agentModel";

/** Long-form, source-grounded festival prose. */
export const defaultModel = "gpt-4.1-mini";

export const model = resolveAgentModel({
  agentEnvKey: "DESCRIPTION_AGENT_MODEL",
  defaultModel: "gpt-4.1-mini",
});
