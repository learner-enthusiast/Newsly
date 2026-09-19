import { compareIsoDate } from "@/services/AIAgents.ts/planner-intake/dates";
import { extractFestivalFacts } from "./extract";
import {
  festivalFactsInputSchema,
  type FestivalFacts,
  type FestivalFactsInput,
} from "./schema";

function nullInvalidDateRange(facts: FestivalFacts): FestivalFacts {
  if (!facts.startDate || !facts.endDate) {
    return facts;
  }

  if (compareIsoDate(facts.startDate, facts.endDate) <= 0) {
    return facts;
  }

  return {
    ...facts,
    startDate: null,
    endDate: null,
  };
}

export async function runFestivalFactsAgent(
  input: FestivalFactsInput,
): Promise<FestivalFacts> {
  const parsed = festivalFactsInputSchema.parse(input);
  const facts = await extractFestivalFacts(parsed);

  return nullInvalidDateRange({
    ...facts,
    festivalName: facts.festivalName ?? parsed.festival,
    city: facts.city ?? parsed.city,
    year: facts.year ?? parsed.year,
  });
}
