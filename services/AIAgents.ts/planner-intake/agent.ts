import {
  festivalHasEnded,
  inclusiveDayCount,
  listIsoDatesInclusive,
  todayFromClock,
  visitDatesWithinFestival,
} from "./dates";
import {
  compactSearchEvidence,
  extractFestivalOccurrence,
  extractPlanningRequest,
  resolveVisitDates,
} from "./extract";
import { searchFestivalOccurrence } from "./searchFestivalOccurrence";
import { preferenceEntriesToRecord } from "@/services/planner/strictOpenAiSchema";
import {
  emptyPlanningRequest,
  plannerIntakeResultSchema,
  type FestivalDates,
  type PlanningRequest,
  type PlannerIntakeInputPrompt,
  type PlannerIntakeResult,
} from "./schema";

export { defaultModel, model } from "./model";

export type PlannerIntakeInput = {
  message: string;
  previousRequest?: PlanningRequest | null;
  now?: Date;
};

function toPlanningRequest(
  extracted: Awaited<ReturnType<typeof extractPlanningRequest>>,
  previous?: PlanningRequest | null,
): PlanningRequest {
  const base = previous ?? emptyPlanningRequest();

  return {
    festival: extracted.festival ?? base.festival,
    canonicalFestival:
      extracted.canonicalFestival ?? extracted.festival ?? base.canonicalFestival,
    city: extracted.city ?? base.city,
    year: extracted.year ?? base.year,
    festivalDates: base.festivalDates,
    visitDates: base.visitDates,
    durationDays: extracted.durationDays ?? base.durationDays,
    durationHours: extracted.durationHours ?? base.durationHours,
    startTime: extracted.startTime ?? base.startTime,
    endTime: extracted.endTime ?? base.endTime,
    preferredAreas: extracted.preferredAreas.length
      ? extracted.preferredAreas
      : base.preferredAreas,
    transport: extracted.transport ?? base.transport,
    budget: extracted.budget ?? base.budget,
    foodPreferences: extracted.foodPreferences.length
      ? extracted.foodPreferences
      : base.foodPreferences,
    crowdPreference: extracted.crowdPreference ?? base.crowdPreference,
    walkingTolerance: extracted.walkingTolerance ?? base.walkingTolerance,
    otherPreferences: extracted.otherPreferences.length
      ? preferenceEntriesToRecord(extracted.otherPreferences)
      : base.otherPreferences,
  };
}

function visitDatesInput(
  request: PlanningRequest,
): PlannerIntakeInputPrompt | undefined {
  if (!request.festivalDates) {
    return undefined;
  }

  return {
    type: "date_select",
    field: "visitDates",
    options: listIsoDatesInclusive(
      request.festivalDates.start,
      request.festivalDates.end,
    ),
  };
}

function needsInput(
  request: PlanningRequest,
  missing: string[],
  message: string,
  input?: PlannerIntakeInputPrompt,
): PlannerIntakeResult {
  return plannerIntakeResultSchema.parse({
    status: "needs_input",
    message,
    request,
    missing,
    input,
  });
}

function ready(request: PlanningRequest): PlannerIntakeResult {
  return plannerIntakeResultSchema.parse({
    status: "ready",
    request,
  });
}

function collectCoreMissing(
  request: PlanningRequest,
  festival: string | null,
  extracted: { festivalAmbiguous: boolean; cityAmbiguous: boolean },
): string[] {
  const missing: string[] = [];

  if (extracted.festivalAmbiguous || !festival) {
    missing.push("festival");
  }

  if (extracted.cityAmbiguous || !request.city) {
    missing.push("city");
  }

  return missing;
}

function applyVisitDates(
  request: PlanningRequest,
  visitDates: string[],
): PlanningRequest {
  if (!visitDates.length) {
    return request;
  }

  return {
    ...request,
    visitDates,
    durationDays:
      request.durationDays ??
      inclusiveDayCount(visitDates[0], visitDates.at(-1) ?? visitDates[0]),
  };
}

function describeMissingField(
  field: string,
  request: PlanningRequest,
): string {
  switch (field) {
    case "festival":
      return "which festival you want to plan";
    case "city":
      return request.festival
        ? `which city to plan ${request.festival} in`
        : "which city to plan in";
    case "festivalDates":
      return `official ${request.festival} dates for ${request.city} in ${request.year} (start and end, YYYY-MM-DD)`;
    case "visitDates":
      if (request.festivalDates) {
        return `which dates you want to visit during ${request.festivalDates.start} to ${request.festivalDates.end}`;
      }
      return "which dates you want to visit (YYYY-MM-DD)";
    case "durationDays":
      return "how many days you want to visit, or specific visit dates";
    default:
      return field;
  }
}

