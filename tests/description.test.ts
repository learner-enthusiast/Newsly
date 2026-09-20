import assert from "node:assert/strict";
import { test } from "node:test";
import { runPlanDescriptionAgent } from "@/services/AIAgents.ts/description/agent";
import type { DescriptionClient } from "@/services/AIAgents.ts/description/extract";
import type { PlanDescriptionInput } from "@/services/AIAgents.ts/description/schema";
import { PLANNING_RULES } from "@/services/planner/planningRules";
import { countWords } from "@/services/planner/validatePlan";

const input: PlanDescriptionInput = {
  festival: "Durga Puja",
  city: "Kolkata",
  year: 2026,
  festivalStart: "2026-10-16",
  festivalEnd: "2026-10-21",
  visitDates: ["2026-10-16", "2026-10-17"],
  legacy:
    "Community pujas in Kolkata grew out of the 18th-century zamindari bonedi bari celebrations before sarbojanin committees took over in the 20th century.",
  importantDays: [
    { name: "Mahalaya", date: "2026-10-10", notes: "Invocation of the goddess" },
    { name: "Sandhi Puja", date: "2026-10-19", notes: null },
  ],
  timings: [{ label: "Pandal viewing", startTime: "16:00", endTime: "23:00" }],
  days: [
    {
      dayNumber: 1,
      date: "2026-10-16",
      area: "Haltu",
      window: "17:00–22:00",
      transport: "mixed",
      stops: [
        {
          name: "Shakti Sangha Club Pandal",
          type: "pandal",
          role: "festival",
          area: "Haltu",
          arrives: "17:00",
        },
      ],
    },
  ],
  preferences: {
    transport: null,
    budget: null,
    crowdPreference: null,
    walkingTolerance: null,
    foodPreferences: [],
    preferredAreas: [],
  },
  sources: [
    {
      url: "https://example.com/durga-puja",
      title: "Durga Puja in Kolkata",
      content:
        "Durga Puja marks the goddess Durga's victory over Mahishasura. Kolkata's sarbojanin pujas run from Shashthi to Dashami and end with immersion.",
    },
  ],
};

/** Mocked LLM: no OpenAI or gateway call is made anywhere in this test file. */
function mockClient(
  responses: Array<{ title: string; description: string; terms?: string[] }>,
) {
  const calls: Array<{ prompt: string; context: unknown }> = [];
  let index = 0;

  const client = {
    async generate(params: { prompt: string; extraContext?: unknown }) {
      calls.push({ prompt: params.prompt, context: params.extraContext });
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;

      return {
        title: response.title,
        description: response.description,
        festivalTerms: (response.terms ?? []).map((term) => ({
          term,
          meaning: `${term} is described in the provided sources.`,
        })),
      };
    },
  } as unknown as DescriptionClient;

  return { client, calls };
}

function longDescription(words: number) {
  return Array.from({ length: words }, (_, i) => `sentence${i}`).join(" ");
}

test("the description agent returns a medium-long description", async () => {
  const { client } = mockClient([
    { title: "Two evenings of Durga Puja in Kolkata", description: longDescription(210) },
  ]);

  const result = await runPlanDescriptionAgent(input, { client });

  assert.ok(countWords(result.description) >= PLANNING_RULES.description.minWords);
  assert.equal(result.title, "Two evenings of Durga Puja in Kolkata");
});

test("a short first draft is retried once at full length", async () => {
  const { client, calls } = mockClient([
    { title: "Durga Puja", description: "A two day plan in Kolkata." },
    { title: "Durga Puja", description: longDescription(180) },
  ]);

  const result = await runPlanDescriptionAgent(input, { client });

  assert.equal(calls.length, 2);
  assert.ok(/too short/i.test(calls[1].prompt), "the retry asks for a longer draft");
  assert.ok(countWords(result.description) >= PLANNING_RULES.description.minWords);
});

test("the agent receives researched festival facts and itinerary context", async () => {
  const { client, calls } = mockClient([
    {
      title: "Durga Puja",
      description: longDescription(160),
      terms: ["Sandhi Puja", "Sarbojanin"],
    },
  ]);

  const result = await runPlanDescriptionAgent(input, { client });
  const context = JSON.stringify(calls[0].context);

  assert.ok(context.includes("Sandhi Puja"), "important days are passed through");
  assert.ok(context.includes("sarbojanin"), "researched history is passed through");
  assert.ok(context.includes("Haltu"), "the planned area is passed through");
  assert.ok(context.includes("2026-10-17"), "visit dates are passed through");
  assert.deepEqual(
    result.festivalTerms.map((term) => term.term),
    ["Sandhi Puja", "Sarbojanin"],
  );
});

test("festival terminology comes from the festival being planned", async () => {
  const ganeshInput: PlanDescriptionInput = {
    ...input,
    festival: "Ganesh Chaturthi",
    city: "Mumbai",
    importantDays: [
      { name: "Anant Chaturdashi", date: "2026-09-14", notes: "Visarjan day" },
    ],
    legacy:
      "Lokmanya Tilak turned household Ganpati worship into Mumbai's public sarvajanik mandals in 1893.",
    sources: [
      {
        url: "https://example.com/ganesh",
        title: "Ganesh Chaturthi",
        content:
          "Mumbai's sarvajanik mandals install Ganpati idols and end the festival with visarjan on Anant Chaturdashi.",
      },
    ],
  };

  const { client, calls } = mockClient([
    { title: "Ganesh Chaturthi", description: longDescription(170) },
  ]);

  await runPlanDescriptionAgent(ganeshInput, { client });
  const context = JSON.stringify(calls[0].context);

  assert.ok(context.includes("Anant Chaturdashi"));
  assert.ok(context.includes("sarvajanik"));
  assert.ok(!context.includes("Sandhi Puja"), "no terminology from another festival");
});
