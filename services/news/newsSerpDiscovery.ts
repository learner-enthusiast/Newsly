import { runGaiOverviewSearchGeneratorAgent } from "@/Agents/news/GAIOverviewSearchGeneratorAgents";
import { serpEngines } from "@/SERP/index";
import type { NewsGenerationConfig } from "@/services/news/newsGenerationRequest";
import {
  applySelectionWeightBoosts,
  appendGoogleSearchSerpResults,
  excludeTradingRecommendationArticles,
  extractAiOverviewTextFromSerpPayload,
  filterArticlesNearRequestDate,
  filterArticlesPublishedOnOrAfterBoundary,
  followUpBoostedUrlKeys,
  mergeSerpPayloads,
  normalizeSerpArticles,
  serpPayloadHasAiOverview,
  slimSerpPayloadForNormalize,
  toJsonSafeStepOutput,
  wrapAiOverviewFollowUpSerpPayload,
  type NormalizedArticleLink,
} from "@/services/news/normalizeArticles";
import {
  buildNewsSearchExecutionPlans,
  pickSerpSharedGeoFromSearchParams,
  serpResultsPerEngine,
  type NewsSearchExecutionPlan,
} from "@/services/news/newsSearchPlanning";
import { extractTopYoutubeVideoResults } from "@/services/news/youtubeResearch";

export type NewsSerpDiscoveryMode =
  | { kind: "initial"; requestDateIso: string }
  | { kind: "rerun"; boundary: Date };

export async function planNewsSearchExecution(config: NewsGenerationConfig) {
  return buildNewsSearchExecutionPlans(config);
}

export async function fetchAndNormalizeNewsSerpDiscovery(input: {
  config: NewsGenerationConfig;
  executionPlans: NewsSearchExecutionPlan[];
  mode: NewsSerpDiscoveryMode;
}): Promise<{
  articles: NormalizedArticleLink[];
  youtubeSerpPayload: { video_results: ReturnType<typeof extractTopYoutubeVideoResults> };
}> {
  const { config, executionPlans, mode } = input;
  let googleNewsPayload: unknown = {};
  let googleSearchPayload: unknown = {};
  let youtubePayload: unknown = {};

  const serpNum = serpResultsPerEngine(config.storyCount);

  for (const plan of executionPlans) {
    const [newsPayload, searchPayload, ytPayload] = await Promise.all([
      serpEngines.searchGoogleNews.fn({
        ...plan.googleNewsParams,
        num: serpNum,
      }),
      serpEngines.searchGoogle.fn({
        ...plan.googleSearchParams,
        num: serpNum,
        trigger_ai_overview: true,
      }),
      serpEngines.searchYoutube.fn(plan.youtubeParams),
    ]);
    googleNewsPayload = mergeSerpPayloads(googleNewsPayload, newsPayload);
    googleSearchPayload = mergeSerpPayloads(googleSearchPayload, searchPayload);
    youtubePayload = mergeSerpPayloads(youtubePayload, ytPayload);
  }

  let mergedGoogleSearchPayload: unknown = googleSearchPayload;
  let followUpPayloads: unknown[] = [];
  const primaryPlan = executionPlans[0]!;
  const primaryGl =
    primaryPlan.news.suggestedGl ?? primaryPlan.search.suggestedGl;
  const serpShared = {
    num: serpNum,
    ...(primaryGl ? { gl: primaryGl } : {}),
    hl: primaryPlan.news.suggestedHl ?? config.serpHl,
    ...pickSerpSharedGeoFromSearchParams(primaryPlan.googleSearchParams),
  };

  if (serpPayloadHasAiOverview(googleSearchPayload)) {
    const aiOverviewText =
      extractAiOverviewTextFromSerpPayload(googleSearchPayload);
    if (aiOverviewText) {
      const generated = await runGaiOverviewSearchGeneratorAgent({
        aiOverviewText,
        date: config.date,
        location: config.location ?? undefined,
        scope: config.scope === "both" ? "world" : config.scope,
        abortSignal: AbortSignal.timeout(120_000),
      });

      followUpPayloads = (
        await Promise.all(
          generated.queries.map((row) =>
            serpEngines.searchGoogle.fn({
              q: row.query,
              tbm: "nws",
              ...serpShared,
            }),
          ),
        )
      ).map(wrapAiOverviewFollowUpSerpPayload);

      mergedGoogleSearchPayload = appendGoogleSearchSerpResults(
        googleSearchPayload,
        followUpPayloads,
      );
    }
  }

  const limitPerEngine = serpResultsPerEngine(config.storyCount);
  const articles = normalizeSerpArticles({
    googleNewsPayload: slimSerpPayloadForNormalize(googleNewsPayload),
    googleSearchPayload: slimSerpPayloadForNormalize(mergedGoogleSearchPayload),
    limitPerEngine,
  });

  const dateFiltered =
    mode.kind === "initial"
      ? filterArticlesNearRequestDate(articles, mode.requestDateIso)
      : filterArticlesPublishedOnOrAfterBoundary(articles, mode.boundary);

  const eligible = excludeTradingRecommendationArticles(dateFiltered);
  const boostedUrls = followUpBoostedUrlKeys(
    googleSearchPayload,
    followUpPayloads,
  );
  const weighted = applySelectionWeightBoosts(eligible, boostedUrls);

  return toJsonSafeStepOutput({
    articles: weighted,
    youtubeSerpPayload: {
      video_results: extractTopYoutubeVideoResults(youtubePayload, 10),
    },
  }) as {
    articles: NormalizedArticleLink[];
    youtubeSerpPayload: {
      video_results: ReturnType<typeof extractTopYoutubeVideoResults>;
    };
  };
}