function buildMissingMessage(missing: string[], request: PlanningRequest) {
  const unique = [...new Set(missing)];
  const parts = unique.map((field) => describeMissingField(field, request));

  if (parts.length === 1) {
    return `Please tell me ${parts[0]}.`;
  }

  return `I still need a few details: ${parts
    .map((part, index) => `${index + 1}) ${part}`)
    .join("; ")}.`;
}

function collectSchedulingMissing(request: PlanningRequest): string[] {
  const missing: string[] = [];

  if (request.festivalDates && request.visitDates?.length) {
    if (!visitDatesWithinFestival(request.visitDates, request.festivalDates)) {
      return ["visitDates"];
    }
  }

  if (!request.festivalDates) {
    missing.push("festivalDates");
  }

  const hasVisitDates = Boolean(request.visitDates?.length);
  const hasDuration = Boolean(request.durationDays);

  if (!hasVisitDates && !hasDuration) {
    missing.push("durationDays", "visitDates");
  } else if (request.festivalDates && !hasVisitDates) {
    missing.push("visitDates");
  }

  if (
    request.durationDays &&
    request.visitDates?.length &&
    request.visitDates.length !== request.durationDays
  ) {
    missing.push("visitDates");
  }

  return [...new Set(missing)];
}

function buildSchedulingMessage(missing: string[], request: PlanningRequest) {
  const needsDuration = missing.includes("durationDays");
  const needsVisit = missing.includes("visitDates");

  if (
    request.festivalDates &&
    request.festivalDates.start === request.festivalDates.end &&
    (needsDuration || needsVisit)
  ) {
    return `This plan is for one day on ${request.festivalDates.start}. Should I continue with that date?`;
  }

  if (
    needsDuration &&
    needsVisit &&
    request.festivalDates
  ) {
    return `How many days do you want to visit, and which dates work during ${request.festivalDates.start} to ${request.festivalDates.end}?`;
  }

  if (
    needsVisit &&
    request.festivalDates &&
    request.durationDays &&
    request.visitDates?.length &&
    request.visitDates.length !== request.durationDays
  ) {
    return `Please pick exactly ${request.durationDays} day${request.durationDays === 1 ? "" : "s"} to visit during ${request.festivalDates.start} to ${request.festivalDates.end}.`;
  }

  if (needsVisit && request.festivalDates && request.durationDays) {
    return `Pick ${request.durationDays} day${request.durationDays === 1 ? "" : "s"} to visit during ${request.festivalDates.start} to ${request.festivalDates.end}.`;
  }

  return buildMissingMessage(missing, request);
}

function schedulingInput(
  request: PlanningRequest,
  missing: string[],
): PlannerIntakeInputPrompt | undefined {
  if (!request.festivalDates) {
    return undefined;
  }

  if (
    missing.includes("visitDates") ||
    missing.includes("durationDays")
  ) {
    return visitDatesInput(request);
  }

  return undefined;
}

function validateReadyRequest(request: PlanningRequest): PlannerIntakeResult {
  const missing = collectSchedulingMissing(request);

  if (missing.length === 0) {
    return ready(request);
  }

  let message = buildSchedulingMessage(missing, request);

  if (
    missing.includes("visitDates") &&
    request.festivalDates &&
    request.visitDates?.length &&
    !visitDatesWithinFestival(request.visitDates, request.festivalDates)
  ) {
    message = `${request.festival} in ${request.city} runs ${request.festivalDates.start} to ${request.festivalDates.end}. Your visit dates fall outside that window — please pick dates within the festival.`;
  }

  return needsInput(
    request,
    missing,
    message,
    schedulingInput(request, missing),
  );
}

function sameOccurrenceTarget(
  previous: PlanningRequest,
  festival: string,
  city: string,
) {
  const previousFestival = previous.canonicalFestival ?? previous.festival;
  return previousFestival === festival && previous.city === city;
}

function canSkipRepeatOccurrenceResearch(params: {
  previous?: PlanningRequest | null;
  request: PlanningRequest;
  festival: string;
  extracted: { yearWasExplicit: boolean; year: number | null };
}) {
  if (!params.previous?.year || params.previous.festivalDates) {
    return false;
  }

  if (params.extracted.yearWasExplicit && params.extracted.year !== params.previous.year) {
    return false;
  }

  if (!params.request.city) {
    return false;
  }

  return sameOccurrenceTarget(params.previous, params.festival, params.request.city);
}

