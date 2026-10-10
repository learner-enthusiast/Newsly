import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  articleCandidateBudget,
  buildGoogleQueryFromContext,
  buildNewsSearchExecutionPlans,
  buildNewsTopicSearchPlans,
  MAX_TOPIC_QUERIES_PER_TIER,
  withGoogleRecencyFilter,
  expandCategoryKeywords,
  maxArticlesToScrape,
  newsSearchContextFromConfig,
  serpResultsPerEngine,
} from "./newsSearchPlanning";
import { normalizeNewsGenerationRequest } from "./newsGenerationRequest";

describe("expandCategoryKeywords", () => {
  it("merges categories into one keyword set without duplicating", () => {
    const keywords = expandCategoryKeywords(["Markets", "markets", "Policy"]);
    assert.ok(keywords.some((k) => /market/i.test(k)));
    assert.ok(keywords.some((k) => /policy|regulation/i.test(k)));
    assert.equal(new Set(keywords.map((k) => k.toLowerCase())).size, keywords.length);
  });
});

describe("buildNewsSearchExecutionPlans", () => {
  it("returns two tiers for both scope with distinct world query", () => {
    const config = normalizeNewsGenerationRequest({
      date: "2026-09-26",
      scope: "both",
      location: "Hyderabad, Telangana, India",
      categories: ["Technology", "Economy"],
      customQuery: "Adani investment",
    });
    const plans = buildNewsSearchExecutionPlans(config);
    assert.equal(plans.length, 2);
    assert.equal(plans[0]!.tier, "local");
    assert.equal(plans[1]!.tier, "world");
    assert.match(plans[0]!.news.query, /Hyderabad/i);
    assert.match(plans[0]!.news.query, /Adani investment/);
    assert.match(plans[1]!.news.query, /Adani investment/);
    assert.doesNotMatch(plans[1]!.news.query, /Hyderabad/i);
  });

  it("sets Serp location on local Google search params", () => {
    const config = normalizeNewsGenerationRequest({
      date: "2026-09-26",
      scope: "local",
      location: "Hyderabad, Telangana, India",
    });
    const [plan] = buildNewsSearchExecutionPlans(config);
    assert.equal(
      plan!.googleSearchParams.location,
      "Hyderabad, Telangana, India",
    );
    assert.equal(plan!.googleSearchParams.tbm, "nws");
    assert.equal(plan!.googleNewsParams.gl, "in");
  });

  it("uses lat, lon, and radius on Google Search (nws) only when coords exist", () => {
    const config = normalizeNewsGenerationRequest({
      date: "2026-09-26",
      scope: "local",
      location: "Hyderabad, Telangana, India",
      latitude: 17.385,
      longitude: 78.4867,
    });
    const [plan] = buildNewsSearchExecutionPlans(config);
    assert.equal(plan!.googleSearchParams.lat, 17.385);
    assert.equal(plan!.googleSearchParams.lon, 78.4867);
    assert.equal(plan!.googleSearchParams.radius, 20_000);
    assert.equal(plan!.googleSearchParams.location, undefined);
    assert.equal(plan!.googleNewsParams.lat, undefined);
    assert.equal(plan!.googleNewsParams.lon, undefined);
    assert.equal(plan!.googleNewsParams.radius, undefined);
    assert.equal(plan!.googleNewsParams.location, undefined);
  });
});

describe("budget helpers", () => {
  it("scales candidate and scrape budgets with storyCount", () => {
    assert.equal(articleCandidateBudget(3), 21);
    assert.equal(articleCandidateBudget(10), 48);
    assert.equal(maxArticlesToScrape(3), 6);
    assert.equal(serpResultsPerEngine(5), 15);
  });
});

describe("buildGoogleQueryFromContext", () => {
  it("includes site filters for sources", () => {
    const ctx = newsSearchContextFromConfig(
      normalizeNewsGenerationRequest({
        date: "2026-09-26",
        scope: "world",
        sources: ["thehindu.com", "economictimes.indiatimes.com"],
      }),
    );
    const q = buildGoogleQueryFromContext(ctx, "world", "news");
    assert.match(q, /site:thehindu\.com/);
    assert.match(q, /site:economictimes\.indiatimes\.com/);
  });
});

describe("buildNewsTopicSearchPlans", () => {
  it("builds short focused queries per tier with a tbs date range", () => {
    const config = normalizeNewsGenerationRequest({
      date: "2026-09-26",
      scope: "both",
      location: "Hyderabad, Telangana, India",
    });
    const plans = buildNewsTopicSearchPlans(config);
    const local = plans.filter((plan) => plan.tier === "local");
    const world = plans.filter((plan) => plan.tier === "world");
    assert.equal(local.length, MAX_TOPIC_QUERIES_PER_TIER);
    assert.equal(world.length, MAX_TOPIC_QUERIES_PER_TIER);
    assert.ok(local.every((plan) => /Hyderabad|Telangana/.test(plan.query)));
    assert.ok(world.every((plan) => !/Hyderabad/.test(plan.query)));
    assert.ok(plans.every((plan) => !/2026-09-26|after:/.test(plan.query)));
    assert.equal(
      world[0]!.googleSearchParams.tbs,
      "cdr:1,cd_min:9/25/2026,cd_max:9/26/2026",
    );
  });

  it("puts the custom query first", () => {
    const config = normalizeNewsGenerationRequest({
      date: "2026-09-26",
      scope: "world",
      customQuery: "Adani investment",
    });
    assert.equal(buildNewsTopicSearchPlans(config)[0]!.query, "Adani investment");
  });
});

describe("withGoogleRecencyFilter", () => {
  it("replaces after:/before: operators with tbs", () => {
    const params = withGoogleRecencyFilter(
      { q: "global markets news after:2026-09-26 before:2026-09-27", num: 10 },
      "2026-09-26",
    );
    assert.equal(params.q, "global markets news");
    assert.equal(params.tbs, "cdr:1,cd_min:9/25/2026,cd_max:9/26/2026");
    assert.equal(params.num, 10);
  });
});
