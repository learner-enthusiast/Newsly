import { serpEngines } from "@/SERP/index";
import { buildNewsSearchExecutionPlans, serpResultsPerEngine } from "@/services/news/newsSearchPlanning";
import { normalizeSerpArticles, slimSerpPayloadForNormalize, filterArticlesNearRequestDate, excludeTradingRecommendationArticles, mergeSerpPayloads } from "@/services/news/normalizeArticles";

async function funnel(label: string, cfg: any) {
  const plans = buildNewsSearchExecutionPlans(cfg);
  let gn: unknown = {}, gs: unknown = {};
  const num = serpResultsPerEngine(cfg.storyCount);
  for (const p of plans) {
    console.log(`[${label}] tier=${p.tier}\n  news q: ${p.news.query}\n  search q: ${p.search.query}\n  gnParams: ${JSON.stringify(p.googleNewsParams)}`);
    const [a, b] = await Promise.all([
      serpEngines.searchGoogleNews.fn({ ...p.googleNewsParams, num } as never),
      serpEngines.searchGoogle.fn({ ...p.googleSearchParams, num } as never),
    ]);
    const cnt = (x: any, k: string) => (Array.isArray(x?.[k]) ? x[k].length : 0);
    console.log(`  raw google_news news_results=${cnt(a, "news_results")}  google nws news_results=${cnt(b, "news_results")} organic=${cnt(b, "organic_results")}`);
    gn = mergeSerpPayloads(gn, a); gs = mergeSerpPayloads(gs, b);
  }
  const arts = normalizeSerpArticles({ googleNewsPayload: slimSerpPayloadForNormalize(gn), googleSearchPayload: slimSerpPayloadForNormalize(gs), limitPerEngine: num });
  const dated = arts.filter((a) => a.publishedAt).length;
  const f = filterArticlesNearRequestDate(arts, cfg.date);
  const e = excludeTradingRecommendationArticles(f);
  console.log(`  normalized=${arts.length} (dated ${dated})  afterDate=${f.length}  afterTrading=${e.length}`);
  console.log("  sample publishedAt:", arts.slice(0, 6).map((a) => a.publishedAt));
}

async function main() {
  const base = { date: new Date().toISOString().slice(0, 10), categories: [], customQuery: null, storyCount: 5, language: "en", sources: [], serpHl: "en", latitude: null, longitude: null, locationRadiusMeters: null };
  await funnel("world", { ...base, scope: "world", location: null });
  await funnel("local", { ...base, scope: "local", location: "Hyderabad, Telangana, India" });
}
void main().catch((e) => { console.error(e); process.exit(1); });
