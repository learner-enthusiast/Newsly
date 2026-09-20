import { resolveAgentModel } from "../agentModel";

/** Fast multi-turn intake extraction and visit-date parsing. */
export const defaultModel = "gpt-4.1-nano";

export const model = resolveAgentModel({
  agentEnvKey: "PLANNER_INTAKE_MODEL",
  legacyEnvKeys: ["OPENAI_INTAKE_MODEL"],
  defaultModel: "gpt-4.1-nano",
});

/** @deprecated Use `model` */
export function plannerIntakeModel() {
  return model;
}
