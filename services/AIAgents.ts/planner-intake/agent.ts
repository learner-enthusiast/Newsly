import {
  festivalHasEnded,
  inclusiveDayCount,
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
import {
  emptyPlanningRequest,
  plannerIntakeResultSchema,
  type FestivalDates,
  type PlanningRequest,
  type PlannerIntakeResult,
} from "./schema";

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
    otherPreferences: Object.keys(extracted.otherPreferences).length
      ? extracted.otherPreferences
      : base.otherPreferences,
  };
}

function needsInput(
  request: PlanningRequest,
  missing: string[],
  message: string,
): PlannerIntakeResult {
  return plannerIntakeResultSchema.parse({
    status: "needs_input",
    message,
    request,
    missing,
  });
}

function ready(request: PlanningRequest): PlannerIntakeResult {
  return plannerIntakeResultSchema.parse({
    status: "ready",
    request,
  });
}

function missingCoreFields(
  request: PlanningRequest,
  festival: string | null,
  extracted: { festivalAmbiguous: boolean; cityAmbiguous: boolean },
): PlannerIntakeResult | null {
  if (extracted.festivalAmbiguous || !festival) {
    return needsInput(
      request,
      ["festival"],
      "Which festival should I plan?",
    );
  }

  if (extracted.cityAmbiguous || !request.city) {
    return needsInput(
      { ...request, festival, canonicalFestival: festival },
      ["city"],
      `Which city should I plan ${festival} in?`,
    );
  }

  return null;
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

function validateReadyRequest(request: PlanningRequest): PlannerIntakeResult {
  if (request.festivalDates && request.visitDates?.length) {
    if (!visitDatesWithinFestival(request.visitDates, request.festivalDates)) {
      return needsInput(
        request,
        ["visitDates"],
        `${request.festival} in ${request.city} is ${request.festivalDates.start} to ${request.festivalDates.end}. Your visit dates fall outside that period. Which dates within the festival would you like?`,
      );
    }
  }

  if (!request.durationDays && !request.visitDates?.length) {
    return needsInput(
      request,
      ["durationDays", "visitDates"],
      "How many days would you like to visit, or which dates would you like to go?",
    );
  }

  if (!request.festivalDates) {
    return needsInput(
      request,
      ["festivalDates"],
      `I could not verify official ${request.festival} dates for ${request.city} in ${request.year}. Can you confirm the festival dates?`,
    );
  }

  return ready(request);
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
  const coreMissing = missingCoreFields(request, festival, extracted);

  if (coreMissing) {
    return coreMissing;
  }

  if (!festival || !request.city) {
    return needsInput(request, ["festival", "city"], "Which festival and city should I plan?");
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

  const withVisitDates = applyVisitDates(
    resolvedRequest,
    await resolveVisitDates({
      year,
      visitDateMentions: extracted.visitDates,
    }),
  );

  return validateReadyRequest(withVisitDates);
}
