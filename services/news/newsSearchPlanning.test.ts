import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  articleCandidateBudget,
  buildGoogleQueryFromContext,
  buildNewsSearchExecutionPlans,
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
});

describe("budget helpers", () => {
  it("scales candidate and scrape budgets with storyCount", () => {
    assert.equal(articleCandidateBudget(3), 15);
    assert.equal(articleCandidateBudget(10), 40);
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
