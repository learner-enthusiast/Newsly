/**
 * Plan generation pipeline (Inngest).
 *
 * Trigger: `planner/plan.created` with `{ planId }`, sent from
 * `services/planner/createReadyPlan.ts` right after intake is READY.
 * The HTTP intake route returns immediately; all heavy work runs here.
 *
 * Reasoning order (deliberate — never the reverse):
 *   user request → festival facts → city/area structure → festival place
 *   discovery → normalization → geographic clustering → day routes → food at
 *   meal windows → weather for every visit date → plan description →
 *   validation → persistence → ready.
 *
 * Architecture rules for this file:
 * - Use `repositories/*` and `services/*` only — do not import Prisma here.
 * - Call Serp through `serpService.*.fn`, not `serpClient` directly.
 * - Each independently retriable unit is its own `step.run(...)`.
 * - Maps/Serp data is the source of truth for place IDs and coordinates;
 *   agents only classify and describe. Selection, ordering, timing, clustering
 *   and weather alignment are deterministic code, not LLM output.
 *
 * Failure handling:
 * - Controlled failures (no verified dates, no festival places, validation
 *   rejection): mark run + plan failed and return `{ ok: false }` — the plan is
 *   never marked ready on bad output.
 * - Unexpected errors: Inngest retries, then `onFailure` marks run/plan failed.
 *
 * Idempotency:
 * - Plan already `ready` → early exit.
 * - Completed research run with existing plan days → skip pipeline, set ready.
 * - Sources, places and plan days all go through dedupe/reuse helpers.
 *
 * Registered in: `app/api/inngest/route.ts`
 */
