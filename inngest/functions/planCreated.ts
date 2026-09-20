/**
 * Plan generation pipeline (Inngest).
 *
 * Trigger: `planner/plan.created` with `{ planId }`, sent from
 * `services/planner/createReadyPlan.ts` right after intake is READY.
 * The HTTP intake route returns immediately; all heavy work runs here.
 *
 * Architecture rules for this file:
 * - Use `repositories/*` and `services/*` only — do not import Prisma here.
 * - Call Serp through `serpService.*.fn`, not `serpClient` directly.
 * - Each independently retriable unit is its own `step.run(...)` so Inngest
 *   can retry failed steps without redoing successful ones.
 * - Maps/Serp data is the source of truth for place IDs and coordinates;
 *   LLM agents only enrich text fields and must not invent locations or dates.
 *
 * Failure handling:
 * - Controlled failures (no verified dates, no places): mark run + plan failed,
 *   return `{ ok: false }` without throwing — avoids pointless retries.
 * - Unexpected errors: Inngest retries (see `retries`), then `onFailure` marks
 *   the research run and plan as failed.
 *
 * Idempotency:
 * - Plan already `ready` → early exit.
 * - Completed research run with existing plan days → skip pipeline, set ready.
 * - Research sources/places/days use dedupe helpers in repositories/services.
 *
 * Registered in: `app/api/inngest/route.ts`
 *
 * Step order (each name matches `step.run` in Inngest UI):
 * 1. load-plan → 2. ensure-research-run → (mark-ready-existing if resuming)
 * → 3. mark-processing → 4–6. search-festival-* → 7. scrape-festival-urls
 * → 8. persist-research-sources → 9. festival-facts-agent
 * → 10–12. discover/upsert pandals (+ place agent) → 13–15. discover/upsert food
 * → 16. require-places → 17. persist-weather → 18. cluster-day-routes
 * → 19. itinerary-copy-agent → 20. persist-plan-days-items → 21. complete-plan
 */
import { NonRetriableError } from "inngest";
import { inngestClient } from "@/clients/inngestClient";
import { PLAN_CREATED_EVENT, planCreatedEvent } from "@/inngest/events";
import {
  getPlanById,
  updatePlanStatus,
  updatePlanWeather,
} from "@/repositories/plan";
import { getPlanDaysByPlanId } from "@/repositories/planDay";
import {
  completeResearchRun,
  createResearchRun,
  failResearchRun,
  findInitialGenerationByPlanId,
  startResearchRun,
} from "@/repositories/researchRun";
import { getSourcesByRunId } from "@/repositories/researchSource";
import { runFestivalFactsAgent } from "@/services/AIAgents.ts/festival/agent";
import { runFoodResearchAgent } from "@/services/AIAgents.ts/food/agent";
import { runItineraryCopyAgent } from "@/services/AIAgents.ts/itinerary/agent";
import { runPlaceResearchAgent } from "@/services/AIAgents.ts/places/agent";
import {
  emptyPlanningRequest,
  planningRequestSchema,
  type PlanningRequest,
} from "@/services/AIAgents.ts/planner-intake/schema";
import {
  mapsPlaceRecords,
  mapsContentForAgent,
  upsertMapsPlaces,
  type CanonicalPlace,
} from "@/services/planner/canonicalPlace";
import { buildDayRouteCandidates } from "@/services/planner/dayRoutes";
import { persistPlanDaysAndItems } from "@/services/planner/persistItinerary";
import { scrapeMarkdown } from "@/services/planner/research/firecrawl";
import {
  getWeatherSnapshot,
  mapsPlacesFromSearch,
} from "@/services/planner/research/serp";
import {
  classifySourceType,
  hashContent,
  isHttpUrl,
  organicHitsFromSearch,
  persistResearchSource,
  selectScrapeUrls,
} from "@/services/planner/research/sources";
import { serpService } from "@/services/serpService";

/** Structured logs for the Inngest dashboard and server logs (never log API keys). */
function logStep(step: string, data: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      scope: "planner.planCreated",
      event: PLAN_CREATED_EVENT,
      step,
      ...data,
    }),
  );
}

function publicErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "unknown error";
  return raw.replace(/api[_-]?key=[^&\s]+/gi, "api_key=redacted");
}

/** `plans.requestData` from intake; fall back to plan title fields if JSON is stale. */
function parsePlanningRequest(
  requestData: unknown,
  plan: { festivalName: string; city: string; year: number },
): PlanningRequest {
  const parsed = planningRequestSchema.safeParse(requestData);
  if (parsed.success) {
    return parsed.data;
  }

  return {
    ...emptyPlanningRequest(),
    festival: plan.festivalName,
    city: plan.city,
    year: plan.year,
  };
}

/** Build LLM context from persisted research_sources (snippet or scraped markdown). */
function researchedContentFromSources(
  sources: Array<{
    url: string;
    title: string | null;
    content: string | null;
    snippet: string | null;
  }>,
): Array<{ url: string | null; title: string | null; content: string }> {
  return sources
    .map((source) => {
      const content = source.content?.trim() || source.snippet?.trim() || "";
      if (!content) {
        return null;
      }

      return {
        url: source.url,
        title: source.title,
        content,
      };
    })
    .filter(
      (source): source is { url: string; title: string | null; content: string } =>
        source != null,
    );
}

function planIdFromFailureEvent(event: { data?: unknown }) {
  const data = event.data as
    | {
        event?: { data?: { planId?: unknown } };
        planId?: unknown;
      }
    | undefined;

  if (typeof data?.event?.data?.planId === "string") {
    return data.event.data.planId;
  }

  if (typeof data?.planId === "string") {
    return data.planId;
  }

  return null;
}

function failureMessage(event: { data?: unknown }, fallback: string) {
  const data = event.data as { error?: { message?: unknown } } | undefined;
  return typeof data?.error?.message === "string" && data.error.message.trim()
    ? data.error.message.replace(/api[_-]?key=[^&\s]+/gi, "api_key=redacted")
    : fallback;
}

/** Controlled failure path: persist error on the run and surface failed status to the UI. */
async function markPlanFailed(planId: string, researchRunId: string, error: string) {
  await failResearchRun(researchRunId, error);
  await updatePlanStatus(planId, "failed");
}

