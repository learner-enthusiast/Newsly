/**
 * Dry-run the news briefing stages and print the candidate funnel per region.
 * Uses the same stage functions as `inngest/newsPipeline.ts`; writes nothing to
 * the database. The YouTube branch is skipped (it runs in parallel in the real
 * pipeline and only adds supporting evidence, never stories).
 *
 * Usage: pnpm news:funnel <world|local|both> [location] [storyCount]
 *   pnpm news:funnel world
 *   pnpm news:funnel local "Hyderabad, Telangana, India" 5
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import {
  buildRegionLookup,
  discoverNewsCandidates,
  formatFunnel,
  mergeFunnels,
  needsScrapeBackfill,
  rankArticlesForScrape,
  scrapeAndCleanArticles,
  scrapeBackfillBatch,
  synthesizeNewsStories,
} from "@/services/news/newsBriefingStages";
import { normalizeNewsGenerationRequest } from "@/services/news/newsGenerationRequest";
import {
  buildArticleSelectionPrompt,
  buildNewsSearchExecutionPlans,
  buildNewsTopicSearchPlans,
} from "@/services/news/newsSearchPlanning";

async function main() {
  const scope = (process.argv[2] ?? "world") as "world" | "local" | "both";
  const location = process.argv[3] ?? (scope === "world" ? null : "India");
  const storyCount = Number(process.argv[4] ?? 5);
  const config = normalizeNewsGenerationRequest({
    date: new Date().toISOString().slice(0, 10),
    scope,
    ...(location ? { location } : {}),
    storyCount,
  });
  const started = Date.now();

  const discovered = await discoverNewsCandidates({
    config,
    executionPlans: buildNewsSearchExecutionPlans(config),
    topicPlans: buildNewsTopicSearchPlans(config),
  });
  const researchPrompt = buildArticleSelectionPrompt(config);
  const ranking = await rankArticlesForScrape({
    config,
    articles: discovered.articles,
    researchPrompt,
  });
  const scraped = await scrapeAndCleanArticles({
    config,
    selected: ranking.selected,
    normalized: discovered.articles,
  });
  const backfill = needsScrapeBackfill(
    storyCount,
    scraped.researched.length,
    ranking.reserve.length,
  )
    ? await scrapeAndCleanArticles({
        config,
        selected: scrapeBackfillBatch(
          ranking.reserve,
          storyCount,
          scraped.researched.length,
        ),
        normalized: discovered.articles,
        stagePrefix: "backfill-",
      })
    : null;
  const researched = [...scraped.researched, ...(backfill?.researched ?? [])];
  const synthesis = await synthesizeNewsStories({
    config,
    newsRequestId: randomUUID(),
    articles: researched,
    regionOf: buildRegionLookup(researched),
    researchPrompt,
    model: resolveOpenAiModelId(
      undefined,
      process.env.NEWS_SYNTHESIZER_MODEL ?? "gpt-5.4-mini",
    ),
  });

  const funnel = mergeFunnels(
    discovered.funnel,
    ranking.funnel,
    scraped.funnel,
    backfill?.funnel ?? undefined,
    synthesis.funnel,
  );
  const stories = synthesis.stories;
  const avg = (values: number[]) =>
    values.length === 0
      ? 0
      : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

  console.log(
    `\n=== news funnel: scope=${scope} location=${location ?? "-"} storyCount=${storyCount} ===`,
  );
  console.log(formatFunnel(funnel));
  console.log(
    `  RESULT stories=${stories.length}/${storyCount} totalSec=${((Date.now() - started) / 1000).toFixed(1)} avgContentChars=${avg(stories.map((s) => s.content.length))} avgSourcesPerStory=${(stories.reduce((n, s) => n + s.sources.length, 0) / Math.max(1, stories.length)).toFixed(1)}`,
  );
  for (const story of stories) {
    console.log(`   - [${story.importanceScore}] ${story.title} (${story.sources.length} src)`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