import { NonRetriableError } from "inngest";
import { inngestClient } from "@/clients/inngestClient";
import { PLAN_CREATED_EVENT, planCreatedEvent } from "@/inngest/events";
import {
  getPlanById,
  updatePlanDescription,
  updatePlanStatus,
  updatePlanWeather,
} from "@/repositories/plan";
import { getPlanDaysByPlanId } from "@/repositories/planDay";
import { getPlanItemsByDayId } from "@/repositories/planItem";
import {
  completeResearchRun,
  createResearchRun,
  failResearchRun,
  findInitialGenerationByPlanId,
  startResearchRun,
} from "@/repositories/researchRun";
import { getSourcesByRunId } from "@/repositories/researchSource";
import { runPlanDescriptionAgent } from "@/services/AIAgents.ts/description/agent";
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
import {
  buildDayRoutes,
  describeDayRoute,
  effectiveVisitDates,
  visitDaySlots,
  type DayRoute,
  type RouteStop,
} from "@/services/planner/dayRoutes";
import {
  festivalTokens,
  isFestivalPlaceType,
  placeTypeSchema,
  planItemRole,
  type PlanItemType,
} from "@/services/planner/normalize/placeType";
import { persistPlanDaysAndItems } from "@/services/planner/persistItinerary";
import {
  formatClock,
  isFoodFocusedRequest,
} from "@/services/planner/planningRules";
import { scrapeMarkdown } from "@/services/planner/research/firecrawl";
import {
  getWeatherPlan,
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
import {
  validatePlanDraft,
  type PlanValidationIssue,
} from "@/services/planner/validatePlan";
import {
  weatherSnapshotSchema,
  type WeatherDay,
} from "@/services/planner/weather";
import { serpService } from "@/services/serpService";

/** Research text handed to agents and to place classification as evidence. */
const MAX_CORPUS_CHARS = 60_000;
const MAX_SOURCE_CHARS = 4_000;
const DESCRIPTION_SOURCE_LIMIT = 8;

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

type ResearchedSource = {
  url: string | null;
  title: string | null;
  content: string;
};

/** Build LLM context from persisted research_sources (snippet or scraped markdown). */
function researchedContentFromSources(
  sources: Array<{
    url: string;
    title: string | null;
    content: string | null;
    snippet: string | null;
  }>,
): ResearchedSource[] {
  return sources.flatMap((source) => {
    const content = source.content?.trim() || source.snippet?.trim() || "";
    if (!content) {
      return [];
    }

    return [{ url: source.url, title: source.title, content }];
  });
}

/** Flat text used to check whether a venue is described as a festival venue. */
function researchCorpus(sources: ResearchedSource[]) {
  return sources
    .map((source) => `${source.title ?? ""}\n${source.content}`)
    .join("\n\n")
    .slice(0, MAX_CORPUS_CHARS);
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

function issueSummary(issues: PlanValidationIssue[]) {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join(" | ");
}

function snapshotString(snapshot: unknown, field: string) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const value = (snapshot as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : null;
}

function snapshotNumber(snapshot: unknown, field: string) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const value = (snapshot as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Rebuilds a `DayRoute` view from persisted rows so the final validation runs
 * against database state (via repositories), not against the in-memory plan.
 */
function persistedDayToRoute(params: {
  day: { dayNumber: number; date: string | null };
  items: Array<{
    placeId: string | null;
    type: string;
    position: number;
    durationMinutes: number | null;
    notes: string | null;
    snapshot: unknown;
  }>;
  route?: DayRoute;
}): DayRoute {
  const stops: RouteStop[] = params.items.map((item) => {
    const itemType = item.type as Exclude<PlanItemType, "custom">;
    const parsedType = placeTypeSchema.safeParse(
      snapshotString(item.snapshot, "type"),
    );

    return {
      placeId: item.placeId ?? "",
      name: snapshotString(item.snapshot, "name") ?? itemType,
      placeType: parsedType.success ? parsedType.data : "other",
      itemType,
      role: planItemRole(itemType) === "food" ? "food" : "festival",
      address: snapshotString(item.snapshot, "address"),
      city: snapshotString(item.snapshot, "city"),
      area: snapshotString(item.snapshot, "area"),
      latitude: snapshotNumber(item.snapshot, "latitude"),
      longitude: snapshotNumber(item.snapshot, "longitude"),
      position: item.position,
      startMinutes: 0,
      durationMinutes: item.durationMinutes ?? 30,
      travelKmFromPrevious: null,
      travelMinutesFromPrevious: 0,
      transportFromPrevious: null,
      mealWindow: null,
      note: item.notes ?? "",
    };
  });

  return {
    dayNumber: params.day.dayNumber,
    date: params.day.date,
    regionId: params.route?.regionId ?? null,
    areaLabel: params.route?.areaLabel ?? null,
    transportMode: params.route?.transportMode ?? "mixed",
    transportExplicit: params.route?.transportExplicit ?? false,
    startMinutes: params.route?.startMinutes ?? 0,
    endMinutes: params.route?.endMinutes ?? 0,
    startSuggested: params.route?.startSuggested ?? true,
    endSuggested: params.route?.endSuggested ?? true,
    stops,
    festivalStopCount: stops.filter((stop) => stop.role === "festival").length,
    foodStopCount: stops.filter((stop) => stop.role === "food").length,
    travelKm: params.route?.travelKm ?? 0,
  };
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
    const preferredAreas = request.preferredAreas.slice(0, 2);
    const tokens = festivalTokens(festival, request.canonicalFestival);
    const foodFocused = isFoodFocusedRequest(request);

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

    // --- Phase 3: Festival web research (Google via Serp + Firecrawl) ---
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

    const festivalHistorySearch = await step.run(
      "search-festival-history",
      async () => {
        const result = await serpService.searchFestivalHistory.fn({
          festival,
          city,
          year,
        });
        const hits = organicHitsFromSearch(result);
        logStep("search-festival-history", { planId, hitCount: hits.length });
        return { query: `${festival} ${city} history tradition legacy`, hits };
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

    // Local hopping guides tell us how residents group stops into areas.
    const routeGuideSearch = await step.run(
      "search-local-route-guides",
      async () => {
        const result = await serpService.searchLocalRouteGuides.fn({
          festival,
          city,
          year,
        });
        const hits = organicHitsFromSearch(result);
        logStep("search-local-route-guides", { planId, hitCount: hits.length });
        return {
          query: `${festival} ${city} ${year} pandal hopping route guide`,
          hits,
        };
      },
    );

    const scraped = await step.run("scrape-festival-urls", async () => {
      const hits = [
        ...festivalSearch.hits,
        ...festivalDatesSearch.hits,
        ...festivalHistorySearch.hits,
        ...festivalEventsSearch.hits,
        ...routeGuideSearch.hits,
      ];
      const selected = selectScrapeUrls(hits, 8);
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
        { query: festivalHistorySearch.query, hits: festivalHistorySearch.hits },
        { query: festivalEventsSearch.query, hits: festivalEventsSearch.hits },
        { query: routeGuideSearch.query, hits: routeGuideSearch.hits },
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

    // --- Phase 4: Festival facts from evidence (no invented dates) ---
    const festivalFacts = await step.run("festival-facts-agent", async () => {
      const sources = await getSourcesByRunId(researchRunId);
      const content = researchedContentFromSources(sources);
      const facts = await runFestivalFactsAgent({
        festival,
        city,
        year,
        sources: content,
      });

      const intakeDates =
        request.festivalDates?.sourceVerified === true
          ? request.festivalDates
          : null;

      const startDate = facts.startDate ?? intakeDates?.start ?? null;
      const endDate = facts.endDate ?? intakeDates?.end ?? null;

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
        timingCount: facts.timings.length,
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

    // --- Phase 5: Festival places first; food is discovered separately ---
    const festivalDiscovery = await step.run(
      "discover-festival-places",
      async () => {
        // One query for the city plus one per preferred area, so area
        // coverage comes from the request rather than a hardcoded list.
        const areas: Array<string | undefined> = [
          undefined,
          ...preferredAreas,
        ];
        const collected: Array<{ query: string; places: ReturnType<typeof mapsPlaceRecords> }> = [];

        for (const area of areas) {
          const result = await serpService.discoverFestivalPlaces.fn({
            festival,
            city,
            area,
            limit: 20,
          });
          collected.push({
            query: `${festival} pandal ${area ? `${area}, ${city}` : city}`,
            places: mapsPlaceRecords(mapsPlacesFromSearch(result)),
          });
        }

        const seen = new Set<string>();
        const places = collected
          .flatMap((entry) => entry.places)
          .filter((place) => {
            const key = place.place_id ?? place.data_id ?? place.title;
            if (seen.has(key)) {
              return false;
            }
            seen.add(key);
            return true;
          });

        logStep("discover-festival-places", {
          planId,
          queryCount: collected.length,
          placeCount: places.length,
        });

        return { queries: collected.map((entry) => entry.query), places };
      },
    );

    const festivalPlaceAgent = await step.run(
      "festival-place-agent",
      async () => {
        const sources = await getSourcesByRunId(researchRunId);
        const content = researchedContentFromSources(sources);
        const mapsContent = mapsContentForAgent(festivalDiscovery.places);
        if (mapsContent) {
          content.push({
            url: null,
            title: `Google Maps ${festival} venue results`,
            content: mapsContent,
          });
        }

        const result = await runPlaceResearchAgent({
          city,
          festival,
          area: preferredAreas[0],
          sources: content,
        });
        logStep("festival-place-agent", {
          planId,
          agentPlaceCount: result.places.length,
        });
        return { places: result.places };
      },
    );

    const festivalPlaces = await step.run("upsert-festival-places", async () => {
      const sources = await getSourcesByRunId(researchRunId);
      const corpus = researchCorpus(researchedContentFromSources(sources));

      const mapsSource = await persistResearchSource({
        researchRunId,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(festivalDiscovery.queries[0] ?? `${festival} ${city}`)}`,
        title: festivalDiscovery.queries.join(" | "),
        sourceType: "google_maps",
        searchQuery: festivalDiscovery.queries[0] ?? null,
        retrievedAt: new Date(),
        metadata: { resultCount: festivalDiscovery.places.length },
      });

      const places = await upsertMapsPlaces({
        mapsPlaces: festivalDiscovery.places,
        agentPlaces: festivalPlaceAgent.places,
        city,
        area: preferredAreas[0] ?? null,
        fallbackType: "pandal",
        sourceId: mapsSource.id,
        festivalTokens: tokens,
        discoveryIntent: "festival",
        researchCorpus: corpus,
      });

      logStep("upsert-festival-places", {
        planId,
        upsertedCount: places.length,
        pandalCount: places.filter((place) => place.type === "pandal").length,
        sourceId: mapsSource.id,
      });

      return { places };
    });

    const foodDiscovery = await step.run("discover-food", async () => {
      const area = preferredAreas[0];
      const result = await serpService.discoverFoodPlaces.fn({
        city,
        area,
        limit: 12,
      });
      const places = mapsPlaceRecords(mapsPlacesFromSearch(result));
      const query = area
        ? `food stalls street food restaurants ${area}, ${city}`
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
        area: preferredAreas[0],
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
        area: preferredAreas[0] ?? null,
        fallbackType: "food",
        sourceId: mapsSource.id,
        festivalTokens: tokens,
        discoveryIntent: "food",
      });

      logStep("upsert-food", {
        planId,
        upsertedCount: places.length,
        sourceId: mapsSource.id,
      });

      return { places };
    });

    // Dedupe by place id (the same venue can surface in both searches).
    const allPlaces: CanonicalPlace[] = [
      ...festivalPlaces.places,
      ...foodPlaces.places,
    ].filter(
      (place, index, list) =>
        list.findIndex((item) => item.id === place.id) === index,
    );

    const placesReady = await step.run("require-festival-places", async () => {
      const festivalCount = allPlaces.filter((place) =>
        isFestivalPlaceType(place.type),
      ).length;

      if (festivalCount === 0) {
        await markPlanFailed(
          planId,
          researchRunId,
          "No researched festival places found; refusing to build a food-only itinerary.",
        );
        logStep("require-festival-places", {
          planId,
          researchRunId,
          failed: true,
          reason: "no_festival_places",
        });
        return { failed: true as const, reason: "no_festival_places" as const };
      }

      logStep("require-festival-places", {
        planId,
        placeCount: allPlaces.length,
        festivalCount,
      });
      return { failed: false as const, festivalCount };
    });

    if (placesReady.failed) {
      return { ok: false, planId, reason: placesReady.reason };
    }

    const visitDates = effectiveVisitDates({
      request,
      festivalStart: festivalFacts.startDate,
      festivalEnd: festivalFacts.endDate,
    });
    const expectedDayCount = visitDaySlots({
      request,
      festivalStart: festivalFacts.startDate,
      festivalEnd: festivalFacts.endDate,
    }).length;

    // --- Phase 6: Deterministic clustering, routing and food placement ---
    const routing = await step.run("build-day-routes", async () => {
      const routablePlaces = allPlaces.map((place) => ({
        id: place.id,
        name: place.name,
        type: place.type,
        address: place.address,
        city: place.city,
        area: place.area,
        latitude: place.latitude,
        longitude: place.longitude,
        rating: place.rating,
        reviewCount: place.reviewCount,
      }));

      const build = (foodStopsPerDayOverride?: number) =>
        buildDayRoutes({
          request,
          festivalStart: festivalFacts.startDate,
          festivalEnd: festivalFacts.endDate,
          places: routablePlaces,
          timings: festivalFacts.timings,
          foodStopsPerDayOverride,
        });

      const routeOnlyValidation = (days: DayRoute[]) =>
        validatePlanDraft({
          // Description is written later; ignore its codes in this pass.
          description: "placeholder ".repeat(200),
          visitDates,
          expectedDayCount,
          weatherDays: visitDates.map((date) => ({ date })),
          days,
          knownPlaceIds: allPlaces.map((place) => place.id),
          foodFocused,
        });

      let days = build();
      let validation = routeOnlyValidation(days);

      // A failed itinerary is rebuilt from the real festival candidates —
      // food stops are never simply deleted from a bad route.
      if (!validation.ok) {
        logStep("build-day-routes", {
          planId,
          rebuilding: true,
          issues: issueSummary(validation.issues),
        });
        days = build(0);
        validation = routeOnlyValidation(days);
      }

      logStep("build-day-routes", {
        planId,
        dayCount: days.length,
        festivalStops: days.reduce((sum, day) => sum + day.festivalStopCount, 0),
        foodStops: days.reduce((sum, day) => sum + day.foodStopCount, 0),
        valid: validation.ok,
        issues: validation.ok ? null : issueSummary(validation.issues),
      });

      return { days, issues: validation.issues };
    });

    if (routing.issues.length > 0) {
      await step.run("fail-invalid-routes", async () => {
        await markPlanFailed(
          planId,
          researchRunId,
          `Itinerary validation failed: ${issueSummary(routing.issues)}`,
        );
        return { ok: false };
      });

      return { ok: false, planId, reason: "itinerary_validation_failed" };
    }

    // --- Weather: one entry per visit date, never a single representative day ---
    const weather = await step.run("persist-weather", async () => {
      if (visitDates.length === 0) {
        await updatePlanWeather(planId, {
          location: city,
          fetchedAt: new Date().toISOString(),
          days: [],
        });
        logStep("persist-weather", { planId, dayCount: 0, reason: "no_dates" });
        return { days: [] as WeatherDay[] };
      }

      const snapshot = await getWeatherPlan({ city, visitDates });
      await updatePlanWeather(planId, snapshot);
      logStep("persist-weather", {
        planId,
        requestedDates: visitDates.length,
        dayCount: snapshot.days.length,
        withForecast: snapshot.days.filter((day) => day.forecastAvailable).length,
      });

      return { days: snapshot.days };
    });

    const weatherByDate = new Map(
      weather.days
        .filter((day) => day.date != null)
        .map((day) => [day.date as string, day]),
    );

    // --- Plan description: festival history/terminology from sources ---
    const description = await step.run("plan-description-agent", async () => {
      const sources = await getSourcesByRunId(researchRunId);
      const content = researchedContentFromSources(sources)
        .slice(0, DESCRIPTION_SOURCE_LIMIT)
        .map((source) => ({
          url: source.url,
          title: source.title,
          content: source.content.slice(0, MAX_SOURCE_CHARS),
        }));

      try {
        const result = await runPlanDescriptionAgent({
          festival,
          city,
          year,
          festivalStart: festivalFacts.startDate,
          festivalEnd: festivalFacts.endDate,
          visitDates,
          legacy: festivalFacts.legacy,
          importantDays: festivalFacts.importantDays.map((day) => ({
            name: day.name,
            date: day.date,
            notes: day.notes,
          })),
          timings: festivalFacts.timings.map((timing) => ({
            label: timing.label,
            startTime: timing.startTime,
            endTime: timing.endTime,
          })),
          days: routing.days.map((day) => {
            const summary = describeDayRoute(day);
            return {
              dayNumber: summary.dayNumber,
              date: summary.date,
              area: summary.area,
              window: summary.window,
              transport: summary.transport,
              stops: summary.stops.map((stop) => ({
                name: stop.name,
                type: stop.type,
                role: stop.role,
                area: stop.area,
                arrives: stop.arrives,
              })),
            };
          }),
          preferences: {
            transport: request.transport,
            budget: request.budget,
            crowdPreference: request.crowdPreference,
            walkingTolerance: request.walkingTolerance,
            foodPreferences: request.foodPreferences,
            preferredAreas: request.preferredAreas,
          },
          sources: content,
        });

        logStep("plan-description-agent", {
          planId,
          words: result.description.trim().split(/\s+/).length,
          termCount: result.festivalTerms.length,
        });

        return {
          ok: true as const,
          title: result.title,
          description: result.description,
        };
      } catch (error) {
        logStep("plan-description-agent", {
          planId,
          failed: true,
          error: publicErrorMessage(error),
        });
        return { ok: false as const, title: null, description: null };
      }
    });

    // --- Day copy over the fixed route ---
    const copy = await step.run("itinerary-copy-agent", async () => {
      const days = routing.days.map((day) => {
        const summary = describeDayRoute(day);
        const forecast = day.date ? weatherByDate.get(day.date) : undefined;

        return {
          dayNumber: day.dayNumber,
          date: day.date,
          area: day.areaLabel,
          window: summary.window,
          transport: day.transportMode,
          transportExplicit: day.transportExplicit,
          weather: forecast
            ? {
                condition: forecast.condition,
                temperatureMin: forecast.temperatureMin,
                temperatureMax: forecast.temperatureMax,
                rainProbability: forecast.rainProbability,
                forecastAvailable: forecast.forecastAvailable,
              }
            : null,
          stops: day.stops.map((stop) => ({
            position: stop.position,
            name: stop.name,
            type: stop.placeType,
            role: stop.role,
            area: stop.area,
            arrives: formatClock(stop.startMinutes),
            stayMinutes: stop.durationMinutes,
            mealWindow: stop.mealWindow,
            travelFromPrevious:
              stop.travelKmFromPrevious == null
                ? null
                : `${stop.travelKmFromPrevious.toFixed(1)} km by ${stop.transportFromPrevious ?? day.transportMode}`,
          })),
        };
      });

      try {
        const result = await runItineraryCopyAgent({
          festival,
          city,
          year,
          days,
        });
        logStep("itinerary-copy-agent", { planId, dayCount: result.days.length });
        return result;
      } catch (error) {
        logStep("itinerary-copy-agent", {
          planId,
          fallback: true,
          error: publicErrorMessage(error),
        });

        return {
          days: days.map((day) => ({
            dayNumber: day.dayNumber,
            title: day.area ? `${day.area} route` : `Day ${day.dayNumber}`,
            description:
              day.stops.length > 0
                ? `Cover ${day.stops.map((stop) => stop.name).join(", ")} in ${day.area ?? city}.`
                : `Day ${day.dayNumber} in ${city}.`,
            stops: day.stops.map((stop) => ({
              position: stop.position,
              note: stop.name,
            })),
          })),
        };
      }
    });

    await step.run("persist-plan-days-items", async () => {
      const copyByDay = new Map(copy.days.map((day) => [day.dayNumber, day]));
      const persisted = await persistPlanDaysAndItems({
        planId,
        places: allPlaces,
        days: routing.days.map((day) => {
          const written = copyByDay.get(day.dayNumber);
          return {
            route: day,
            title:
              written?.title ??
              (day.areaLabel ? `${day.areaLabel} route` : `Day ${day.dayNumber}`),
            description:
              written?.description ??
              (day.stops.length > 0
                ? `Cover ${day.stops.map((stop) => stop.name).join(", ")} in ${day.areaLabel ?? city}.`
                : `Day ${day.dayNumber} in ${city}.`),
            stopNotes: written?.stops,
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

    if (description.ok && description.description) {
      await step.run("persist-plan-description", async () => {
        await updatePlanDescription(planId, {
          title: description.title ?? undefined,
          description: description.description as string,
        });
        logStep("persist-plan-description", { planId, persisted: true });
        return { ok: true };
      });
    }

    // --- Final validation against what is actually in the database ---
    const finalCheck = await step.run("final-validation", async () => {
      const plan = await getPlanById(planId);
      const days = await getPlanDaysByPlanId(planId);
      const parsedWeather = weatherSnapshotSchema.safeParse(plan?.weather);

      const persistedDays = await Promise.all(
        days.map(async (day) =>
          persistedDayToRoute({
            day: {
              dayNumber: day.dayNumber,
              date: day.date ? day.date.toISOString().slice(0, 10) : null,
            },
            items: await getPlanItemsByDayId(day.id),
            route: routing.days.find(
              (candidate) => candidate.dayNumber === day.dayNumber,
            ),
          }),
        ),
      );

      const validation = validatePlanDraft({
        description: plan?.description ?? null,
        title: plan?.title ?? null,
        visitDates,
        expectedDayCount,
        weatherDays: parsedWeather.success ? parsedWeather.data.days : [],
        days: persistedDays,
        knownPlaceIds: allPlaces.map((place) => place.id),
        foodFocused,
      });

      logStep("final-validation", {
        planId,
        ok: validation.ok,
        issues: validation.ok ? null : issueSummary(validation.issues),
      });

      if (!validation.ok) {
        await markPlanFailed(
          planId,
          researchRunId,
          `Final plan validation failed: ${issueSummary(validation.issues)}`,
        );
      }

      return { ok: validation.ok, issues: validation.issues };
    });

    if (!finalCheck.ok) {
      return { ok: false, planId, reason: "final_validation_failed" };
    }

    await step.run("complete-plan", async () => {
      // UI polls GET /api/plans/[planId] until status becomes `ready`.
      await completeResearchRun(researchRunId, {
        placeCount: allPlaces.length,
        festivalPlaceCount: placesReady.festivalCount,
        dayCount: routing.days.length,
        festivalStops: routing.days.reduce(
          (sum, day) => sum + day.festivalStopCount,
          0,
        ),
        foodStops: routing.days.reduce((sum, day) => sum + day.foodStopCount, 0),
        festivalStart: festivalFacts.startDate,
        festivalEnd: festivalFacts.endDate,
        visitDates,
      });
      await updatePlanStatus(planId, "ready");
      logStep("complete-plan", { planId, researchRunId, status: "ready" });
      return { ok: true, status: "ready" as const };
    });

    return { ok: true, planId, status: "ready" as const };
  },
);
