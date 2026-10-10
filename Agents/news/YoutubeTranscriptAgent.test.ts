import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boundedTranscriptForModel,
  normalizeEventDateFromTranscript,
  normalizeYoutubeTranscriptAnalysis,
  youtubeTranscriptAnalysisSchema,
} from "./YoutubeTranscriptAgent";

describe("boundedTranscriptForModel", () => {
  it("returns short transcripts unchanged", () => {
    const text = "Sensex fell 1200 points today.";
    assert.equal(boundedTranscriptForModel(text), text);
  });

  it("preserves head and tail when over max length", () => {
    const long = `${"A".repeat(90_000)}ENDMARKER`;
    const bounded = boundedTranscriptForModel(long);
    assert.ok(bounded.startsWith("A".repeat(100)));
    assert.ok(bounded.includes("omitted from middle"));
    assert.ok(bounded.endsWith("ENDMARKER"));
    assert.ok(bounded.length < long.length);
  });
});

describe("normalizeEventDateFromTranscript", () => {
  it("accepts ISO dates and rejects invalid values", () => {
    assert.equal(normalizeEventDateFromTranscript("2026-09-24"), "2026-09-24");
    assert.equal(normalizeEventDateFromTranscript("September 24"), null);
    assert.equal(normalizeEventDateFromTranscript(null), null);
    assert.equal(normalizeEventDateFromTranscript(""), null);
  });
});

describe("normalizeYoutubeTranscriptAnalysis", () => {
  const fixture = {
    summary: "Indian markets fell sharply while Reliance announced an acquisition.",
    importantFacts: [
      {
        fact: "Sensex fell 1,247 points.",
        description:
          "The speaker states the Sensex declined 1,247 points in the session discussed.",
        type: "market" as const,
        importance: 8,
        confidence: "high" as const,
        entities: ["Sensex", "India"],
        eventDate: "2026-09-24",
        whyImportant: "Large single-session move relevant to India market coverage.",
        verificationQueries: [
          "Sensex falls 1247 points September 24 2026",
          "Indian stock market September 24 2026 Sensex",
        ],
      },
      {
        fact: "Reliance announced a major acquisition.",
        description:
          "The transcript reports Reliance announced a major acquisition; details are limited.",
        type: "company" as const,
        importance: 9,
        confidence: "medium" as const,
        entities: ["Reliance Industries"],
        eventDate: null,
        whyImportant: "Major corporate action for a large Indian company.",
        verificationQueries: ["Reliance acquisition announcement 2026"],
      },
    ],
    majorEvents: [
      {
        title: "Sharp Indian equity market decline",
        description:
          "Sensex, Nifty, and Bank Nifty fell materially in the same session per the transcript.",
        importance: 8,
        entities: ["Sensex", "Nifty", "Bank Nifty"],
        verificationQueries: ["India markets fall September 24 2026"],
      },
      {
        title: "Reliance acquisition announcement",
        description: "Reliance announced a major acquisition according to the speaker.",
        importance: 9,
        entities: ["Reliance Industries"],
        verificationQueries: ["Reliance major acquisition 2026"],
      },
    ],
    excludedTopics: [
      {
        topic: "Top multibagger stocks to buy",
        reason: "Stock recommendation / watchlist, not a factual news event.",
      },
    ],
    overallImportance: 8,
  };

  it("sorts facts and events by descending importance", () => {
    const shuffled = {
      ...fixture,
      importantFacts: [...fixture.importantFacts].reverse(),
      majorEvents: [...fixture.majorEvents].reverse(),
    };
    const normalized = normalizeYoutubeTranscriptAnalysis(shuffled);
    assert.equal(normalized.importantFacts[0]?.importance, 9);
    assert.equal(normalized.majorEvents[0]?.importance, 9);
  });

  it("passes public Zod schema", () => {
    const normalized = normalizeYoutubeTranscriptAnalysis(fixture);
    assert.doesNotThrow(() =>
      youtubeTranscriptAnalysisSchema.parse(normalized),
    );
    assert.equal(normalized.excludedTopics[0]?.topic.includes("multibagger"), true);
    assert.equal(normalized.importantFacts[0]?.confidence, "medium");
  });

  it("nullifies invalid event dates from model output", () => {
    const withBadDate = {
      ...fixture,
      importantFacts: [
        {
          ...fixture.importantFacts[0]!,
          eventDate: "24-09-2026",
        },
      ],
    };
    const normalized = normalizeYoutubeTranscriptAnalysis(withBadDate);
    assert.equal(normalized.importantFacts[0]?.eventDate, null);
  });
});