async function researchOccurrence(params: {
  festival: string;
  city: string;
  year: number;
}): Promise<FestivalDates | null> {
  const searchResult = await searchFestivalOccurrence(params);
  const occurrence = await extractFestivalOccurrence({
    ...params,
    evidence: compactSearchEvidence(searchResult),
  });

  if (occurrence.heldInCity === false) {
    throw new FestivalNotHeldError(
      `${params.festival} does not appear to be held in ${params.city}. Which city should I plan instead?`,
    );
  }

  if (!occurrence.found || !occurrence.start || !occurrence.end) {
    return null;
  }

  return {
    start: occurrence.start,
    end: occurrence.end,
    sourceVerified: true,
  };
}

class FestivalNotHeldError extends Error {}

async function resolveYearAndDates(params: {
  festival: string;
  city: string;
  explicitYear: number | null;
  yearWasExplicit: boolean;
  today: ReturnType<typeof todayFromClock>;
}): Promise<{ year: number; festivalDates: FestivalDates | null }> {
  if (params.yearWasExplicit && params.explicitYear) {
    return {
      year: params.explicitYear,
      festivalDates: await researchOccurrence({
        festival: params.festival,
        city: params.city,
        year: params.explicitYear,
      }),
    };
  }

  const candidateYear = params.today.year;
  const candidateDates = await researchOccurrence({
    festival: params.festival,
    city: params.city,
    year: candidateYear,
  });

  if (candidateDates && festivalHasEnded(candidateDates, params.today)) {
    const nextYear = candidateYear + 1;
    return {
      year: nextYear,
      festivalDates: await researchOccurrence({
        festival: params.festival,
        city: params.city,
        year: nextYear,
      }),
    };
  }

  return {
    year: candidateYear,
    festivalDates: candidateDates,
  };
}

export async function runPlannerIntakeAgent(
  input: PlannerIntakeInput,
): Promise<PlannerIntakeResult> {
  const today = todayFromClock(input.now);
  const extracted = await extractPlanningRequest({
    message: input.message,
    previousRequest: input.previousRequest,
  });
  const request = toPlanningRequest(extracted, input.previousRequest);
  const festival = request.canonicalFestival ?? request.festival;
  const coreMissing = collectCoreMissing(request, festival, extracted);

  if (coreMissing.length > 0) {
    const mergedRequest =
      festival && !coreMissing.includes("festival")
        ? { ...request, festival, canonicalFestival: festival }
        : request;

    return needsInput(
      mergedRequest,
      coreMissing,
      buildMissingMessage(coreMissing, mergedRequest),
    );
  }

  if (!festival || !request.city) {
    return needsInput(
      request,
      ["festival", "city"],
      buildMissingMessage(["festival", "city"], request),
    );
  }

  let year: number;
  let festivalDates: FestivalDates | null;
  const previous = input.previousRequest;
  const canReusePreviousOccurrence =
    Boolean(previous?.year) &&
    Boolean(previous?.festivalDates) &&
    previous?.city === request.city &&
    (previous.canonicalFestival === festival || previous.festival === festival) &&
    (!extracted.yearWasExplicit || previous.year === extracted.year);

  try {
    if (canReusePreviousOccurrence && previous.year && previous.festivalDates) {
      year = previous.year;
      festivalDates = previous.festivalDates;
    } else if (
      canSkipRepeatOccurrenceResearch({
        previous,
        request,
        festival,
        extracted,
      }) &&
      previous?.year
    ) {
      year = previous.year;
      festivalDates = previous.festivalDates;
    } else {
      ({ year, festivalDates } = await resolveYearAndDates({
        festival,
        city: request.city,
        explicitYear: extracted.yearWasExplicit ? extracted.year : null,
        yearWasExplicit: extracted.yearWasExplicit,
        today,
      }));
    }
  } catch (error) {
    if (error instanceof FestivalNotHeldError) {
      return needsInput(
        { ...request, festival, canonicalFestival: festival },
        ["city"],
        error.message,
      );
    }

    throw error;
  }

  const resolvedRequest: PlanningRequest = {
    ...request,
    festival,
    canonicalFestival: festival,
    year,
    festivalDates,
  };

  const resolvedVisitDates = extracted.visitDates?.length
    ? await resolveVisitDates({
        year,
        visitDateMentions: extracted.visitDates,
      })
    : [];

  const withVisitDates = applyVisitDates(resolvedRequest, resolvedVisitDates);

  return validateReadyRequest(withVisitDates);
}
