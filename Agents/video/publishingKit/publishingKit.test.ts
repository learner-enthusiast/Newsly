import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fakeGenerate, fixtureFactSheet, fixtureScript } from "@/Agents/video/shared/testFixtures";
import type { CreativeDirection } from "@/Agents/video/creativeDirector/schema";
import { claimsOnlyScript, createPublishingKit, truncateAtWord, type PublishingDraft } from "./index";

const direction: CreativeDirection = {
  beats: [
    {
      index: 0,
      needsVisual: false,
      overlayType: "none",
      searchQueries: [],
      preferGenerative: false,
      editing: { transitionIn: "cut", transitionOut: "cut", motion: "none", speakerFraming: "normal" },
      editorNote: "Speaker only.",
    },
  ],
  global: { pacing: "fast", hookTreatment: "punch-in", subtitleStyle: "bold", colorTreatment: "warm", musicMood: "tense" },
};

const draft: PublishingDraft = {
  titles: [
    { text: "Acme raises ₹1,200 crore", style: "number" },
    { text: "Acme raises ₹5,000 crore?!", style: "curiosity" },
    { text: "Who is Jane Roe? #Acme", style: "question" },
    { text: "Acme's big 2026 round", style: "direct" },
    { text: 'Jane Roe: "we will double"', style: "hindi_english_mix" },
  ],
  thumbnail: {
    concepts: [
      { idea: "Face + rupee stack", textOverlay: "₹1,200 crore raised today wow", layout: "face right" },
      { idea: "Face + 10x arrow", textOverlay: "10x growth", layout: "face left" },
      { idea: "Face + office", textOverlay: "Big round", layout: "face right" },
    ],
    openaiPrompts: [
      { prompt: "Empty modern office at dusk, wide, space on right", notes: "background" },
      { prompt: "Acme headquarters with its logo", notes: "bad" },
    ],
    tips: ["High contrast"],
  },
  descriptions: {
    youtubeSummary: "Acme raised money.",
    youtubeKeyPoints: ["₹1,200 crore round", "Jane Roe leads", "1.2 thousand crore raised"],
    shorts: "Line one\nLine two\nLine three",
    instagram: "Acme raised ₹1,200 crore 🚀. Valuation hit ₹9,000 crore.",
    x: "word ".repeat(70).trim(),
  },
  hashtags: ["Acme", "#Funding", "#funding ", "start ups", "#Acme"],
  pinnedComment: "Would you invest?",
};

const input = (isFinance: boolean) => ({
  script: fixtureScript(),
  factSheet: fixtureFactSheet({ isFinance }),
  direction,
  language: "en" as const,
  aspectRatio: "16:9" as const,
});

describe("publishingKit", () => {
  it("drops claims beyond the script and assembles descriptions", async () => {
    const run = createPublishingKit({ generate: fakeGenerate(draft) });
    const result = await run(input(true));
    assert.equal(result.status, "ok", result.status === "failed" ? result.reason : "");
    if (result.status !== "ok") return;
    const kit = result.data;

    assert.deepEqual(kit.titles.map((t) => t.text), ["Acme raises ₹1,200 crore", "Who is Jane Roe?", "Acme's big 2026 round"]);
    assert.equal(kit.titles[0].charCount, 24);
    assert.deepEqual(kit.thumbnail.concepts.map((c) => c.textOverlay), ["₹1,200 crore raised today", "Big round"]);
    assert.deepEqual(kit.thumbnail.openaiPrompts.map((p) => [p.prompt, p.size]), [["Empty modern office at dusk, wide, space on right", "1536x864"]]);
    assert.equal(kit.dropped.length, 6);
    assert.doesNotMatch(kit.descriptions.youtube, /thousand crore/);
    assert.doesNotMatch(kit.descriptions.instagram, /9,000/);

    const yt = kit.descriptions.youtube;
    assert.match(yt, /Key points:\n• ₹1,200 crore round/);
    assert.match(yt, /Sources:\nhttps:\/\/a\.example\/1\nhttps:\/\/b\.example\/2/);
    assert.match(yt, /Chapters:/);
    assert.ok(yt.endsWith("For information only, not investment advice."));
    assert.ok(kit.descriptions.instagram.endsWith("For information only, not investment advice."));
    assert.equal(kit.descriptions.shorts, "Line one\nLine two");
    assert.ok(kit.descriptions.x.length <= 280);
    assert.deepEqual(kit.hashtags, ["#Acme", "#Funding", "#funding", "#startups"]);
  });

  it("omits the disclaimer for non-finance stories", async () => {
    const run = createPublishingKit({ generate: fakeGenerate(draft) });
    const result = await run(input(false));
    assert.equal(result.status === "ok" && /investment advice/.test(result.data.descriptions.youtube), false);
  });

  it("helpers", () => {
    assert.equal(claimsOnlyScript("Acme raises 1200 crore", fixtureScript()), true);
    assert.equal(claimsOnlyScript("Acme raises 1300 crore", fixtureScript()), false);
    assert.equal(truncateAtWord("one two three four", 10), "one two…");
  });
});
