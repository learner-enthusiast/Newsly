import { aiClient } from "@/clients/AIClient";
import type { LLMProvider } from "@/providers/llm-provider";

export const aiClientLlmProvider: LLMProvider = {
  generateObject(request) {
    return aiClient.generate({
      output: request.schema,
      system: request.system,
      prompt: request.prompt,
      schemaName: request.schemaName,
      model: request.model,
      temperature: 0.1,
      maxOutputTokens: 4096,
    });
  },
};
