/** Shared fixtures for video agent tests. */
import type { FactSheet } from "@/Agents/video/researchBuilder/schema";
import type { ScriptOutput } from "@/Agents/video/scriptWriter/schema";
import type { VideoGenerate } from "@/Agents/video/shared/llm";

export function fixtureFactSheet(overrides: Partial<FactSheet> = {}): FactSheet {
  return {
    facts: [
      { id: "F1", text: "Acme raised ₹1,200 crore", type: "number", value: "₹1,200 crore", sourceIds: ["s1"], sourceUrls: ["https://a.example/1"], confidence: "high" },
      { id: "F2", text: "Jane Roe is the CEO of Acme", type: "name", sourceIds: ["s1"], sourceUrls: ["https://a.example/1"], confidence: "high" },
      { id: "F3", text: "The round closed in 2026", type: "date", value: "2026", sourceIds: ["s2"], sourceUrls: ["https://b.example/2"], confidence: "high" },
    ],
    whatHappened: "Acme raised money.",
    whatChanged: "",
    whyItMatters: [],
    whoIsAffected: [],
    openQuestions: [],
    conflicts: [],
    isFinance: false,
    sources: [
      { id: "s1", url: "https://a.example/1", title: "A", origin: "stored" },
      { id: "s2", url: "https://b.example/2", title: "B", origin: "stored" },
    ],
    searchQueries: [],
    droppedUngroundedFacts: 0,
    droppedFacts: [],
    ...overrides,
  };
}

export function fixtureScript(texts: string[] = [
  "Acme just raised ₹1,200 crore.",
  "Jane Roe runs Acme.",
  "The round closed in 2026.",
  "Here's why it matters.",
  "Follow for more.",
]): ScriptOutput {
  return {
    title: "Acme raises ₹1,200 crore",
    hookOptions: ["Acme raised ₹1,200 crore", "Who is Jane Roe?", "Acme's big round"],
    beats: texts.map((spokenText, index) => ({
      index,
      startSec: index * 3,
      endSec: index * 3 + 3,
      spokenText,
      kind: "fact" as const,
      factIds: index < 3 ? [`F${index + 1}`] : [],
      priority: "core" as const,
    })),
    cta: texts.at(-1) ?? "",
    wordCount: 20,
    estimatedSec: 15,
    lengthReason: "thin",
    wordsPerSecond: 2.4,
  };
}

export const fakeGenerate = (output: unknown): VideoGenerate =>
  (async () => output) as unknown as VideoGenerate;