export const planCreated = inngestClient.createFunction(
  {
    id: "planner-plan-created",
    triggers: { event: planCreatedEvent },
    retries: 3,
    // Only one active generation per planId; duplicate events are skipped.
    singleton: { key: "event.data.planId", mode: "skip" },
    // Runs after all step retries are exhausted for uncaught errors.
    onFailure: async ({ event }) => {
      const planId = planIdFromFailureEvent(event);
      if (!planId) {
        logStep("on-failure", { ok: false, reason: "missing_plan_id" });
        return { ok: false };
      }

      const error = failureMessage(event, "Plan generation failed");
      const run = await findInitialGenerationByPlanId(planId);
      if (run && run.status !== "completed") {
        await failResearchRun(run.id, error);
      }

      const plan = await getPlanById(planId);
      if (plan && plan.status !== "ready") {
        await updatePlanStatus(planId, "failed");
      }

      logStep("on-failure", { planId, researchRunId: run?.id ?? null });
      return { ok: false, planId };
    },
  },
  async ({ event, step }) => {
    const planId = event.data.planId;

    // --- Phase 1: Load plan and short-circuit if already done ---
    const loaded = await step.run("load-plan", async () => {
      const plan = await getPlanById(planId);
      if (!plan) {
        throw new NonRetriableError(`Plan not found: ${planId}`);
      }

      logStep("load-plan", { planId, status: plan.status });

      if (plan.status === "ready") {
        return {
          noop: true as const,
          reason: "already_ready",
          planId: plan.id,
          festivalName: plan.festivalName,
          city: plan.city,
          year: plan.year,
          requestData: plan.requestData,
        };
      }

      return {
        noop: false as const,
        planId: plan.id,
        status: plan.status,
        festivalName: plan.festivalName,
        city: plan.city,
        year: plan.year,
        requestData: plan.requestData,
      };
    });

    if (loaded.noop) {
      return { ok: true, planId, skipped: true, reason: loaded.reason };
    }

    const request = parsePlanningRequest(loaded.requestData, loaded);
    const festival = loaded.festivalName;
    const city = loaded.city;
    const year = loaded.year;
    const preferredArea = request.preferredAreas[0];

    // --- Phase 2: One initial_generation research_run per plan (retry-safe) ---
    const research = await step.run("ensure-research-run", async () => {
      const existing = await findInitialGenerationByPlanId(planId);
      const run =
        existing ??
        (await createResearchRun({
          planId,
          runType: "initial_generation",
          status: "queued",
        }));

      const days = await getPlanDaysByPlanId(planId);
      if (run.status === "completed" && days.length > 0) {
        logStep("ensure-research-run", {
          planId,
          researchRunId: run.id,
          alreadyComplete: true,
        });
        return {
          researchRunId: run.id,
          alreadyComplete: true as const,
        };
      }

      const started = await startResearchRun(run.id);
      logStep("ensure-research-run", {
        planId,
        researchRunId: started.id,
        status: started.status,
      });

      return {
        researchRunId: started.id,
        alreadyComplete: false as const,
      };
    });

    if (research.alreadyComplete) {
      await step.run("mark-ready-existing", async () => {
        const plan = await getPlanById(planId);
        if (plan && plan.status !== "ready") {
          await updatePlanStatus(planId, "ready");
        }
        logStep("mark-ready-existing", {
          planId,
          researchRunId: research.researchRunId,
        });
        return { ok: true };
      });

      return {
        ok: true,
        planId,
        skipped: true,
        reason: "research_already_complete",
      };
    }

    const researchRunId = research.researchRunId;

    await step.run("mark-processing", async () => {
      const plan = await getPlanById(planId);
      if (plan && plan.status !== "processing") {
        await updatePlanStatus(planId, "processing");
      }
      logStep("mark-processing", { planId, researchRunId });
      return { ok: true };
    });

    // --- Phase 3: Festival web research (Google via Serp + optional Firecrawl) ---
    const festivalSearch = await step.run("search-festival-facts", async () => {
      const result = await serpService.searchFestivalFacts.fn({
        festival,
        city,
        year,
      });
      const hits = organicHitsFromSearch(result);
      logStep("search-festival-facts", { planId, hitCount: hits.length });
      return { query: `${festival} ${city} ${year} dates timings history`, hits };
    });

    const festivalDatesSearch = await step.run(
      "search-festival-dates",
      async () => {
        const result = await serpService.searchFestivalDates.fn({
          festival,
          city,
          year,
        });
        const hits = organicHitsFromSearch(result);
        logStep("search-festival-dates", { planId, hitCount: hits.length });
        return { query: `${festival} ${city} ${year} dates start end`, hits };
      },
    );

    const festivalEventsSearch = await step.run(
      "search-festival-events",
      async () => {
        const result = await serpService.searchFestivalEvents.fn({
          festival,
          city,
          year,
        });
        const hits = organicHitsFromSearch(result);
        logStep("search-festival-events", { planId, hitCount: hits.length });
        return { query: `${festival} ${city} events ${year}`, hits };
      },
    );

    const scraped = await step.run("scrape-festival-urls", async () => {
      const hits = [
        ...festivalSearch.hits,
        ...festivalDatesSearch.hits,
        ...festivalEventsSearch.hits,
      ];
      const selected = selectScrapeUrls(hits, 6);
      const pages: Array<{
        url: string;
        title: string | null;
        snippet: string | null;
        markdown: string | null;
      }> = [];

      // Per-URL scrape failures are logged and skipped; other URLs still run.
      for (const item of selected) {
        try {
          const result = await scrapeMarkdown(item.url);
          pages.push({
            url: item.url,
            title: item.title,
            snippet: item.snippet,
            markdown: result.markdown,
          });
        } catch (error) {
          logStep("scrape-festival-urls", {
            planId,
            url: item.url,
            skipped: true,
            error: publicErrorMessage(error),
          });
        }
      }

      const markdownCount = pages.filter((page) => page.markdown).length;
      logStep("scrape-festival-urls", {
        planId,
        selectedCount: selected.length,
        scrapedCount: pages.length,
        markdownCount,
      });

      return { pages };
    });

    await step.run("persist-research-sources", async () => {
      const retrievedAt = new Date();
      const organicRows = [
        { query: festivalSearch.query, hits: festivalSearch.hits },
        { query: festivalDatesSearch.query, hits: festivalDatesSearch.hits },
        { query: festivalEventsSearch.query, hits: festivalEventsSearch.hits },
      ];

      let created = 0;

      for (const row of organicRows) {
        for (const hit of row.hits) {
          if (!hit.link || !isHttpUrl(hit.link)) {
            continue;
          }

          await persistResearchSource({
            researchRunId,
            url: hit.link,
            title: hit.title,
            sourceType: classifySourceType(hit.link),
            searchQuery: row.query,
            snippet: hit.snippet,
            retrievedAt,
            metadata: { origin: "google_search" },
          });
          created += 1;
        }
      }

      for (const page of scraped.pages) {
        await persistResearchSource({
          researchRunId,
          url: page.url,
          title: page.title,
          sourceType: classifySourceType(page.url),
          snippet: page.snippet,
          content: page.markdown,
          contentHash: hashContent(page.markdown),
          retrievedAt,
          metadata: { origin: "firecrawl" },
        });
      }

      logStep("persist-research-sources", {
        planId,
        researchRunId,
        organicRows: created,
        scrapedPages: scraped.pages.length,
      });

      return { ok: true };
    });

    // --- Phase 4: Festival dates from evidence (no invented dates) ---
    const festivalFacts = await step.run("festival-facts-agent", async () => {
      const sources = await getSourcesByRunId(researchRunId);
      const content = researchedContentFromSources(sources);
      const facts = await runFestivalFactsAgent({
        festival,
        city,
        year,
        sources: content,
      });

      const verifiedStart = facts.startDate;
      const verifiedEnd = facts.endDate;
      const intakeDates =
        request.festivalDates?.sourceVerified === true
          ? request.festivalDates
          : null;

      const startDate = verifiedStart ?? intakeDates?.start ?? null;
      const endDate = verifiedEnd ?? intakeDates?.end ?? null;

      if (!startDate || !endDate) {
        await markPlanFailed(
          planId,
          researchRunId,
          "No verified festival dates found; refusing to invent dates.",
        );
        logStep("festival-facts-agent", {
          planId,
          researchRunId,
          failed: true,
          reason: "no_verified_dates",
        });
        return { failed: true as const, reason: "no_verified_dates" as const };
      }

      logStep("festival-facts-agent", {
        planId,
        researchRunId,
        startDate,
        endDate,
        importantDayCount: facts.importantDays.length,
      });

      return {
        failed: false as const,
        startDate,
        endDate,
        importantDays: facts.importantDays,
        legacy: facts.legacy,
        timings: facts.timings,
      };
    });

    if (festivalFacts.failed) {
      return { ok: false, planId, reason: festivalFacts.reason };
    }

    // --- Phase 5: Places — Maps discovery is canonical; agents add descriptions only ---
    const pandalDiscovery = await step.run("discover-pandals", async () => {
      const result = await serpService.discoverPujaPlaces.fn({
        city,
        area: preferredArea,
        limit: 15,
      });
      const places = mapsPlaceRecords(mapsPlacesFromSearch(result));
      const query = preferredArea
        ? `Durga Puja pandal ${preferredArea}, ${city}`
        : `Durga Puja pandal ${city}`;
      logStep("discover-pandals", { planId, placeCount: places.length });
      return { query, places };
    });

    const pandalAgent = await step.run("pandal-place-agent", async () => {
      const sources = await getSourcesByRunId(researchRunId);
      const content = researchedContentFromSources(sources);
      const mapsContent = mapsContentForAgent(pandalDiscovery.places);
      if (mapsContent) {
        content.push({
          url: null,
          title: "Google Maps pandal results",
          content: mapsContent,
        });
      }

      const result = await runPlaceResearchAgent({
        city,
        festival,
        area: preferredArea,
        sources: content,
      });
      logStep("pandal-place-agent", {
        planId,
        agentPlaceCount: result.places.length,
      });
      return { places: result.places };
    });

    const pandalPlaces = await step.run("upsert-pandals", async () => {
      const mapsSource = await persistResearchSource({
        researchRunId,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pandalDiscovery.query)}`,
        title: pandalDiscovery.query,
        sourceType: "google_maps",
        searchQuery: pandalDiscovery.query,
        retrievedAt: new Date(),
        metadata: { resultCount: pandalDiscovery.places.length },
      });

      const places = await upsertMapsPlaces({
        mapsPlaces: pandalDiscovery.places,
        agentPlaces: pandalAgent.places,
        city,
        area: preferredArea,
        fallbackType: "pandal",
        sourceId: mapsSource.id,
      });

      logStep("upsert-pandals", {
        planId,
        upsertedCount: places.length,
        sourceId: mapsSource.id,
      });

      return { places };
    });

    const foodDiscovery = await step.run("discover-food", async () => {
      const result = await serpService.discoverFoodPlaces.fn({
        city,
        area: preferredArea,
        limit: 15,
      });
      const places = mapsPlaceRecords(mapsPlacesFromSearch(result));
      const query = preferredArea
        ? `food stalls street food restaurants ${preferredArea}, ${city}`
        : `food stalls street food restaurants ${city}`;
      logStep("discover-food", { planId, placeCount: places.length });
      return { query, places };
    });

    const foodAgent = await step.run("food-place-agent", async () => {
      const sources = await getSourcesByRunId(researchRunId);
      const content = researchedContentFromSources(sources);
      const mapsContent = mapsContentForAgent(foodDiscovery.places);
      if (mapsContent) {
        content.push({
          url: null,
          title: "Google Maps food results",
          content: mapsContent,
        });
      }

      const result = await runFoodResearchAgent({
        city,
        festival,
        area: preferredArea,
        sources: content,
      });
      logStep("food-place-agent", {
        planId,
        agentPlaceCount: result.places.length,
      });
      return { places: result.places };
    });

    const foodPlaces = await step.run("upsert-food", async () => {
      const mapsSource = await persistResearchSource({
        researchRunId,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(foodDiscovery.query)}`,
        title: foodDiscovery.query,
        sourceType: "google_maps",
        searchQuery: foodDiscovery.query,
        retrievedAt: new Date(),
        metadata: { resultCount: foodDiscovery.places.length },
      });

      const places = await upsertMapsPlaces({
        mapsPlaces: foodDiscovery.places,
        agentPlaces: foodAgent.places,
        city,
        area: preferredArea,
        fallbackType: "food",
        sourceId: mapsSource.id,
      });

      logStep("upsert-food", {
        planId,
        upsertedCount: places.length,
        sourceId: mapsSource.id,
      });

      return { places };
    });

    // Dedupe by place id (same venue can appear in both pandal and food searches).
    const allPlaces: CanonicalPlace[] = [
      ...pandalPlaces.places,
      ...foodPlaces.places,
    ].filter(
      (place, index, list) =>
        list.findIndex((item) => item.id === place.id) === index,
    );

    const placesReady = await step.run("require-places", async () => {
      if (allPlaces.length === 0) {
        await markPlanFailed(
          planId,
          researchRunId,
          "No researched places found; refusing to invent locations.",
        );
        logStep("require-places", {
          planId,
          researchRunId,
          failed: true,
          reason: "no_places",
        });
        return { failed: true as const, reason: "no_places" as const };
      }

      logStep("require-places", { planId, placeCount: allPlaces.length });
      return { failed: false as const, placeCount: allPlaces.length };
    });

    if (placesReady.failed) {
      return { ok: false, planId, reason: placesReady.reason };
    }

    // --- Phase 6: Weather, deterministic day routes, LLM copy, persist, ready ---
    await step.run("persist-weather", async () => {
      const date =
        request.visitDates?.[0] ?? festivalFacts.startDate ?? undefined;

      try {
        const weather = await getWeatherSnapshot({ city, date });
        await updatePlanWeather(planId, weather);
        logStep("persist-weather", {
          planId,
          dayCount: weather.days.length,
          location: weather.location,
        });
        return { ok: true, dayCount: weather.days.length };
      } catch (error) {
        await updatePlanWeather(planId, {
          location: city,
          fetchedAt: new Date().toISOString(),
          days: [],
        });
        logStep("persist-weather", {
          planId,
          skipped: true,
          error: publicErrorMessage(error),
        });
        return { ok: true, dayCount: 0 };
      }
    });

    // Visit days and stop order come from requestData + clustering — not from the LLM.
    const routes = await step.run("cluster-day-routes", async () => {
      const candidates = buildDayRouteCandidates({
        request,
        festivalStart: festivalFacts.startDate,
        festivalEnd: festivalFacts.endDate,
        places: allPlaces,
      });
      logStep("cluster-day-routes", {
        planId,
        dayCount: candidates.length,
        placeCount: candidates.reduce(
          (sum, day) => sum + day.places.length,
          0,
        ),
      });
      return { days: candidates };
    });

    // Itinerary agent only writes titles/descriptions for days already built above.
    const copy = await step.run("itinerary-copy-agent", async () => {
      try {
        const result = await runItineraryCopyAgent({
          festival,
          city,
          year,
          days: routes.days.map((day) => ({
            dayNumber: day.dayNumber,
            date: day.date,
            places: day.places.map((place) => ({
              name: place.name,
              type: place.type,
              address: place.address,
              city: place.city,
              area: place.area,
            })),
          })),
        });
        logStep("itinerary-copy-agent", {
          planId,
          dayCount: result.days.length,
        });
        return result;
      } catch (error) {
        logStep("itinerary-copy-agent", {
          planId,
          fallback: true,
          error: publicErrorMessage(error),
        });
        return {
          days: routes.days.map((day) => ({
            dayNumber: day.dayNumber,
            title: `Day ${day.dayNumber}`,
            description:
              day.places.length > 0
                ? `Visit ${day.places.map((place) => place.name).join(", ")}.`
                : `Day ${day.dayNumber} in ${city}.`,
          })),
        };
      }
    });

    // Idempotent: skips creating items if days already have items for this plan.
    await step.run("persist-plan-days-items", async () => {
      const copyByDay = new Map(copy.days.map((day) => [day.dayNumber, day]));
      const persisted = await persistPlanDaysAndItems({
        planId,
        places: allPlaces,
        days: routes.days.map((day) => {
          const written = copyByDay.get(day.dayNumber);
          return {
            ...day,
            title: written?.title ?? `Day ${day.dayNumber}`,
            description:
              written?.description ??
              (day.places.length > 0
                ? `Visit ${day.places.map((place) => place.name).join(", ")}.`
                : `Day ${day.dayNumber} in ${city}.`),
          };
        }),
      });
      logStep("persist-plan-days-items", {
        planId,
        dayCount: persisted.length,
        itemCount: persisted.reduce((sum, day) => sum + day.itemCount, 0),
      });
      return persisted;
    });

    await step.run("complete-plan", async () => {
      // UI polls GET /api/plans/[planId] until status becomes `ready`.
      await completeResearchRun(researchRunId, {
        placeCount: allPlaces.length,
        dayCount: routes.days.length,
        festivalStart: festivalFacts.startDate,
        festivalEnd: festivalFacts.endDate,
      });
      await updatePlanStatus(planId, "ready");
      logStep("complete-plan", { planId, researchRunId, status: "ready" });
      return { ok: true, status: "ready" as const };
    });

    return { ok: true, planId, status: "ready" as const };
  },
);
